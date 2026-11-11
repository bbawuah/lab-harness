#!/bin/sh
# Copies only committed source. The driver lives outside the tested publication.
set -eu
docker() {
  if [ -n "${LAB_E2E_DOCKER_CONTEXT:-}" ]; then
    command docker --context "$LAB_E2E_DOCKER_CONTEXT" "$@"
  else
    command docker "$@"
  fi
}
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd -P)
ref=${1:-HEAD}
out=${2:-"$root/.tmp/linux-e2e-$(date +%Y%m%d-%H%M%S)"}
commit=$(git -C "$root" rev-parse "$ref^{commit}")
case "$out" in /*) ;; *) out="$PWD/$out";; esac
mkdir -p "$out"
printf '%s\n' "${LAB_E2E_DOCKER_CONTEXT:-default}" > "$out/docker-context.txt"
tag="lab-linux-e2e-$$"
online="$tag-online"
offline="$tag-offline"
data="$tag-data"
cleanup() {
  docker rm -f "$online" "$offline" >/dev/null 2>&1 || true
  docker volume rm "$data" >/dev/null 2>&1 || true
  docker image rm "$tag-base" >/dev/null 2>&1 || true
}
trap cleanup EXIT HUP INT TERM
docker build --platform linux/amd64 -t "$tag-base" "$root/scripts/e2e-linux" > "$out/image-build.txt" 2>&1
docker image inspect amd64/ubuntu:24.04 --format '{{json .RepoDigests}}' > "$out/base-image.json"
docker volume create "$data" > /dev/null
docker run --platform linux/amd64 --mount "type=volume,source=$data,target=/lab" --name "$online" -d -e TEST_SOURCE_COMMIT="$commit" "$tag-base" > /dev/null
git -C "$root" archive "$commit" | docker exec -i "$online" tar -x -C /lab/source
install_status=0
docker exec "$online" python3 /lab/test/install.py || install_status=$?
online_status=skipped
offline_status=skipped
fixture_status=0
docker exec "$online" python3 /lab/test/smoke.py --network bridge --fixture-only --out /lab/results/fixture-selftest || fixture_status=$?
if [ "$install_status" = 0 ]; then
  online_status=0
  docker exec "$online" python3 /lab/test/smoke.py --network bridge --out /lab/results/online || online_status=$?
  docker run --platform linux/amd64 --network none --mount "type=volume,source=$data,target=/lab" --name "$offline" -d -e TEST_SOURCE_COMMIT="$commit" "$tag-base" > /dev/null
  docker inspect "$offline" --format '{{.HostConfig.NetworkMode}}' > "$out/offline-network.txt"
  offline_status=0
  docker exec "$offline" python3 /lab/test/smoke.py --network none --out /lab/results/offline || offline_status=$?
  docker cp "$offline:/lab/results/." "$out/"
else
  online_status=0
  docker exec "$online" python3 /lab/test/smoke.py --network bridge --out /lab/results/startup-after-failed-install || online_status=$?
  docker exec "$online" python3 /lab/test/diagnose.py
  docker cp "$online:/lab/results/." "$out/"
fi
printf '{"sourceCommit":"%s","installExitCode":%s,"fixtureExitCode":%s,"startupExitCode":%s,"offlineExitCode":"%s"}\n' "$commit" "$install_status" "$fixture_status" "$online_status" "$offline_status" > "$out/runner-result.json"
printf 'Source: %s\nResults: %s\nInstall: %s Fixture: %s Startup: %s Offline: %s\n' "$commit" "$out" "$install_status" "$fixture_status" "$online_status" "$offline_status"
test "$install_status" = 0 && test "$fixture_status" = 0 && test "$online_status" = 0 && test "$offline_status" = 0
