# 内嵌小助手本地原型验收

本页只记录`codex/assistant-chat-prototype`中的独立研究，不是正式网页的发布证明。原型采用固定虚构日期2026年11月12日，浏览器时区Asia/Shanghai；正式提醒、OAuth、数据库、授权期限和现有API未改动。实际入口为`http://localhost:4177`，仅监听本机，不推送、不合入main、不发布。

## 视觉与操作基准

适用设计规范D2／D3／D4／D6／D7／D11／D12／D15。本次沿用Formward品牌、暖白／石墨／金色、图标与漂浮导航；Mobile Design检查手机任务与返回，Impeccable检查同类控件及异常状态，Unslop沿用已审阅a6f121e（Damir Sokolovsky，CC BY 4.0），没有安装运行依赖或另选视觉世界。代码先行，无新增ImageGen参考稿或生成位图；品牌SVG来自现有`public/icons`，照片使用用户选择的内存Blob，测试照片为虚构1×1像素。

电脑同窗双栏，外壳宽860px、待办栏220px、聊天区余量，距右24px／距底88px；低于1100px为单栏标签。手机近全屏底部面板，聊天／待办共用外壳。角色字号按18／16／14／13px设置，采用rem支持文字放大，命中范围按44×44px核验。标题、页签和输入位置不等待查询；消息区增长和滚动不改变外壳。

## 本地检查

| 检查 | 实际结果 |
| --- | --- |
| ESLint | 仓库全量及原型末次检查通过；Impeccable detector仅执行一次，结果`[]` |
| TypeScript | 仓库`tsc --noEmit`通过，包含原型TSX与模拟适配器 |
| 单元测试 | 既有助手10项＋原型5项，15项通过 |
| production build | 原正式应用构建通过；使用虚构数据库地址和构建凭据，没有新增正式路由 |
| Chromium | 修复后完整流程通过，37张截图、2份流程录像、30份布局检查；无pageerror和外部请求 |
| WebKit | 修复后完整流程通过，37张截图、2份流程录像、30份布局检查；矮屏聚焦与触屏横屏外壳可见 |
| 独立视觉复核 | disposition：ship，仅限本地原型交付；上轮两项问题及两项核验均resolved，详见下表 |

复现命令在仓库根执行，使用已有Node24及依赖：

```sh
node prototypes/assistant-chat/server.mjs
node node_modules/eslint/bin/eslint.js prototypes/assistant-chat
node node_modules/typescript/bin/tsc --noEmit
node --import tsx --test src/features/assistant/assistant.test.ts prototypes/assistant-chat/mock.test.ts
PLAYWRIGHT_BROWSERS_PATH=/home/obl1vion/.local/formward-tools/browsers node prototypes/assistant-chat/browser.mjs
PLAYWRIGHT_BROWSERS_PATH=/home/obl1vion/.local/formward-tools/browsers PROTOTYPE_BROWSER=webkit node prototypes/assistant-chat/browser.mjs
```

浏览器脚本的`PLAYWRIGHT_MODULE`可指定本机Playwright入口，`PROTOTYPE_ARTIFACTS`可指定输出目录。资源修改后使用`node prototypes/assistant-chat/server.mjs --build`更新运行中的本地服务，不必开启第二个端口。

## 场景与边界

| 场景 | 已核对内容 |
| --- | --- |
| 补充回答 | 已有米饭150克，补充鸡胸肉100克后只生成一份预览；保存前写入计数为0 |
| 照片 | 实测本地选择及发送，不上传。没有食量时追问，单独“100克”不猜对象，分次补充保留已知量；替换／移除入口已实现，未单独自动验收 |
| 引用回复 | 引用11月9日消息后仅修改该日晚餐备注，不按最近的11月10日选择；点击引用定位原文 |
| 话题切换 | 饮食补充期间查询体重不创建饮食预览，缺测保持空白 |
| 提醒 | 忽略不修改完整性或调用模型；补录所属昨日更新待办；今天测量不能清除昨日饮食待办 |
| 流式与停止 | 停止保留已生成文字，继续在同一消息接续；减少动态效果即时显示已取得文本 |
| 草稿与返回 | 关闭重开保留草稿；有草稿的新对话可取消；重新登录演示保留输入 |
| 来源 | 本人记录／估算／外部资料区分；来源更新提示重新查询，不把外部示例当个人营养依据 |
| 失败 | 断网、超时、服务不可用与工具查询失败分别提示并可重试；查询失败不表示无记录 |
| 部分成功 | 可用饮食结果继续展示，消耗失败不按0计算 |
| 预览 | 到期、版本冲突均阻止直接确认，刷新预览后才可确认；相同操作号只保存一次 |
| 上限 | 对话长度、当日额度、发送频率分别展示；保留草稿、旧消息及手动记录入口，不编造额度恢复时间 |
| 账号隔离 | 切换演示账号清除消息、草稿、照片与任务；只验证内存隔离，不宣称服务端认证验收 |
| 资源边界 | 浏览器无外部网络请求，服务拒绝POST，`.env.local`返回404；没有数据库或API写入 |

