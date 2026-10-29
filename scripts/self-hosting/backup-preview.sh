#!/usr/bin/env bash
# formward-self-hosting-managed-v1
set -euo pipefail
umask 077

if [[ $EUID -ne 0 ]]; then
    printf '%s\n' '备份脚本需要 root 权限。' >&2
    exit 1
fi

backup_dir=/var/backups/formward
if [[ ! -d "$backup_dir" || -L "$backup_dir" || $(stat -c '%u:%a' "$backup_dir") != 0:700 ]]; then
    printf '%s\n' '备份目录必须是 root 所有的 0700 普通目录。' >&2
    exit 1
fi

exec 9>"$backup_dir/.preview-backup.lock"
if ! flock -n 9; then
    printf '%s\n' '已有预览数据库备份正在运行，本次跳过。'
    exit 0
fi

name="formward_preview-$(date -u +%Y%m%dT%H%M%S%NZ).dump"
output="$backup_dir/$name"
partial="$output.partial"
set -o noclobber
partial_created=0
trap 'if [[ $partial_created -eq 1 ]]; then rm -f -- "$partial"; fi' EXIT
if [[ -e "$output" || -L "$output" || -e "$output.sha256" || -L "$output.sha256" ]]; then
    printf '%s\n' '相同名称的备份或校验文件已存在，拒绝覆盖。' >&2
    exit 1
fi
# 先以 noclobber 独占建立临时文件；失败时不能清理别人的既有文件。
: > "$partial"
partial_created=1

runuser -u postgres -- env -i PATH=/usr/bin:/bin LANG=C.UTF-8 /usr/lib/postgresql/18/bin/pg_dump \
    --host=/var/run/postgresql --port=5432 --username=postgres \
    --format=custom --dbname=formward_preview >| "$partial"
/usr/lib/postgresql/18/bin/pg_restore --list "$partial" > /dev/null

# 同目录硬链接原子发布；目标存在时 ln 失败，绝不覆盖旧备份。
ln -- "$partial" "$output"
rm -- "$partial"
sha256sum "$output" > "$output.sha256"

while IFS= read -r -d '' expired; do
    expired_name=$(basename -- "$expired")
    if [[ "$expired_name" =~ ^formward_preview-[0-9]{8}T[0-9]{15}Z\.dump$ ]]; then
        rm -- "$expired"
        if [[ -f "$expired.sha256" && ! -L "$expired.sha256" ]]; then
            rm -- "$expired.sha256"
        fi
    fi
done < <(find "$backup_dir" -maxdepth 1 -type f -name 'formward_preview-*.dump' -mmin +20160 -print0)

printf '%s\n' "预览数据库备份成功：$name；已校验 custom 格式目录。"
