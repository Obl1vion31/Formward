#!/usr/bin/env bash
# 将已经验收的 standalone 构建打包；运行密钥由服务器 EnvironmentFile 提供。
set -euo pipefail
umask 077
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"
release="${1:?用法：package-release.sh 发布标识}"
[[ "$release" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$ ]] || { echo '发布标识无效。' >&2; exit 1; }
test -f .next/standalone/server.js
test -d .next/static
target="$root/.codex/mainland-setup/$release.tar.gz"
test ! -e "$target" || { echo '拒绝覆盖已有发布包。' >&2; exit 1; }
mkdir -p "$root/.codex/mainland-setup"
stage="$(mktemp -d "$root/.codex/mainland-setup/package.XXXXXXXX")"
trap 'rm -rf -- "$stage"' EXIT
# 只复制明确列出的构建输入，避免 standalone 根目录里的环境文件进入发布包。
cp -a .next/standalone/server.js .next/standalone/package.json .next/standalone/node_modules "$stage/"
cp -a .next/standalone/.next "$stage/.next"
rm -rf -- "$stage/.next/cache"
cp -a .next/static "$stage/.next/static"
cp -a public "$stage/public"
mkdir -p "$stage/.next/cache"
git rev-parse HEAD > "$stage/SOURCE_COMMIT"
git diff --binary HEAD -- src next.config.ts package.json pnpm-lock.yaml | sha256sum > "$stage/SOURCE_DIFF_SHA256"
git status --porcelain > "$stage/SOURCE_WORKTREE"
cp .next/BUILD_ID "$stage/BUILD_ID"
tar --exclude='.env' --exclude='.env.*' --exclude='*.pem' --exclude='*.key' -C "$stage" -czf "$target" .
sha256sum "$target" > "$target.sha256"
printf '发布包：%s\n' "$target"