## 独立复核与修复结果

独立Impeccable finish reviewer按原请求、Direction contract、真实截图及craft floor复核，初次disposition为fix；修复后只评分原问题，最终disposition为ship。该结论表示四项修复／核验要求均resolved，不是重新搜索全页后的无缺陷承诺。复核未操作浏览器或另行播放录像，动态结论依据实际流程报告与代码。

| 项目 | 最终结果与证据 |
| --- | --- |
| WebKit矮屏聚焦时标题离屏 | resolved。旧可见高度更新存在一帧延迟；现在用`min(100dvh, --viewport-height)`约束并结合visualViewport顶部定位，取消视口高度过渡。390×420即时聚焦及稳定后均为面板top8px／高412px、标题top52px／标签top97px；横屏关闭与标签也可见 |
| 部分命中宽度不足44px | resolved。补足最小宽度，两引擎各30份布局中，宽或高不足43.9px的可见控件均为0；不放大文字满足点击范围 |
| 拖动后可能重复触发click | resolved。手势标记消费拖动后的click；两引擎实测上／下拖90px、连续反向、12px阈值内点击、单击、Space与Enter |
| 键盘与焦点恢复 | resolved。Tab／Shift+Tab、菜单Escape仅收菜单、再Escape关闭助手、来源详情Escape仅关详情并返回原来源按钮均通过；关闭助手后回到入口，初始自动打开的演示也一致 |

仍沿用既有设计系统，未改全站DESIGN／token文件。主次、深浅色、输入边界、200%自然换行和44px点击范围的实际对照在截图清单内；没有新增作为正式资源发布的位图。

## 截图、录像与布局记录

实际证据目录：[acceptance](C:/Users/14878/.codex/visualizations/2026/11/11/01a1cb4e-f688-7e00-82e5-c39be8e68155/assistant-chat/acceptance)。`chromium-report.json`和`webkit-report.json`保存实际流程结果、截图清单、控件尺寸与溢出数据；只有清单内的文件代表本轮有效截图，早期`failed`诊断不计为通过证据。

深浅主题分别覆盖320×560、390×640、430×780、844×390、1100×780及1440×900。200%文字通过根字号放大和rem实现，覆盖320／390／1440px及对话上限；手机另有390×420输入聚焦模拟、844×390触屏横屏和待办页。参考原图为`chromium-light-1440x900.png`、`chromium-light-390x640.png`和对应`dark`；`contact-1`至`contact-4`为清单总览，不能代替原图字号和操作检查。

`*-flows.webm`及`*-mobile.webm`保存桌面与手机实际交互。`*-loading-normal.json`／`*-loading-slow.json`逐帧记录390×640固定标题和输入的x／y／宽度，两引擎最终最大偏移均为0 CSS px；这证明模拟响应接管稳定，不代表真实API延迟或设备帧率。

## 未测与尚未接入

- 真实模型、图片识别准确率、工具调用接口、模型计费、流式网络、服务端会话／额度及真实提醒调度未接入。本地场景菜单是可重复演示，不是自然语言完整实现。
- 真机iOS／Android、真实软键盘和中文输入法、系统文字放大、屏幕阅读器、摄像头权限、硬件返回键及后台恢复未验收；WebKit／Chromium视口和根字号模拟不能替代这些项目。
- 本地记录面板只改变演示状态；真实审核跳转、跨端持久化、后台定时提醒、登录续期与外部资料可用性未验收。记录与模型的正式接入继续使用现有feature规则，不在原型复制新的生产业务层。
- 内存状态刷新即清空；原型默认打开以便验收。正式助手继续收起，不自动打开或发起模型请求。
