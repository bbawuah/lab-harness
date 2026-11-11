#!/usr/bin/env python3
"""Actual Linux PTY acceptance; loopback SSE is a protocol fixture, not inference."""
import argparse
import errno
import fcntl
import hashlib
import http.server
import json
import os
from pathlib import Path
import pty
import re
import resource
import select
import signal
import socket
import struct
import subprocess
import termios
import threading
import time
import uuid
import urllib.request


def rpc(path, method, params=None):
    request_id = str(uuid.uuid4())
    with socket.socket(socket.AF_UNIX) as client:
        client.settimeout(5)
        client.connect(path)
        client.sendall((json.dumps({"id": request_id, "method": method, "params": params or {}}) + "\n").encode())
        data = b""
        while b"\n" not in data:
            chunk = client.recv(65536)
            if not chunk or len(data) > 1024 * 1024:
                raise RuntimeError(f"{method}: incomplete or oversized response")
            data += chunk
    result = json.loads(data.split(b"\n", 1)[0])
    if result.get("id") != request_id or "error" in result:
        raise RuntimeError(f"{method}: {result}")
    return result["result"]


def processes():
    found = {}
    for directory in Path("/proc").glob("[0-9]*"):
        try:
            fields = (directory / "stat").read_text().rsplit(")", 1)[1].split()
            found[int(directory.name)] = {"state": fields[0], "parent": int(fields[1]),
                                          "command": (directory / "cmdline").read_bytes().replace(b"\0", b" ").decode(errors="replace")}
        except (FileNotFoundError, ProcessLookupError, PermissionError):
            continue
    return found


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="/lab/source")
    parser.add_argument("--out", required=True)
    parser.add_argument("--network", choices=["bridge", "none"], required=True)
    parser.add_argument("--single-pane", action="store_true")
    parser.add_argument("--fixture-only", action="store_true", help="Check only the fake SSE server; does not qualify LAB")
    args = parser.parse_args()
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    started = time.monotonic()
    source, out = Path(args.source), Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    home = Path(os.environ["HOME"])
    state = home / ".local/share/lab-harness/workspace"
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    state.chmod(0o700)
    project = Path("/lab/fixture")
    project.mkdir(exist_ok=True)
    (project / "README.md").write_text("# Linux fixture\nTODO: LINUX_SEARCH_MARKER\n")
    marker = project / "approval-marker.txt"
    marker.unlink(missing_ok=True)
    model_log, checks, captures, timings = [], {}, {}, {}

    def sanitized(value):
        text = value.replace(str(home), "$HOME")
        if re.search(r"/Users/|/private/var/|(?:gh[pousr]_|sk-)[A-Za-z0-9]{24,}", text):
            raise RuntimeError("Refusing to publish private host path or credential")
        return text

    def save(name, text):
        text = "\n".join(line.rstrip() for line in sanitized(text).splitlines()) + "\n"
        (out / name).write_text(text)
        captures[name] = hashlib.sha256(text.encode()).hexdigest()

    def check(name, condition):
        checks[name] = bool(condition)
        if not condition:
            raise AssertionError(name)

    class Model(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_POST(self):
            if self.path != "/v1/chat/completions" or len(model_log) >= 6:
                self.send_error(400, "fixture endpoint or request cap")
                return
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            messages = body.get("messages", [])
            last_user = max((i for i, message in enumerate(messages) if message["role"] == "user"), default=-1)
            tool_results = [message for message in messages[last_user + 1:] if message["role"] == "tool"]
            model_log.append({"path": self.path, "model": body.get("model"), "stream": body.get("stream"),
                              "toolsIncludeBash": any(tool.get("function", {}).get("name") == "bash" for tool in body.get("tools", [])),
                              "lastUser": messages[last_user].get("content") if last_user >= 0 else None,
                              "toolResults": [message.get("content") for message in tool_results]})
            command = "printf 'LINUX_TOOL_OK\\n' > approval-marker.txt; cat approval-marker.txt"
            arguments = json.dumps({"command": command})
            if not tool_results:
                deltas = [{"role": "assistant", "tool_calls": [{"index": 0, "id": "linux_call_1", "type": "function",
                          "function": {"name": "bash", "arguments": arguments[:20]}}]},
                          {"tool_calls": [{"index": 0, "function": {"arguments": arguments[20:]}}]}]
                finish = "tool_calls"
            else:
                deltas = [{"role": "assistant", "content": "LINUX_E2E_"}, {"content": "FINAL_OK"}]
                finish = "stop"
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Connection", "close")
            self.end_headers()
            for delta, ending in [(delta, None) for delta in deltas] + [({}, finish)]:
                chunk = {"id": "linux-fixture", "object": "chat.completion.chunk", "created": 1,
                         "model": "linux-e2e-fixture", "choices": [{"index": 0, "delta": delta, "finish_reason": ending}]}
                self.wfile.write(("data: " + json.dumps(chunk) + "\n\n").encode())
                self.wfile.flush()
                time.sleep(0.05)
            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Model)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    for name, value in {"route.json": json.dumps({"version": 1, "kind": "local", "endpoint": f"http://127.0.0.1:{server.server_port}/v1", "model": "linux-e2e-fixture"}), "key": ""}.items():
        path = state / name
        path.write_text(value)
        path.chmod(0o600)
    if args.fixture_only:
        messages = [{"role": "user", "content": "LINUX_E2E_PROMPT"}]

        def completion():
            body = {"model": "linux-e2e-fixture", "stream": True, "messages": messages,
                    "tools": [{"type": "function", "function": {"name": "bash"}}]}
            request = urllib.request.Request(f"http://127.0.0.1:{server.server_port}/v1/chat/completions",
                                             data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(request, timeout=5) as response:
                return [json.loads(line[6:]) for line in response.read().decode().splitlines()
                        if line.startswith("data: ") and line != "data: [DONE]"]

        try:
            chunks = completion()
            arguments = "".join(chunk["choices"][0]["delta"]["tool_calls"][0]["function"].get("arguments", "")
                                for chunk in chunks if "tool_calls" in chunk["choices"][0]["delta"])
            check("fragmentedToolArguments", "approval-marker.txt" in json.loads(arguments)["command"])
            messages.append({"role": "tool", "tool_call_id": "linux_call_1", "content": "SYNTHETIC_SELFTEST_RESULT"})
            final = "".join(chunk["choices"][0]["delta"].get("content", "") for chunk in completion())
            check("streamedFinalText", final == "LINUX_E2E_FINAL_OK")
            check("privateRouteAndKey", all((state / name).stat().st_mode & 0o777 == 0o600 for name in ["route.json", "key"]))
            save("result.json", json.dumps({"ok": True, "kind": "fixture self-test only; no LAB process or tool execution",
                                            "checks": checks, "seconds": round(time.monotonic() - started, 2)}, indent=2) + "\n")
            print("Loopback fixture self-test passed; LAB remains unqualified.", flush=True)
            return 0
        finally:
            server.shutdown()
            server.server_close()
    command = [str(source / "lab"), "--project", str(project)]
    if args.single_pane:
        command.append("--single-pane")
    # Deliberately omit --offline: network-none must also support ordinary launch.
    before_runs = set((state / "runs").glob("*"))
    sentinel = subprocess.Popen(["sleep", "600"])
    pid, terminal = pty.fork()
    if pid == 0:
        os.chdir(project)
        os.execve(command[0], command, {"HOME": str(home), "PATH": "/usr/bin:/bin", "SHELL": "/bin/bash",
                                      "TERM": "xterm-256color", "LANG": "C.UTF-8"})
    fcntl.ioctl(terminal, termios.TIOCSWINSZ, struct.pack("HHHH", 60, 180, 0, 0))
    os.kill(pid, signal.SIGWINCH)
    raw = bytearray()
    drain_stop = threading.Event()

    def drain():
        while not drain_stop.is_set():
            if not select.select([terminal], [], [], 0.1)[0]:
                continue
            try:
                data = os.read(terminal, 65536)
                if not data:
                    return
                raw.extend(data)
                if b"\x1b[6n" in data:
                    os.write(terminal, b"\x1b[1;1R")
                if b"\x1b]11;?" in data:
                    os.write(terminal, b"\x1b]11;rgb:1111/1111/1111\x1b\\")
            except OSError as error:
                if error.errno not in (errno.EIO, errno.EBADF):
                    raise
                return

    reader = threading.Thread(target=drain, daemon=True)
    reader.start()
    socket_path, pane, run, exit_code, failure = None, None, None, None, None

    def screen():
        return rpc(socket_path, "pane.read", {"pane_id": pane, "source": "visible", "lines": 60, "format": "text", "strip_ansi": True})["read"]["text"]

    def wait(text, seconds=60):
        deadline, last = time.monotonic() + seconds, ""
        while time.monotonic() < deadline:
            last = screen()
            if text in last:
                return last
            time.sleep(0.2)
        save("failure-screen.txt", last)
        raise TimeoutError(f"Missing visible text: {text}")

    def send(text):
        # Input goes through the native Herdr client attached to the outer PTY.
        os.write(terminal, text.encode())
        time.sleep(0.25)
        os.write(terminal, b"\r")

    def reap(seconds):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            waited, status = os.waitpid(pid, os.WNOHANG)
            if waited:
                return os.waitstatus_to_exitcode(status)
            time.sleep(0.1)
        return None

    try:
        check("nonRoot", os.getuid() != 0)
        check("linuxX86_64", os.uname().sysname == "Linux" and os.uname().machine == "x86_64")
        check("noExternalInterface" if args.network == "none" else "bridgeInterface", (set(os.listdir("/sys/class/net")) == {"lo"}) == (args.network == "none"))
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline and not socket_path:
            waited, status = os.waitpid(pid, os.WNOHANG)
            if waited:
                exit_code = os.waitstatus_to_exitcode(status)
                raise RuntimeError(f"LAB exited before opening Herdr: {exit_code}")
            runs = set((state / "runs").glob("*")) - before_runs
            if runs:
                run = sorted(runs)[-1]
                for log in run.glob("cfg/herdr/sessions/*/herdr-server.log"):
                    match = re.search(r"api server listening path=(\S+)", log.read_text())
                    if match:
                        socket_path = match[1]
            time.sleep(0.2)
        check("herdrSocket", socket_path is not None)
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline and not pane:
            workspaces = rpc(socket_path, "workspace.list")["workspaces"]
            if workspaces:
                panes = rpc(socket_path, "pane.list", {"workspace_id": workspaces[0]["workspace_id"]})["panes"]
                pane = next((item["pane_id"] for item in panes if item.get("label") == "Pi interactive"), None)
                if not pane and any(item.get("pane_id") == "w1:p2" for item in panes):
                    pane = "w1:p2"
            time.sleep(0.2)
        check("piPane", pane is not None)
        # Trust is an operator decision in the isolated fixture, never a product bypass.
        deadline = time.monotonic() + 120
        trusted = False
        while time.monotonic() < deadline:
            visible = screen()
            if "Trust project folder?" in visible and not trusted:
                save("trust.txt", visible)
                os.write(terminal, b"\r")
                trusted = True
            if "Relay ready" in visible:
                break
            time.sleep(0.2)
        else:
            save("failure-screen.txt", visible)
            raise TimeoutError("TUI did not reach Relay ready")
        timings["startupSeconds"] = round(time.monotonic() - started, 2)
        save("startup.txt", visible)
        check("tuiStarts", "Powered by Pi" in visible)
        check("defaultAsk", "mode: ask" in visible)
        check("regularShellPane", args.single_pane or len(panes) == 2)
        send("LINUX_E2E_PROMPT: run the fixture shell command then finish.")
        save("approval.txt", wait("Allow once", 120))
        check("promptReachedFixture", len(model_log) == 1 and "LINUX_E2E_PROMPT" in json.dumps(model_log[0]["lastUser"]))
        check("streamingChatCompletions", model_log[0]["stream"] is True and model_log[0]["toolsIncludeBash"])
        check("noMutationBeforeApproval", not marker.exists())
        os.write(terminal, b"\r")
        save("tool-final.txt", wait("LINUX_E2E_FINAL_OK", 120))
        check("approvedToolRan", marker.read_text() == "LINUX_TOOL_OK\n")
        check("toolResultRoundTrip", len(model_log) == 2 and "LINUX_TOOL_OK" in json.dumps(model_log[1]["toolResults"]))
        timings["toolRoundTripSeconds"] = round(time.monotonic() - started - timings["startupSeconds"], 2)
        for text, expected, filename in [
            ("/lab-search LINUX_SEARCH_MARKER", "TODO: LINUX_SEARCH_MARKER", "search.txt"),
            ("/lab-files README", '"path": "README.md"', "files.txt"),
            ("/lab-skills", "terminal-evidence", "skills.txt"),
            ("/relay-peers", '"self": true', "peers.txt"),
        ]:
            send(text)
            save(filename, wait(expected))
            check(text.split()[0], True)
        check("slashCommandsMakeNoModelRequest", len(model_log) == 2)
        send("/exit")
        exit_code = reap(45)
        check("exitZero", exit_code == 0)
        attachment = json.loads((run / "attachment.json").read_text())
        save("attachment.json", json.dumps(attachment, indent=2) + "\n")
        check("attachmentCleanup", not attachment["failed"] and all(value is True for value in attachment["cleanup"].values()))
        remaining = processes()
        owned_pids = [attachment.get(name) for name in ["serverPid", "clientPid", "shellPid", "regularShellPid"]]
        check("ownedPidsGone", all(owned_pid is None or owned_pid not in remaining for owned_pid in owned_pids))
        check("socketDirectoryRemoved", not Path(socket_path).parent.exists())
        check("unrelatedProcessSurvives", sentinel.poll() is None)
    except Exception as error:
        failure = sanitized(f"{type(error).__name__}: {error}")
    finally:
        if exit_code is None:
            os.kill(pid, signal.SIGTERM)
            exit_code = reap(15)
            if exit_code is None:
                os.kill(pid, signal.SIGKILL)
                exit_code = reap(5)
        if run and (run / "attachment.json").exists() and "attachment.json" not in captures:
            save("attachment.json", (run / "attachment.json").read_text())
        if failure:
            tail = bytes(raw).decode(errors="replace")[-10000:]
            tail = re.sub(r"\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -/]*[@-~]", "", tail)
            save("failure-pty.txt", tail)
        drain_stop.set()
        reader.join(timeout=1)
        os.close(terminal)
        sentinel.terminate()
        sentinel.wait(timeout=5)
        server.shutdown()
        server.server_close()
        save("model.json", json.dumps(model_log, indent=2) + "\n")
        result = {"ok": failure is None, "failure": failure, "sourceCommit": os.environ.get("TEST_SOURCE_COMMIT"),
                  "platform": "linux-x86_64", "uid": os.getuid(), "network": args.network, "command": command,
                  "testKind": "real Pi + Herdr, outer PTY input, scripted loopback SSE; no model inference",
                  "interfaces": os.listdir("/sys/class/net"), "modelRequests": len(model_log), "seconds": round(time.monotonic() - started, 2),
                  "timings": timings, "exitCode": exit_code, "checks": checks, "files": captures}
        save("result.json", json.dumps(result, indent=2) + "\n")
        print(json.dumps({key: result[key] for key in ["ok", "failure", "network", "seconds", "checks"]}), flush=True)
    return 0 if failure is None else 1


if __name__ == "__main__":
    raise SystemExit(main())
