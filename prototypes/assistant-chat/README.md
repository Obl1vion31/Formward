# 内嵌小助手本地原型

电脑采用同一非模态浮窗中的待办／聊天双栏，窄窗与手机切换聊天／待办；手机采用底部面板交互。消息、照片、引用、工具摘要、预览和限制由模拟适配器提供。照片只在浏览器内存显示，不上传、不存储；关闭保留会话与草稿，刷新清空。

运行：仓库根目录执行 node prototypes/assistant-chat/server.mjs，仅监听127.0.0.1:4177。使用仓库已有React和esbuild，不安装新依赖；产物位于忽略目录.codex/assistant-chat/build。服务器仅提供演示资源和既有品牌图标，不暴露仓库、API、凭据或正式记录。

“演示场景”可切换正常问答、照片、补充、引用、失败、过期及上限。自然语言仅覆盖固定流程，不是生产意图识别或模型能力。营养与来源均为虚构示例，真实模型、预算及持久化另行接入。

## Direction contract

THESIS：用业务任务贯穿聊天和提醒，回答正文优先，过程按需展开，不把每段文字做成卡片。

OWN-WORLD：Formward暖白／石墨／金色、既有品牌与漂浮导航；正文16px、操作14px、辅助13px、44px触控。表面接近不透明，背景可见。

STORY：看到昨日待办及当前补充任务，补充实际食量后生成预览，经演示确认更新待办；忽略不调用模型、不标记饮食完整。

FIRST VIEWPORT：桌面右下860px浮窗，左220px待办、右聊天，标题18px、输入固定底部；手机近全屏底部面板，聊天／待办切换。

FORM：已认可的同窗双栏／手机底部面板，延续既有世界，code-led。seed: none (unavailable)

FINISH：unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

既有系统规范统一在docs/design-reference.md，本次普通扩展不重建全站DESIGN.md。Unslop沿用a6f121e（Damir Sokolovsky，CC BY 4.0）。截图、检查和未测项见qa.md。
