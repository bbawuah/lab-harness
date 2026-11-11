#!/usr/bin/env python3
"""Bounded pinned-runtime probes after install failure; no product source edits."""
import json
import os
from pathlib import Path
import resource
import subprocess
import time

resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
bun = "/lab/source/.tmp/bun/1.4.2/bun"
out = Path("/lab/results/diagnostics")
out.mkdir(exist_ok=True)
probes = {
    "version": ["--version"],
    "javascript": ["-e", 'console.log("JS_OK")'],
    "ffi-import": ["-e", 'import { dlopen } from "bun:ffi"; console.log(typeof dlopen)'],
    "ffi-libc": ["-e", 'import { dlopen, FFIType } from "bun:ffi"; const lib = dlopen("/lib/x86_64-linux-gnu/libc.so.6", { __errno_location: { args: [], returns: FFIType.ptr } }); console.log("DLOPEN_OK"); lib.close();'],
    "relay-import": ["-e", 'import { assertPublishCapability } from "./vendor/relay/src/storage/publish.ts"; console.log(typeof assertPublishCapability)'],
    "relay-capability": ["-e", 'import { assertPublishCapability } from "./vendor/relay/src/storage/publish.ts"; assertPublishCapability(); console.log("RELAY_OK")'],
}
results = {}
for name, arguments in probes.items():
    command = [bun, "--no-env-file", "--no-install", *arguments]
    started = time.monotonic()
    try:
        result = subprocess.run(command, cwd="/lab/source", text=True, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, timeout=30)
        output, code = result.stdout, result.returncode
    except subprocess.TimeoutExpired:
        output, code = "Probe exceeded 30 seconds.\n", "timeout"
    (out / f"{name}.txt").write_text("\n".join(line.rstrip() for line in output.splitlines()) + "\n")
    results[name] = {"command": command, "exitCode": code, "seconds": round(time.monotonic() - started, 2)}
(out / "result.json").write_text(json.dumps({"sourceCommit": os.environ.get("TEST_SOURCE_COMMIT"), "probes": results}, indent=2) + "\n")
print(json.dumps(results), flush=True)
