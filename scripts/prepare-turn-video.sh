#!/usr/bin/env bash
# 将公开转身素材转换为逐帧关键帧；原始视频不覆盖，播放文件可重新生成。
set -euo pipefail
cd "$(dirname "$0")/.."
ffmpeg -y -v error -i public/videos/golden-turn-1s-v6.mp4 -an \
  -vf scale=960:1440 -c:v libx264 -preset fast -crf 18 \
  -g 1 -keyint_min 1 -pix_fmt yuv420p -movflags +faststart \
  public/videos/golden-turn-1s.mp4
