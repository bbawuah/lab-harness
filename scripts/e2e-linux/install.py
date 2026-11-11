#!/usr/bin/env python3
"""Record the unmodified clone installer and the distro package inventory."""
import json
import os
from pathlib import Path
import platform
import resource
import shutil
import subprocess
import time

out = Path("/lab/results")
resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
started = time.monotonic()
with (out / "install.txt").open("w") as transcript:
    completed = subprocess.run(["./install.sh"], stdout=transcript, stderr=subprocess.STDOUT)
transcript_path = out / "install.txt"
transcript_path.write_text("\n".join(line.rstrip() for line in transcript_path.read_text().splitlines()) + "\n")
packages = subprocess.check_output(["dpkg-query", "-W", "curl", "unzip", "ca-certificates", "tar", "coreutils", "libc6", "libgcc-s1", "libstdc++6", "python3"], text=True)
(out / "packages.txt").write_text(packages)
result = {"command": "./install.sh", "sourceCommit": os.environ.get("TEST_SOURCE_COMMIT"), "uid": os.getuid(),
          "architecture": platform.machine(), "gitInstalled": shutil.which("git") is not None,
          "exitCode": completed.returncode, "seconds": round(time.monotonic() - started, 2)}
(out / "install-result.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result), flush=True)
raise SystemExit(completed.returncode)
