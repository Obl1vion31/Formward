#!/usr/bin/env bash
set -euo pipefail
chain=/etc/formward/tls/current/fullchain.pem
expected=$(openssl x509 -in "$chain" -noout -fingerprint -sha256)
openssl x509 -in "$chain" -noout -checkend 1209600 >/dev/null
deadline=$((SECONDS+15))
for host in formward.top www.formward.top cn.formward.top origin.formward.top; do
 openssl x509 -in "$chain" -noout -checkhost "$host" >/dev/null
 matched=0
 while (( SECONDS < deadline )); do
  # reload返回时新worker可能尚未接管；短暂重试实际握手，绝不跳过信任链或主机名校验。
  handshake=''
  if handshake=$(timeout 3 openssl s_client -connect 127.0.0.1:8443 -servername "$host" -verify_return_error -verify_hostname "$host" </dev/null 2>/dev/null); then
   served=$(openssl x509 -noout -fingerprint -sha256 <<<"$handshake" 2>/dev/null) || served=''
   if [[ "$served" == "$expected" ]]; then matched=1; break; fi
  fi
  sleep 0.25
 done
 [[ $matched -eq 1 ]] || { echo '实际握手未在期限内切换到已安装证书。' >&2; exit 1; }
done
echo '四个域名实际握手、信任链、主机名与安装证书一致，剩余期限超过十四天。'
