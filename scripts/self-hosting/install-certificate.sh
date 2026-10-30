#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $EUID -eq 0 && $# -eq 3 && $1 == --apply ]] || { echo '用法：sudo install-certificate.sh --apply fullchain.pem privkey.pem' >&2; exit 1; }
chain=$(realpath -- "$2") key=$(realpath -- "$3")
[[ -f "$chain" && -f "$key" ]] || exit 1
for host in formward.top www.formward.top cn.formward.top origin.formward.top; do
 openssl x509 -in "$chain" -noout -checkhost "$host" >/dev/null
done
openssl x509 -in "$chain" -noout -checkend 86400 >/dev/null
[[ $(openssl x509 -in "$chain" -pubkey -noout | openssl pkey -pubin -outform DER | sha256sum) == $(openssl pkey -in "$key" -pubout -outform DER | sha256sum) ]] || { echo '证书与私钥不匹配。' >&2; exit 1; }
root=/etc/formward/tls
install -d -o root -g root -m 0700 "$root/versions"
target=$(mktemp -d "$root/versions/cert.XXXXXXXX")
install -m 0600 -o root -g root "$chain" "$target/fullchain.pem"
install -m 0600 -o root -g root "$key" "$target/privkey.pem"
old=''
[[ ! -L "$root/current" ]] || old=$(readlink -f "$root/current")
[[ ! -e "$root/current" || -L "$root/current" ]] || exit 1
ln -s "$target" "$root/.next"
mv -Tf "$root/.next" "$root/current"
if nginx -t && systemctl reload nginx; then
 echo '证书已验证并安装。'
else
 if [[ -n "$old" ]]; then ln -s "$old" "$root/.restore"; mv -Tf "$root/.restore" "$root/current"; nginx -t && systemctl reload nginx; else rm -- "$root/current"; fi
 echo '证书启用失败，已恢复之前的证书入口。' >&2
 exit 1
fi
