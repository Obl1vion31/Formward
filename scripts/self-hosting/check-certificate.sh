#!/usr/bin/env bash
set -euo pipefail
chain=/etc/formward/tls/current/fullchain.pem
for host in formward.top www.formward.top cn.formward.top origin.formward.top; do
 openssl x509 -in "$chain" -noout -checkhost "$host" >/dev/null
 served=$(printf '' | openssl s_client -connect 127.0.0.1:8443 -servername "$host" -verify_return_error -verify_hostname "$host" 2>/dev/null | openssl x509 -noout -fingerprint -sha256)
 expected=$(openssl x509 -in "$chain" -noout -fingerprint -sha256)
 [[ "$served" == "$expected" ]] || { echo '实际握手证书与安装证书不同。' >&2; exit 1; }
done
openssl x509 -in "$chain" -noout -checkend 1209600
