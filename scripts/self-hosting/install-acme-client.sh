#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $EUID -eq 0 && $# -eq 2 && $1 == --apply ]] || { echo '用法：sudo install-acme-client.sh --apply 官方归档路径' >&2; exit 1; }
archive=$(realpath -- "$2")
sha=ddbe1bcbd1a44a2623a2af167ebdc678669e6e2eb396742f2d1d28e02dc14220
revision=807da6498377ee5e0cf43a78091f46f12dc59a89
printf '%s  %s\n' "$sha" "$archive" | sha256sum -c - >/dev/null
root=/opt/formward-acme
[[ ! -e "$root/acme.sh" || -L "$root/acme.sh" ]] || { echo '拒绝接管既有ACME安装。' >&2; exit 1; }
install -d -m 0700 "$root/releases" /var/lib/formward/acme
target="$root/releases/$revision"
if [[ ! -e "$target" ]]; then
 stage=$(mktemp -d "$root/releases/.install.XXXXXXXX")
 python3 - "$archive" "$stage" <<'PY'
import pathlib,sys,tarfile
with tarfile.open(sys.argv[1],"r:gz") as archive: archive.extractall(sys.argv[2],filter="data")
PY
 source="$stage/acme.sh-$revision"
 test -f "$source/acme.sh"
 mv -- "$source" "$target"
 rmdir -- "$stage"
 chmod -R go-rwx "$target"
fi
ln -sfn "$target/acme.sh" "$root/acme.sh"
install -d -m 0700 /var/lib/formward/acme/dnsapi
install -m 0600 "$target/dnsapi/dns_tencent.sh" /var/lib/formward/acme/dnsapi/dns_tencent.sh
"$root/acme.sh" --version | tail -1 | grep -Fx 'v3.1.6'
