"""Validate recorded media. --check is read-only and needs no local font or wheel."""
import argparse
import hashlib
import json
import platform
import re
import runpy
import subprocess
import textwrap
from pathlib import Path

import PIL
from PIL import Image, ImageFont, features

ROOT = Path(__file__).resolve().parents[2]
MEDIA = ROOT / "docs/media"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Validate existing assets without writing provenance")
    parser.add_argument("--font", help="Local font, required only when authoring provenance")
    args = parser.parse_args()
    baseline = json.loads((MEDIA / "PROVENANCE.json").read_text())
    if args.check:
        layout = baseline["rendering"]
        cell = layout["cellWidth"]
    else:
        if not args.font:
            parser.error("--font is required when authoring provenance")
        cell = ImageFont.truetype(args.font, 15).getlength("M")
        layout = dict(cellWidth=cell, bodyX=24, bodyY=105, lineHeight=21, wrapColumns=75)
    require(8 <= cell <= 10 and layout == dict(cellWidth=cell, bodyX=24, bodyY=105, lineHeight=21, wrapColumns=75), "Unexpected capture layout")

    # Exercise the capture sanitizer; importing this module starts no capture/process.
    capture = runpy.run_path(str(ROOT / "docs/demos/capture.py"))
    sanitize, aliases = capture["sanitize"], capture["ALIASES"]
    package = "/" + "srv/custom/pi-package"
    aliases[package] = "[PI_PACKAGE]"
    require(sanitize(package + "/docs/models.md") == "[PI_PACKAGE]/docs/models.md", "Package alias failed")
    for private in ["/" + "home/test/private.txt", "/" + "srv/unaliased/private.txt", "C:" + chr(92) + "Users" + chr(92) + "test" + chr(92) + "private.txt"]:
        try:
            sanitize(private)
        except ValueError:
            continue
        raise ValueError("Unaliased private path was accepted")
    uuid = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)
    for path in MEDIA.iterdir():
        if path.suffix not in [".json", ".txt"]:
            continue
        text = path.read_text()
        require(not uuid.search(text), f"Published UUID: {path.name}")
        require(not re.search("/" + "(?:Users|home)/[a-zA-Z0-9_.-]+/", text), f"Private path: {path.name}")
        require(not re.search(r'"(?:session|workerPid|paneId|runDirectory|serverLog|processInfo)"\s*:', text), f"Private process metadata: {path.name}")

    commands = {record["name"]: record for record in json.loads((MEDIA / "commands.json").read_text())}
    expected = {"startup", "palette-dark", "palette-light", "terminal-demo", "show-before", "test-operator-accept", "search", "context", "verify-before", "verify-after", "skills", "skill-select"}
    require(set(commands) == expected, "Incomplete command capture ledger")
    require(all(record["exitCode"] == (1 if name == "verify-after" else 0) for name, record in commands.items()), "Unexpected capture exit status")
    startup = json.loads((MEDIA / "pi-startup.json").read_text())
    require(startup["promptSubmitted"] is False and startup["nativeLabActivation"] == "blocked-unqualified" and startup["taskAcceptance"] == "unchanged", "Pi observation exceeded UI-only scope")
    require(all(startup["cleanup"].get(key) is True for key in ["paneCloseAcknowledged", "serverStopAcknowledged", "serverExited", "socketsRemoved", "workerStopped"]), "Owned startup cleanup unverified")
    terminal = json.loads((MEDIA / "terminal-output.json").read_text())
    accepted = json.loads((MEDIA / "test-operator-accept.json").read_text())
    require(terminal["state"] == "result_available" and terminal["acceptance"] is None and terminal["actualModelCalls"] == 0, "Result availability was conflated with acceptance")
    require(accepted["state"] == "accepted" and accepted["acceptance"]["reason"], "Separate test-operator acceptance missing")
    search = json.loads((MEDIA / "search-output.json").read_text())
    require(search["before"]["valid"] is True and search["after"]["error"] == "STALE_CONTEXT_SOURCE", "Stale context refusal missing")
    source_hash = hashlib.sha256(search["initialBytes"].encode()).hexdigest()
    require(all(hit["contentHash"] == source_hash for hit in search["search"]["hits"]), "Captured source hash does not match fixture bytes")

    assets = {}
    for path in sorted(MEDIA.iterdir()):
        if path.suffix not in [".png", ".gif"]:
            continue
        with Image.open(path) as image:
            image.load()
            require(image.width == 728, f"Unexpected image width: {path.name}")
            item = dict(bytes=path.stat().st_size, sha256=sha(path), width=image.width, height=image.height)
            if path.suffix == ".gif":
                durations = []
                for index in range(image.n_frames):
                    image.seek(index)
                    image.load()
                    durations.append(image.info["duration"])
                require(path.stat().st_size < 2_000_000 and durations == [6000] * 3, f"GIF size/timing changed: {path.name}")
                scenes = json.loads(path.with_suffix(".json").read_text())["scenes"]
                require(len(scenes) == 3 and [s["durationMs"] for s in scenes] == durations, "Scene timing differs from decoded GIF")
                transcript = "\n\n".join(s["title"] + "\n" + s["caption"] + "\n" + s["text"] for s in scenes) + "\n"
                require(path.with_suffix(".txt").read_text() == transcript, "Full display transcript differs from scenes")
                for scene in scenes:
                    lines = []
                    for line in scene["text"].splitlines():
                        lines.extend(textwrap.wrap(line, 75, replace_whitespace=False, drop_whitespace=False) or [""])
                    require(max(map(len, lines)) * cell + 24 < 728 and 105 + len(lines) * 21 <= image.height - 29, "Captured text exceeds frame bounds")
                item.update(frames=image.n_frames, frameDurationsMs=durations, durationMs=sum(durations))
            assets[path.name] = item
    require(set(assets) == {"header-dark.png", "header-light.png", "pi-startup-text.png", "terminal-lifecycle.gif", "offline-search.gif", "skills-discovery.gif"}, "Unexpected media asset set")

    # Decode PNG pixels and independently verify both ANSI half-cell colors.
    samples = 0
    for mode in ["dark", "light"]:
        image = Image.open(MEDIA / f"header-{mode}.png").convert("RGB")
        default = (232, 236, 239) if mode == "dark" else (32, 39, 44)
        canvas = (17, 21, 24) if mode == "dark" else (250, 250, 250)
        for row, line in enumerate((MEDIA / f"header-{mode}.ansi.txt").read_text().splitlines()):
            foreground, background, column = default, canvas, 0
            for token in re.findall(r"\x1b\[[0-9;]*m|[^\x1b]", line):
                if token.startswith("\x1b"):
                    codes, index = [int(value) for value in token[2:-1].split(";")], 0
                    while index < len(codes):
                        if codes[index] in [38, 48]:
                            require(index + 2 < len(codes) and codes[index + 1] == 5 and 232 <= codes[index + 2] <= 255, "Non-neutral ANSI palette")
                            color = (8 + 10 * (codes[index + 2] - 232),) * 3
                            if codes[index] == 38:
                                foreground = color
                            else:
                                background = color
                            index += 3
                        else:
                            require(codes[index] == 0, "Unexpected ANSI control")
                            foreground, background = default, canvas
                            index += 1
                else:
                    if column < 18 and token in "▀▄ ":
                        top = foreground if token == "▀" else background
                        bottom = foreground if token == "▄" else background
                        for offset, color in [(5, top), (16, bottom)]:
                            require(image.getpixel((round(24 + (column + .5) * cell), 105 + row * 21 + offset)) == color, "ANSI color/half-cell rendering mismatch")
                            samples += 1
                    column += 1
    require(samples == 864, "Incomplete palette sampling")
    runtime = json.loads((MEDIA / "capture-runtime.json").read_text())
    # These are historical captures, not observations of today's runtime. Keep
    # their original identities and verify the exact source commit, even when
    # current implementation files have changed. CI checks out full history.
    require(runtime["sourceSHA"] == "93a831c4dbfe774f3c4a025f7c70334ae0f3e6b4", "Unexpected historical capture commit")
    for path, value in runtime["sourceFiles"].items():
        captured_bytes = subprocess.run(["git", "show", f'{runtime["sourceSHA"]}:{path}'], cwd=ROOT, check=True, capture_output=True).stdout
        require(hashlib.sha256(captured_bytes).hexdigest() == value, f"Historical capture source mismatch: {path}")
    if args.check:
        require(assets == baseline["assets"] and runtime["sourceSHA"] == baseline["sourceSHA"], "Media provenance mismatch")
        require(sha(ROOT / baseline["renderer"]["path"]) == baseline["renderer"]["sha256"] and sha(ROOT / baseline["captures"]["path"]) == baseline["captures"]["sha256"], "Capture/render source identity changed")
    else:
        wheel = next((ROOT / ".tmp/media/wheels").glob("pillow-12.0.0-*.whl"))
        provenance = dict(sourceSHA=runtime["sourceSHA"], captureDate="2026-10-29", host=runtime["host"], bun=runtime["bun"], node=runtime["node"], python=platform.python_version(), pillow=PIL.__version__, freetype=features.version("freetype2"), wheel=dict(name=wheel.name, sha256=sha(wheel), origin="PyPI Pillow 12.0.0 official distribution"), font=dict(name=Path(args.font).name, sha256=sha(Path(args.font)), redistributed=False), rendering=layout, sourceFiles=runtime["sourceFiles"], renderer=dict(path="docs/demos/render.py", sha256=sha(ROOT / "docs/demos/render.py")), captures=dict(path="docs/demos/capture.py", sha256=sha(ROOT / "docs/demos/capture.py")), assets=assets, audit=dict(ansiCellHalfSamples=samples, privatePathRefusal=True, noPublishedUUIDs=True, frameBounds=True, visualInspection=baseline["audit"]["visualInspection"]))
        (MEDIA / "PROVENANCE.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print(json.dumps(dict(mode="read-only-check" if args.check else "author-provenance", assets=len(assets), decodedGifFrames=9, gifDurationsMs=[18000] * 3, ansiCellHalfSamples=samples, privatePathRefusal=True)))


if __name__ == "__main__":
    main()
