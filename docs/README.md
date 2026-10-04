# 项目文档

## 目的

本目录保存 Formward 当前有效的产品和技术说明。文档按主题使用少量平铺文件，避免为短文档建立多层目录。

新会话从根目录 [handoff.md](../handoff.md) 开始，读取最新用户要求与接手顺序，再按主题查看这里的详细说明。

## 内容

- `status.md`：当前实现、验证结果、关键代码位置和待完成工作，供后续协作快速恢复上下文。
- `code-study.md`：代码阅读指南，按可见功能解释文件用途、代码识别线索和修改影响，覆盖页面、样式、动画、工具配置、登录与数据，并提供修改位置速查。
- `product.md`：定位、用户价值、首版范围和长期路线。
- `milestones.md`：首版交付顺序和各阶段完成标准。
- `interface.md`：已确定页面的内容、布局与交互。
- `frame-calibration.md`：首页静态人物测量、离线拟合方式，以及视频首尾与静态端点的校准。
- `design-reference.md`：MacroFactor 调研与 Formward 的 PC 端设计方向。
- `architecture.md`：轻量 Next.js 模块化单体边界。
- `auth-setup.md`：Neon 配置、数据库 migration、内部账号创建、登录顺序与验证。
- `data-model.md`：核心数据、来源信息和外部生态扩展原则。
- `excel-import.md`：现有工作簿的迁移流程。

## 维护约定

文档只描述当前有效方案。实现改变产品、目录、数据或操作方式时，同步修改对应文件。
