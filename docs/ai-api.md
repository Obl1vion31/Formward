# 身体记录 AI 接入

当前接口覆盖身体记录界面：晨晚体重／体脂、数据来源、记录详情与历史、候选分析、摘要与趋势、历史编辑、单项显式估算。网页和 API 使用同一 measurements feature。饮食、运动、导入、删除／恢复、测量时间与时区编辑不属于本版。

## 在网页授权

登录后点击邮箱右侧的“AI 接入”。创建时填写名称，选择“查询与提交操作”（默认）或“只读”。令牌固定有效 30 天，完整原文只在创建后显示一次，可复制；关闭或刷新后不能找回。列表只显示名称、前缀、权限、有效期与使用情况，支持撤销。数据库只保存 SHA-256 摘要；丢失时撤销旧令牌并创建新令牌。

页面提供 API 地址、公开 OpenAPI 协议和可复制的 AI 说明，以及最近 20 次提交。这里的令牌授权 AI 使用 Formward，不是 OpenAI 等模型服务的 API Key。当前先在运行项目的本工作区中用 Codex 发 HTTP 请求；无需接入模型供应商或上传项目源码。

## 本地试验

1. 在 Formward 工作区的交互式终端运行 `pnpm ai:setup`。输入网页地址，再粘贴令牌；令牌输入不显示。工具写入权限 0600、被 Git 忽略的 `.env.ai.local`，拒绝覆盖已有配置。换令牌时先删除该文件，再运行设置。
2. 运行 `pnpm ai:request GET /measurements` 查询当前账号。也可把页面里的接入说明交给当前工作区的 Codex，让它调用这个 HTTP 助手。
3. 将用户真实提供的候选内容写入私有 `data/exports/` JSON，然后运行 `pnpm ai:request POST /measurement-operations data/exports/请求.json`。文件不能提交 Git 或放进 public。
4. 打开响应中的 `confirmationUrl`，登录本账号、核对前后值并点击“确认保存”。用 `pnpm ai:request GET /measurement-operations/操作ID` 查询最终状态。

助手只读取 AI 私有配置并请求 HTTP，不读取数据库配置、不直接写数据库、不打印令牌，不跟随重定向。仅允许 HTTPS 或本机 HTTP。普通远程聊天客户端访问不了工作区 localhost 时，需后续部署或可访问的服务地址；当前未进行外部部署。

## 接口

所有数据接口使用 `Authorization: Bearer <令牌>`，不接受网页登录 cookie 代替。当前账号由令牌确定，请求不允许自填 userId。响应禁止缓存。完整协议在 `/api/v1/openapi.json`。

| 入口 | 用途 |
| --- | --- |
| `GET /api/v1/measurements` | 查询记录、来源、已保存日期，以及两个指标的摘要、趋势、逐日配对和候选 |
| `POST /api/v1/measurement-operations` | 提交一个日期的部分字段修改，或一个空指标的估算预览 |
| `GET /api/v1/measurement-operations/{id}` | 查询本账号预览、确认链接、状态与结果 |
| `GET /api/v1/openapi.json` | 公开协议，不含账号数据或令牌 |

查询可用 `from`、`to`（YYYY-MM-DD）。摘要读取完整历史，与网页一致；记录和趋势按区间筛选。`choices` 为 URL 编码 JSON，例如 `{"2024-04-04:daytime":"recordId"}`；只接受本账号对应日期时段的实测，只影响本次分析，不持久修改代表选择。

录入请求形状如下，数值仅为虚构格式示例：

```json
{
  "kind": "save_day",
  "operationId": "fictional-example-0001",
  "date": "2024-04-04",
  "periods": {
    "daytime": {
      "weightKg": "70.20",
      "bodyFatPercent": "20.10",
      "fasting": true,
      "deviceLabel": "虚构体重秤"
    },
    "evening": { "bodyFatPercent": "20.40", "deviceLabel": "虚构体重秤" }
  }
}
```

体重固定 kg，体脂率固定 %，数值使用最多两位小数的字符串；未知不猜、不填 0。日期明确使用 YYYY-MM-DD，相对日期由 AI 与用户澄清。晨间只接受用户确认的空腹实测，旧非空腹／未知晨间只读；晚间固定非空腹。新实测来源必填，省略字段保留原值，显式数值 null 清空；每条实测至少一个主要指标有值。timezone 可省略或提供 IANA 名称，新记录不虚构准确时间，已有准确时间、时区、原始输入和录入入口保持。

历史编辑在对应时段额外提供 `recordId` 和查询返回的 `updatedAt` 作为 `version`。只改来源也采用这一明确编辑形式。估算使用 `kind: "estimate_cell"`，携带 `operationId`、`date`、`period` 和 `metric`（weightKg／bodyFatPercent）；只保存这一项，依据读取相同模型，样本不足保持空白，冻结范围拒绝新增估计。

## 重复、冲突与确认

- 昨日已经有相同实测：显示“已记录相同内容，将跳过”，不生成重复测量。
- 昨日只有体重，本次补体脂：合并缺项，保留体重、时间与来源；展示前后值。
- 昨日体重与本次不同：显示冲突，整次操作不能确认；AI 查询并向用户核对，再明确指定 recordId／version 提交修改。
- 预览后网页改过身体记录：确认拒绝旧预览，AI 重新查询并用新 operationId 提交。

预览保留 15 分钟，绑定账号、发起令牌、请求内容和身体记录快照。单日两个时段一起保存或一起拒绝；完全重复和样本不足不需要保存。API 不提供确认端点，也不接受 `confirmed: true`。网页 Server Action 验证会话归属、令牌仍有效、快照未变和业务规则，在同一事务保存健康记录、来源历史、批次、AI 审计和 confirmed 状态。取消不写健康记录。

同请求重试复用 operationId 和相同内容；更换内容或令牌需要新 ID。重复确认返回原结果。不同操作并发确认时，后确认的旧快照拒绝，防止覆盖。只有 `status: confirmed` 代表已完成保存；pending／cancelled／expired 或冲突不得宣称已保存。已完成结果保留，网页最近提交可回看。

新记录入口为 api、操作者为 ai，来源仍是用户提供的秤／应用名称。修改既有记录保留原入口；审计保存前后值、tokenId、操作 ID、确认账号和确认时间。审计失败时全部回滚。批量导入确认和其他模块继续留作后续探索。
