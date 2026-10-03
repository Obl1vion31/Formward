#!/usr/bin/env bash

# -u 检查未定义变量，pipefail 让管道中出错可见；用 failed 汇总缺失项后统一退出。
set -uo pipefail

# 根据脚本所在位置找仓库根目录，从其他工作目录运行也有效。
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
failed=0

# find 使用 NUL 分隔目录，read -d '' 配对读取，路径包含空格也不会被拆开。
while IFS= read -r -d '' directory; do
  readme="$directory/README.md"
  if [[ ! -f "$readme" ]]; then
    printf '缺少 README.md: %s\n' "${directory#"$project_root"/}"
    failed=1
    continue
  fi

  if [[ ! -s "$readme" ]]; then
    printf 'README.md 内容为空: %s\n' "${readme#"$project_root"/}"
    failed=1
  fi
done < <(
  # -prune 跳过依赖、缓存、数据库生成 storage 和 Drizzle 快照；其他自有目录都需要非空 README。
  find "$project_root" \
    \( -type d \( -path "$project_root/data/postgres/storage" -o -path "$project_root/drizzle/meta" \) -prune \) -o \
    \( -type d \( \
      -name .git -o \
      -name .agents -o \
      -name .codex -o \
      -name .aws -o \
      -name node_modules -o \
      -name vendor -o \
      -name dist -o \
      -name build -o \
      -name coverage -o \
      -name .cache -o \
      -name .next -o \
      -name target \
    \) -prune \) -o \
    -type d -print0
)

# 非零退出码可让 CI 或上层命令识别失败；全部通过则输出一句检查结果。
if [[ "$failed" -ne 0 ]]; then
  exit 1
fi

printf '结构检查通过：所有项目自有目录均包含非空 README.md。\n'
