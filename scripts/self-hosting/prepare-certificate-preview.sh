#!/usr/bin/env bash
# 仅准备回环HTTPS；不添加网站DNS，不开放公网端口。
set -euo pipefail
umask 077
[[ $EUID -eq 0 && $# -eq 1 && $1 == --apply ]] || { echo '用法：sudo prepare-certificate-preview.sh --apply' >&2; exit 1; }
prepared=/etc/formward/nginx-regional.conf.prepared
test -f "$prepared"
grep -q '^# formward-managed-regional-v1$' "$prepared"
python3 - "$prepared" <<'PY'
import pathlib,re,sys
text=pathlib.Path(sys.argv[1]).read_text()
listeners=re.findall(r'^\s*listen\s+([^;]+);',text,re.M)
assert listeners and all(re.fullmatch(r'127\.0\.0\.1:8443 ssl(?: default_server)?',line.strip()) for line in listeners),'只允许回环8443。'
PY
install -d -m 0700 /var/lib/formward
log=/var/lib/formward/certificate-issue.log
report=/var/lib/formward/certificate-issue-result.json
printf '{"stage":"issuing","passed":false}\n' > "$report"
issued=0
/usr/local/lib/formward/issue-certificate.sh --apply > "$log" 2>&1 || issued=$?
# acme.sh的2表示已有证书未到续期时间；其他错误不冒充签发成功。
if [[ $issued -ne 0 && $issued -ne 2 ]] || [[ ! -f /etc/formward/tls/current/fullchain.pem ]]; then
 printf '{"stage":"issuance_failed","passed":false}\n' > "$report"; exit 1
fi
python3 - <<'PY'
from pathlib import Path
for home in ('acme','acme-staging'):
 file=Path('/var/lib/formward')/home/'account.conf'
 if file.exists():
  rows=[line for line in file.read_text().splitlines() if not line.startswith('AUTO_UPGRADE=')]
  file.write_text('\n'.join(rows)+"\nAUTO_UPGRADE='0'\n");file.chmod(0o600)
PY
config=/etc/nginx/conf.d/formward-regional-tls.conf
old=''
if [[ -e "$config" ]]; then
 grep -q '^# formward-managed-regional-v1$' "$config"
 old=$(mktemp /etc/formward/nginx-tls-before.XXXXXXXX)
 cp -p -- "$config" "$old"
fi
install -m 0644 -o root -g root "$prepared" "$config"
if ! nginx -t >> "$log" 2>&1 || ! systemctl reload nginx >> "$log" 2>&1; then
 if [[ -n "$old" ]]; then cp -p -- "$old" "$config"; else rm -- "$config"; fi
 nginx -t >> "$log" 2>&1 && systemctl reload nginx >> "$log" 2>&1 || true
 [[ -z "$old" ]] || rm -- "$old"
 printf '{"stage":"nginx_failed","passed":false}\n' > "$report"; exit 1
fi
[[ -z "$old" ]] || rm -- "$old"
/usr/local/lib/formward/check-certificate.sh >> "$log" 2>&1
printf '{"stage":"certificate_and_private_handshake","passed":true,"privatePort":8443,"issueExit":%s}\n' "$issued" > "$report"
