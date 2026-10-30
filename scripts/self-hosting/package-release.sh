#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"
exec node --import tsx scripts/self-hosting/build-regional-release.mts "${1:?需要唯一发布标识}"
