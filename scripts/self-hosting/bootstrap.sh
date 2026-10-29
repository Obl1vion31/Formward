#!/usr/bin/env bash
# formward-self-hosting-managed-v1
set -euo pipefail
umask 077

fail() { printf '%s\n' "$*" >&2; exit 1; }
[[ $# -eq 1 && $1 == --apply ]] || fail '用法：sudo bash bootstrap.sh --apply'
[[ $EUID -eq 0 ]] || fail '需要 root 权限。'
. /etc/os-release
[[ $ID == ubuntu && $VERSION_ID == 24.04 && $(dpkg --print-architecture) == amd64 ]] || fail '仅支持 Ubuntu 24.04 amd64。'
node_bin=/opt/node-v24.21.0-linux-x64/bin/node
[[ -x "$node_bin" && $("$node_bin" --version) == v24.21.0 ]] || fail '请先提供经过校验的 /opt/node-v24.21.0-linux-x64。'
script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
state_dir=/var/lib/formward-bootstrap
marker='# formward-self-hosting-managed-v1'

if [[ -e "$state_dir/native-preview-v1" ]]; then
    [[ ! -L "$state_dir" && $(cat "$state_dir/native-preview-v1") == "$marker" ]] || fail '部署状态标记不匹配。'
else
    for path in /srv/formward /etc/formward /etc/postgresql /etc/apt/sources.list.d/formward-pgdg.sources /usr/share/keyrings/formward-pgdg.asc /etc/systemd/system/formward-preview.service /etc/systemd/system/formward-backup-preview.service /etc/systemd/system/formward-backup-preview.timer /usr/local/libexec/formward-backup-preview /var/backups/formward; do
        [[ ! -e "$path" && ! -L "$path" ]] || fail "发现既有路径，拒绝接管：$path"
    done
    ! getent passwd formward > /dev/null || fail 'formward 用户已存在，拒绝接管。'
    if dpkg-query -W -f='${Status}' nginx 2>/dev/null | grep -Fq 'install ok installed'; then
        fail '发现既有 Nginx，拒绝替换配置。'
    fi
    [[ ! -e "$state_dir" ]] || fail '发现未识别的部署状态目录。'
    install -d -m 0700 "$state_dir"
    printf '%s\n' "$marker" > "$state_dir/native-preview-v1"
fi

# 只允许沿用 SSH 规则，避免更改他人的防火墙策略或遗漏旧开放端口。
if command -v ufw > /dev/null; then
    while IFS= read -r rule; do
        [[ -z "$rule" || "$rule" =~ ^ufw\ allow\ 22/tcp(\ comment\ .*)?$ ]] || fail '发现非本任务防火墙规则，请人工核对后再运行。'
    done < <(ufw show added | sed -n '/^ufw /p')
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl ufw
ufw allow 22/tcp comment 'Formward SSH'
ufw default deny incoming
ufw default allow outgoing
ufw --force enable

changed=0
install_managed() {
    local source=$1 target=$2 mode=$3
    changed=0
    if [[ -e "$target" || -L "$target" ]]; then
        [[ -f "$target" && ! -L "$target" ]] || fail "配置不是普通文件：$target"
        grep -Fxq "$marker" "$target" || fail "拒绝覆盖未标记配置：$target"
        if cmp -s "$source" "$target"; then return; fi
    fi
    install -D -o root -g root -m "$mode" "$source" "$target"
    changed=1
}

key_path=/usr/share/keyrings/formward-pgdg.asc
if [[ ! -e "$key_path" ]]; then
    curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
        --connect-timeout 15 --max-time 90 \
        https://www.postgresql.org/media/keys/ACCC4CF8.asc \
        --output "$state_dir/pgdg-key.download"
    grep -Fq 'BEGIN PGP PUBLIC KEY BLOCK' "$state_dir/pgdg-key.download" || fail '仓库签名密钥格式异常。'
    install -o root -g root -m 0644 "$state_dir/pgdg-key.download" "$key_path"
    sha256sum "$key_path" > "$state_dir/pgdg-key.sha256"
    rm -- "$state_dir/pgdg-key.download"
else
    [[ -f "$state_dir/pgdg-key.sha256" ]] || fail '仓库密钥缺少本任务记录。'
    sha256sum --check --status "$state_dir/pgdg-key.sha256" || fail '仓库签名密钥已变化，请人工核对。'
fi

cat > "$state_dir/formward-pgdg.sources" <<'SOURCES'
# formward-self-hosting-managed-v1
Types: deb
URIs: https://apt.postgresql.org/pub/repos/apt
Suites: noble-pgdg
Architectures: amd64
Components: main
Signed-By: /usr/share/keyrings/formward-pgdg.asc
SOURCES
install_managed "$state_dir/formward-pgdg.sources" /etc/apt/sources.list.d/formward-pgdg.sources 0644
apt-get update
apt-get install -y --no-install-recommends postgresql-18 postgresql-client-18 nginx

if ! getent passwd formward > /dev/null; then
    useradd --system --user-group --home-dir /srv/formward --no-create-home --shell /usr/sbin/nologin formward
fi
[[ $(getent passwd formward | cut -d: -f6,7) == /srv/formward:/usr/sbin/nologin ]] || fail 'formward 用户属性不符。'
install -d -o root -g formward -m 0750 /srv/formward /srv/formward/preview /srv/formward/preview/releases
install -d -o root -g root -m 0700 /etc/formward /var/backups/formward

[[ $(pg_lsclusters --no-header | wc -l) -eq 1 ]] || fail '检测到多个 PostgreSQL 集群，拒绝自动调整。'
pg_lsclusters --no-header | grep -Eq '^18[[:space:]]+main[[:space:]]+5432[[:space:]]' || fail 'PostgreSQL 18/main 未使用预期端口。'

cat > "$state_dir/formward-postgresql.conf" <<'POSTGRES'
# formward-self-hosting-managed-v1
listen_addresses = '127.0.0.1'
password_encryption = 'scram-sha-256'
shared_buffers = '512MB'
max_connections = 40
hba_file = '/etc/postgresql/18/main/formward-preview-hba.conf'
log_statement = 'none'
log_min_duration_statement = -1
log_min_error_statement = 'panic'
log_error_verbosity = 'terse'
log_parameter_max_length_on_error = 0
POSTGRES
cat > "$state_dir/formward-preview-hba.conf" <<'HBA'
# formward-self-hosting-managed-v1
local all postgres peer
local all all peer
host formward_preview formward_preview 127.0.0.1/32 scram-sha-256
host all formward_preview 127.0.0.1/32 reject
host all all 127.0.0.1/32 scram-sha-256
HBA
install_managed "$state_dir/formward-postgresql.conf" /etc/postgresql/18/main/conf.d/formward-preview.conf 0644
pg_changed=$changed
install_managed "$state_dir/formward-preview-hba.conf" /etc/postgresql/18/main/formward-preview-hba.conf 0644
pg_changed=$((pg_changed + changed))
if [[ $pg_changed -gt 0 ]]; then
    pg_ctlcluster 18 main restart
else
    systemctl start postgresql@18-main.service
fi
systemctl enable postgresql.service

role_comment=$(runuser -u postgres -- psql -X -At -v ON_ERROR_STOP=1 -c "SELECT coalesce(shobj_description(oid, 'pg_authid'), '') FROM pg_roles WHERE rolname='formward_preview'")
role_exists=$(runuser -u postgres -- psql -X -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_roles WHERE rolname='formward_preview'")
if [[ $role_exists == 0 ]]; then
    runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 <<'ROLE'
BEGIN;
CREATE ROLE formward_preview LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 20;
COMMENT ON ROLE formward_preview IS 'formward-self-hosting-preview-v1';
COMMIT;
ROLE
else
    [[ $role_comment == formward-self-hosting-preview-v1 ]] || fail '数据库角色已存在但不属于本任务。'
fi
database_exists=$(runuser -u postgres -- psql -X -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_database WHERE datname='formward_preview'")
if [[ $database_exists == 0 ]]; then
    runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 <<'DATABASE'
CREATE DATABASE formward_preview OWNER formward_preview TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER libc LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8';
COMMENT ON DATABASE formward_preview IS 'formward-self-hosting-preview-v1';
REVOKE ALL ON DATABASE formward_preview FROM PUBLIC;
GRANT CONNECT ON DATABASE formward_preview TO formward_preview;
DATABASE
else
    database_check=$(runuser -u postgres -- psql -X -At -v ON_ERROR_STOP=1 -c "SELECT coalesce(shobj_description(oid, 'pg_database'), '') FROM pg_database WHERE datname='formward_preview'")
    [[ $database_check == formward-self-hosting-preview-v1 ]] || fail '数据库已存在但不属于本任务。'
    # 后续私密 provision 可把所有者交给专用 migrator；重复运行不改所有者或应用授权。
fi

# 仅移除 apt 在本次全新安装时提供的默认站点启用链接；保留源配置。
if [[ -L /etc/nginx/sites-enabled/default ]]; then
    [[ $(readlink -f /etc/nginx/sites-enabled/default) == /etc/nginx/sites-available/default ]] || fail '默认 Nginx 站点链接不符。'
    if [[ ! -f "$state_dir/nginx-default.sha256" ]]; then
        package_hash=$(dpkg-query -W -f='${Conffiles}\n' nginx-common | awk '$1 == "/etc/nginx/sites-available/default" {print $2}')
        actual_hash=$(md5sum /etc/nginx/sites-available/default | cut -d' ' -f1)
        [[ -n "$package_hash" && "$package_hash" == "$actual_hash" ]] || fail '默认 Nginx 站点不是原始软件包配置，拒绝移除启用链接。'
        sha256sum /etc/nginx/sites-available/default > "$state_dir/nginx-default.sha256"
    else
        sha256sum --check --status "$state_dir/nginx-default.sha256" || fail '默认 Nginx 站点已被修改，拒绝移除启用链接。'
    fi
    rm -- /etc/nginx/sites-enabled/default
elif [[ -e /etc/nginx/sites-enabled/default ]]; then
    fail '默认 Nginx 站点不是预期的启用链接。'
fi
install_managed "$script_dir/nginx-preview.conf" /etc/nginx/sites-available/formward-preview.conf 0644
if [[ ! -e /etc/nginx/sites-enabled/formward-preview.conf && ! -L /etc/nginx/sites-enabled/formward-preview.conf ]]; then
    ln -s /etc/nginx/sites-available/formward-preview.conf /etc/nginx/sites-enabled/formward-preview.conf
fi
[[ $(readlink -f /etc/nginx/sites-enabled/formward-preview.conf) == /etc/nginx/sites-available/formward-preview.conf ]] || fail 'Nginx 预览站点链接不符。'
nginx -t

install_managed "$script_dir/formward-preview.service" /etc/systemd/system/formward-preview.service 0644
install_managed "$script_dir/backup-preview.sh" /usr/local/libexec/formward-backup-preview 0755
install_managed "$script_dir/formward-backup-preview.service" /etc/systemd/system/formward-backup-preview.service 0644
install_managed "$script_dir/formward-backup-preview.timer" /etc/systemd/system/formward-backup-preview.timer 0644
systemctl daemon-reload
systemctl enable formward-preview.service
systemctl enable --now nginx.service
systemctl reload nginx.service
systemctl enable --now formward-backup-preview.timer

printf '%s\n' '原生隔离环境已配置。应用待独立 preview.env、迁移与发布包就绪后启动。'
