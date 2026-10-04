# Formward 项目交接

更新日期：2026-10-04。仓库：`/home/obl1vion/projects/Formward`；分支：`main`；远程：[Obl1vion31/Formward](https://github.com/Obl1vion31/Formward)。

## 下一次开始时先做什么

1. 阅读本文件、根目录 `README.md`、`AGENTS.md`；检查 `git status --short` 与最近提交，保留用户已有改动。
2. 查看 `docs/status.md` 获取实现与验证详情，`docs/interface.md` 获取当前页面设计；修改前阅读目标目录最近的 `README.md`。
3. Next.js 当前为 16.3.7，写代码前查阅 `node_modules/next/dist/docs/` 中相关指南，不直接套用旧版本 API。
4. 根据用户的新指令继续。当前实现已完成技术验收，最新 Hero 视觉尚待用户实际体验与反馈，不能把技术验收写成用户已认可设计。

## 最新用户要求与实现

用户希望保留中央金色人物、深色背景与神秘感，将 Hero 从插画加普通网页文字提升为克制、现代、具有 editorial / luxury digital product 气质的整体品牌视觉。人物始终是绝对中心，文字弱于人物、大量留白，三组文字要与环形轨迹形成关系。

当前页面文案全部使用英文，三组含义与排版为：

| 主标题 | 微小辅助标签 | 用户希望传达的含义 |
| --- | --- | --- |
| Discipline | Nutrition | 控制饮食的自律，关注热量盈余方向 |
| Drive | Build yourself | 塑造自己、自驱力与持续向前 |
| Effortless | AI logging | AI 接入帮助实现零负担记录；不限于某种 AI agent |

用户多次要求精简，不希望堆满产品说明；零负担是 AI 方向的核心表达。当前选用 Effortless 作为主标题、AI logging 作为微标签，不额外放解释段落。首页展示产品方向，并不代表记录或 AI 功能已经实现。

Hero 当前实现：

- 本地 Manrope 330 字重标题，桌面字号 `clamp(24px, 2.25vw, 34px)`；IBM Plex Mono 400 微标签为 9px、大写样式。暖 ivory 标题 `#c7bcaa`，暖金标签 `#aa9574`；表单与 Logo 沿用原有字体。
- Discipline 在左侧，Drive 与 Effortless 在右侧。三组标题与轨迹节点共用锚点、垂直对齐；静态细弧线与短引线连接节点。没有卡片、说明段落或装饰编号。
- 桌面 SCROLL TO ENTER 在左下角，与 Discipline 共用 7% 左边距，配细轨道和小动标。仅 INTRO、素材就绪和桌面细指针设备显示；倒放回首屏恢复，reduced motion 动标静止。
- 手机在底部安全区上方横排三组文字，用细轴连接三个节点，标题 14px、微标签 8.5px。键盘入口获焦时位于文字上方。
- 背景独立于人物视差和透明合成；转身前 200ms 淡出，倒放最后 200ms 恢复，登录与认证阶段隐藏。

用户最新要求是写本交接文件，并将当前全部项目改动提交到 GitHub。

## 人物与视频：已接入 v6、两倍速

- 当前原始素材为 `public/videos/golden-turn-1s-v6.mp4`，一秒、60 帧；保留原文件，不修改上传素材。
- `scripts/prepare-turn-video.sh` 使用 FFmpeg 生成 `golden-turn-1s.mp4`，960×1440、逐帧关键帧、faststart。页面引用带 `?v=6` 的播放文件。
- 页面在 500ms 内完成转身，通过同一时间游标正放、倒放和中途反向；使用视频寻帧，不使用负 playbackRate。未完成的寻帧合并至最新目标。
- 静态首尾仍使用原来的 `1.png`、`12.png`，保留原有尺寸、对齐与鼠标联动。两端各 40ms 混合视频和静态图。黑底通过 WebGL 转为透明 Canvas。
- 登录成功后的 `12.png` → `13.png` 独立，仍为 700ms；收到实际动画结束事件后才进入 `/dashboard`。reduced motion 转身为 180ms 静态交叠、最终过渡为 240ms。
- 人物帧使用隔离组与互补 `plus-lighter` 合成，避免交叠变暗。修改时必须复核透明背景、端点衔接、倒放、反向和第 13 张。

## 登录与数据库：已实现并修复连接超时

- Better Auth + Drizzle + PostgreSQL / Neon：内部邮箱密码登录、会话、退出、受保护 `/dashboard` 已实现。公开注册关闭，密码保存 scrypt 哈希。
- 用户曾报告登录查询 `AggregateError / ETIMEDOUT`。诊断为 Node 自动尝试 IPv4 / IPv6 时，默认单地址 250ms 接近跨区域网络延迟；问题发生在 TCP 连接阶段。
- `src/db/client.ts` 将进程默认单地址尝试时限设为至少 1000ms，保留已有更长设置；连接时限仍为 15 秒。此前连续三次新建真实 Neon 只读连接通过，未读取账号内容或写入真实数据库。
- 修改数据库连接或 `.env.local` 后要重启开发服务，更新缓存的认证实例和连接池。连接尝试设置是 Node 进程级的。
- `.env.local` 存放真实配置，被 Git 忽略；接手时保留已有值，不将密码、连接串或 secret 写入文档和提交。配置指南见 `docs/auth-setup.md`。
- 登录先验证账号，再播放最终动画；认证中禁止重复提交和方向输入，失败回表单允许重试。首次聚焦输入框后人物回中并锁定整个登录阶段，倒放返回首屏才解除。

## 关键代码与文档

| 位置 | 用途 |
| --- | --- |
| `src/app/home-intro-backdrop.tsx` | 三组英文文案、共享锚点、轨迹与节点 |
| `src/app/hero-font.ts`、`public/fonts/` | 本地字体定义、资源与完整许可证 |
| `src/app/globals.css` | Hero 排版、舞台、SCROLL、表单与响应式规则 |
| `src/app/home-experience.tsx` | 状态协调、时间线、焦点锁定、认证与导航 |
| `src/app/home-timeline.ts` | 500ms 游标、端点权重、背景淡出和 Login 显现 |
| `src/app/turn-video.ts` | 视频寻帧、透明合成、视频端点校准与清理 |
| `src/app/frame-config.ts`、`docs/frame-calibration.md` | 原始静态端点配置及人物校准依据 |
| `src/app/figure-motion.ts` | 人物反向鼠标位移、倾转、暂停和回中 |
| `src/db/client.ts`、`src/features/auth/` | 数据库连接与统一认证能力 |
| `docs/code-study.md` | 中文代码阅读指南与修改位置速查 |
| `docs/product.md`、`docs/milestones.md` | 产品边界与后续业务顺序 |

`src/app` 只处理入口与页面，业务规则放在 `src/features`，数据库集中在 `src/db`。网页与未来 AI API 共用 feature 函数。每个项目维护目录需要 README；不要提前创建复杂架构分层。

## 当前验证与本地运行

使用 Node.js 24.21.0、pnpm 9.15.9。开发命令为 `pnpm dev`，访问 `http://localhost:3000` 或 `http://127.0.0.1:3000`。已有服务时先检查端口；其他转发域名需要更新 `next.config.ts` 的 `allowedDevOrigins` 并重启。

本次代码通过 `pnpm lint`、`pnpm typecheck`、`pnpm test`（41 项）和 `pnpm build`。完整 production 浏览器验收通过，覆盖真实认证、手势、焦点、冷启动、素材失败、reduced motion 和四种视口；标题、节点及 SCROLL 布局截图已复核。39 组交叠像素检查最大平均 RGB 误差为 0.635/255，低于 2/255。

最新浏览器实测：500ms 时间线约 517ms；正放 / 倒放含事件与采样延迟约 540ms / 524ms，分别采样到 16 / 16 个不同解码帧。视频源有 60 帧，实际可见帧数取决于解码性能与刷新率；未做 120Hz 实机验证。

浏览器测试 `pnpm test:browser` 自行启动隔离的内存 PostgreSQL 与 production 服务，使用虚构账号，环境准备见 `tests/README.md`。测试工具仅临时安装在 `/tmp`，没有新增项目依赖。当前工作区复现命令如下；换机器或 `/tmp` 被清理后需重新准备对应路径：

```bash
env LD_LIBRARY_PATH=/tmp/formward-browser-check/runtime/usr/lib/x86_64-linux-gnu \
  PLAYWRIGHT_BROWSERS_PATH=/tmp/formward-browser-check/browsers \
  PLAYWRIGHT_MODULE=/tmp/formward-browser-check/node_modules/playwright/index.mjs \
  FORMWARD_BROWSER_ARTIFACTS=/tmp/formward-browser-check/hero-artifacts \
  FORMWARD_VISUAL_CHECK=1 pnpm test:browser
```

最新截图在 `/tmp/formward-browser-check/hero-artifacts/`，桌面、手机、窄屏、横屏文件名分别为 `desktop-intro-interaction.png`、`mobile-intro-interaction.png`、`compact-intro-interaction.png`、`landscape-intro-interaction.png`。这些是本机临时验收产物；GitHub 中的源码与素材可重现页面。

## 尚未实现与下一步边界

- 最新 Hero 视觉等待用户反馈，后续调整优先保留人物、深色背景、留白、英文短文案与轨迹关系。
- `/dashboard` 当前只有账号及业务模块空状态。身体指标、饮食、运动、趋势、Excel 导入、AI API 和可撤销 AI Token 尚未实现，按 `docs/milestones.md` 推进。
- AI 零负担记录是产品方向，不在站内提前增加聊天窗口或绑定某类 agent。热量盈余不能直接等同于摄入减已记录运动消耗。
- 多实例部署前，需要将进程内存登录限流改为共享存储。当前没有完成正式部署。
- 私有导入数据在被忽略的 `data/imports/`，`public/` 仅存公开素材。健康记录始终按 `user_id` 校验归属，数据库结构通过版本化 Drizzle migration 演进。

有新进展时重写本文件对应段落、同步主题文档，保持说明与当前代码一致。
