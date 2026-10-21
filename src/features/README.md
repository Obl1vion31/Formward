# Features

## 目的

本目录按用户能够理解的功能组织业务代码。网页与 AI API 共同调用这里的函数。

## 初始功能

- `auth/`：登录、Session、AI Token、OAuth Provider 与账号连接。
- `mcp/`：远程 MCP 协议、工具说明与 OAuth 身份适配，调用已有 feature。
- `meals/`：饮食记录。
- `activities/`：每日消耗、活动明细、公式资料与共用审核业务。
- `measurements/`：身体测量。
- `dashboard/`：汇总与趋势。
- `records/`：身体、摄入和食材的统一审核草稿与事务协调。
- `imports/`：Excel 导入。

## 维护约定

Feature 初期使用少量文件。只有该功能真实变复杂时，才在其内部增加目录或抽象。

