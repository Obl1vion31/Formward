#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $EUID -eq 0 && $# -eq 1 && $1 == --apply ]] || { echo '须通过配置了私有EnvironmentFile的受控服务执行 --apply。' >&2; exit 1; }
[[ -n "${Tencent_SecretId:-}" && -n "${Tencent_SecretKey:-}" ]] || { echo '缺少限定formward.top权限的DNS接口配置。' >&2; exit 1; }
test -x /opt/formward-acme/acme.sh
install -d -m 0700 /etc/formward/tls/staged /var/lib/formward/acme-staging/dnsapi
install -m 0600 /var/lib/formward/acme/dnsapi/dns_tencent.sh /var/lib/formward/acme-staging/dnsapi/dns_tencent.sh
domains=(-d formward.top -d www.formward.top -d cn.formward.top -d origin.formward.top)
/opt/formward-acme/acme.sh --issue --home /var/lib/formward/acme-staging --server letsencrypt_test --dns dns_tencent --dnssleep 180 --keylength ec-256 "${domains[@]}"
/opt/formward-acme/acme.sh --issue --home /var/lib/formward/acme --server letsencrypt --dns dns_tencent --dnssleep 60 --keylength ec-256 "${domains[@]}"
/opt/formward-acme/acme.sh --install-cert --home /var/lib/formward/acme --ecc -d formward.top --key-file /etc/formward/tls/staged/privkey.pem --fullchain-file /etc/formward/tls/staged/fullchain.pem --reloadcmd '/usr/local/lib/formward/install-certificate.sh --apply /etc/formward/tls/staged/fullchain.pem /etc/formward/tls/staged/privkey.pem'
