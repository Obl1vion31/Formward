#!/usr/bin/env bash
# 将校验过的发布包激活到独立预览环境，不执行数据库 migration。
set -euo pipefail
umask 077
[[ $EUID -eq 0 && $# -eq 3 ]] || { echo '用法：sudo bash activate-preview.sh 发布标识 发布包 SHA256' >&2; exit 1; }
release=$1 archive=$(realpath -- "$2") expected=$3
[[ "$release" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$ && "$expected" =~ ^[a-f0-9]{64}$ ]] || exit 1
[[ -f "$archive" && ! -L "$archive" && -f /etc/formward/preview.env ]] || exit 1
printf '%s  %s\n' "$expected" "$archive" | sha256sum -c -
root=/srv/formward/preview
target="$root/releases/$release"
[[ -d "$root/releases" && ! -e "$target" && ! -L "$target" ]] || { echo '发布目标已存在或环境未初始化。' >&2; exit 1; }
old=''
if [[ -e "$root/current" || -L "$root/current" ]]; then
  [[ -L "$root/current" ]] || exit 1
  old=$(readlink -f "$root/current")
  [[ "$old" == "$root/releases/"* && -f "$old/server.js" ]] || exit 1
fi
install -d -o root -g formward -m 0750 "$target"
python3 - "$archive" "$target" <<'PY'
import pathlib, sys, tarfile
with tarfile.open(sys.argv[1], 'r:gz') as archive:
    for item in archive.getmembers():
        parts=pathlib.PurePosixPath(item.name).parts
        if (parts and parts[0] in ('data','.git','.codex')) or any(p == '.env' or p.startswith('.env.') or p.endswith(('.pem','.key')) for p in parts):
            raise SystemExit('发布包包含禁止文件。')
    archive.extractall(sys.argv[2], filter='data')
PY
test -f "$target/server.js"
test -f "$target/release-manifest.json"
test -f "$target/static-files.json"
# 仅继承上一代自己构建的哈希资源，避免连续发布无限累积。
if [[ -n "$old" ]]; then
 python3 - "$old" "$target" <<'PY'
import json,pathlib,shutil,sys
old,new=map(pathlib.Path,sys.argv[1:]); listing=old/"static-files.json"
files=json.loads(listing.read_text()) if listing.exists() else [str(p.relative_to(old/".next/static")) for p in (old/".next/static").rglob("*") if p.is_file()]
for name in files:
 part=pathlib.PurePosixPath(name)
 if part.is_absolute() or ".." in part.parts: raise SystemExit("静态资源路径无效")
 src=old/".next/static"/name; dst=new/".next/static"/name
 if src.is_file() and not dst.exists(): dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
PY
fi
chown -R root:formward "$target"
chmod -R g+rX,o-rwx "$target"
install -d -o formward -g formward -m 0700 "$target/.next/cache"
ln -s "$target" "$root/.current-$release"
mv -Tf "$root/.current-$release" "$root/current"
preview_healthy() {
  for attempt in {1..30}; do
    if /opt/node-v24.21.0-linux-x64/bin/node --env-file=/etc/formward/preview.env /usr/local/lib/formward/check-release.mjs "$root/current/release-manifest.json" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}
# 手动发布清理此前失败累计的启动限流；新版本崩溃仍可能重新触发限流。
if systemctl reset-failed formward-preview.service && systemctl restart formward-preview.service && preview_healthy; then
  printf '预览应用已激活：%s\n' "$release"
  exit 0
fi
if [[ -n "$old" && -f "$old/release-manifest.json" ]] && python3 - "$old/release-manifest.json" "$target/release-manifest.json" <<'PY'
import json,sys
a,b=[json.load(open(p)) for p in sys.argv[1:]]
raise SystemExit(0 if a.get("protocol")==b.get("protocol") and a.get("schema")==b.get("schema") else 1)
PY
then
  if ln -s "$old" "$root/.rollback-$release" && mv -Tf "$root/.rollback-$release" "$root/current" \
      && systemctl reset-failed formward-preview.service && systemctl restart formward-preview.service && preview_healthy; then
    echo '新版本健康检查未通过，旧版本已恢复并通过 HTTP 健康检查。' >&2
  else
    echo '新版本启动失败，旧版本恢复也未通过；请检查服务状态和日志。' >&2
  fi
else
  if systemctl stop formward-preview.service; then
    # 首次发布没有可回退版本；移除失效入口，避免开机后再启动失败版本。
    if [[ -L "$root/current" && $(readlink -f "$root/current") == "$target" ]]; then
      rm -- "$root/current"
    fi
    systemctl reset-failed formward-preview.service
    echo '首次部署健康检查未通过，应用已停止，失败版本未激活。' >&2
  else
    echo '首次部署失败，且服务未能停止；请立即检查服务状态。' >&2
  fi
fi
exit 1
