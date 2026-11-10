# Features

## 目的

本目录按用户能够理解的功能组织业务代码。网页与 AI API 共同调用这里的函数。

## 初始功能

- `auth/`：邀请制账号管理、登录、Session、AI Token、OAuth Provider 与账号连接。
- `mcp/`：远程 MCP 协议、工具说明与 OAuth 身份适配，调用已有 feature。
- `doubao/`：豆包身份交换、独立 OAuth 绑定及 MCP 协议适配，复用既有业务工具与撤销规则。
- `meals/`：饮食记录。
- `activities/`：每日消耗、活动明细、公式资料与共用审核业务。
- `garmin/`：Personal API 限时读取客户端、字段核对与独立本机私有预览，不直接连接数据库。
- `data-sources/`：按账号的数据连接、来源事实、指标采用规则、同步、冲突和人工保护；首批仅固定账号开放 Garmin Personal。
- `measurements/`：身体测量。
- `dashboard/`：汇总与趋势。
- `records/`：身体、摄入和食材的统一审核草稿与事务协调。
- `imports/`：Excel 导入。
- `exports/`：本人有效记录的私有Excel下载，复用服务端汇总并保留来源、单位和未知状态。

## 维护约定

Feature 初期使用少量文件。只有该功能真实变复杂时，才在其内部增加目录或抽象。



onboarding/负责首次使用、本人身高生日、教程播放与管理员只读演练，复用auth会话和账号行锁。

training/负责训练会话、动作组次、模板快照、日历排期和事务审计，独立于全天消耗；网页使用同一feature，当前不新增AI写入能力。
