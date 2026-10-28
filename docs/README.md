# 项目文档

## 目的

本目录保存 Formward 当前有效的产品和技术说明。文档按主题使用少量平铺文件，避免为短文档建立多层目录。

新会话从根目录 [handoff.md](../handoff.md) 开始，读取最新用户要求与接手顺序，再按主题查看这里的详细说明。

## 内容

- [maintenance-verification.md](maintenance-verification.md)：实际网页视觉检查、发布与数据核对证据。
- `status.md`：当前实现、验证结果、关键代码位置和待完成工作，供后续协作快速恢复上下文。
- [code-study.md](code-study.md)：面向仅有初步 HTML／TypeScript 知识的项目学习指南；从浏览器、服务器和组件开始，区分组件函数名、定义文件与职责，逐项对应饮食页组件并示范查找定义、引入和使用；用虚构午餐讲清读取、输入、保存与数据库，后半部提供其他业务流程、观察工具、模块、全部表、设计取舍和开发检查。
- `product.md`：定位、用户价值、首版范围和长期路线。
- `milestones.md`：首版交付顺序和各阶段完成标准。
- `interface.md`：已确定页面的内容、布局与交互。
- `frame-calibration.md`：首页静态人物测量、离线拟合方式，以及视频首尾与静态端点的校准。
- [design-reference.md](design-reference.md)：手机与桌面设计、首屏信息层级和每次界面验收必用的统一标准；保留产品设计参考。
- [visual-research.md](visual-research.md)：总览的视觉调研、官方依据及双层关联参考图；趋势与单日读数联动、配色和缺测处理原则。
- `architecture.md`：轻量 Next.js 模块化单体边界。
- `ai-api.md`：身体与饮食 MCP + OAuth、原图传输、AI 令牌、HTTP 协议、网页预览确认和本地 Codex 试验步骤。
- `auth-setup.md`：Neon 配置、数据库 migration、内部账号创建、登录顺序与验证。
- `deployment.md`：Vercel 公网 HTTPS、正式地址、生产环境变量、共享限流和发布验收。
- `database.md`：数据库连接流程、逻辑关系图、全部物理字段与索引／约束字典、维护入口。
- `data-model.md`：核心数据、来源信息和外部生态扩展原则。
- `measurements.md`：身体记录的当前导入与回看、当地晨晚归属、空腹确认、数据库／界面／AI 接口方案，以及当天晨晚差和次晨变化的热量关联。
- [热量消耗](energy.md)：双模式消耗、运动包含关系、未知与零、双层关联总览及接口。
- [饮食记录](meals.md)：最近记录／历史热量图、食材库与按份填写、包装换算、历史兼容、原图和 AI 审核定位。
- `excel-import.md`：现有工作簿的迁移流程。

## 维护约定

文档只描述当前有效方案。实现改变产品、目录、数据或操作方式时，同步修改对应文件。
