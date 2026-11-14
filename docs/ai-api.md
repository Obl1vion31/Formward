# Formward AI 接口

## AI结果的字段解释

MCP 2.0.0公开18项工具；OpenAPI 1.15.1的HTTP路径和旧调用继续可用。成功结果包含fieldDefinitions。它是字段路径到中文解释的字典：*表示一层数组或对象成员，**表示任意深度；不是可提交的业务参数。只返回当前接口与本种结果实际存在的字段说明，错误和未授权结果保持原结构。

解释分别保存在measurements、meals、activities、training及records目录的ai-field-definitions.json中。MCP工具说明、HTTP协议、返回数据和离线评测引用同一份来源；common guidance只约束如何据数据回答，不替代具体字段定义。

| 要修改的说明 | 正式来源 |
|---|---|
| 身体日期、均值和差值 | [measurements/ai-field-definitions.json](../src/features/measurements/ai-field-definitions.json) |
| 饮食、食材和图片 | [meals/ai-field-definitions.json](../src/features/meals/ai-field-definitions.json) |
| 消耗及运动包含关系 | [activities/ai-field-definitions.json](../src/features/activities/ai-field-definitions.json) |
| 训练目标、实际组次和单位 | [training/ai-field-definitions.json](../src/features/training/ai-field-definitions.json) |
| 查询、审核、连接及共用回答规则 | [records/ai-field-definitions.json](../src/features/records/ai-field-definitions.json) |

工具与字典的对应关系由[records/ai-field-definitions.ts](../src/features/records/ai-field-definitions.ts)维护。混合批次按body、meal、energy、training分别选取解释，训练审核入口也遵守这个边界，避免同名weightKg把身体体重和训练负重混在一起。

| 内容 | 必须区分的口径 |
|---|---|
| 身体sevenDay | window是本页结束日及前6天；各指标start/end是有效样本首末日期。change是本窗口首尾有效晨间空腹实测差，不是前后两周均值比较；previousChange仅比较锚点与前一个日历日，缺任一天为null；average按coverage个有效日求均值，缺测不补0。体重差kg，体脂差百分点。 |
| 旧analyses.summary | scope=latest_available_seven_days表示各指标当前最新有效晨间日及前6天，不随所查历史区间变化，不能冒充历史区间统计。 |
| 饮食 | 已保存餐次与全天是否记全分别判断；逐指标已知部分合计不冒充完整摄入。食材基准营养、每份、参考量和本次总量不同，查询已换算营养不重复乘数量。 |
| 消耗 | totalKcal是正式采用结果；recordedTotalKcal是原值，additionalKcal已参与采用，included运动不再相加；cumulative为当天累计，不冒充完整日。 |
| 训练 | 模板目标、排期与实际会话分开，按status识别完成；秒、米、kg不混用，排期不自动产生热量。 |
| 修改及审核 | 省略保留，允许清空的字段只有用户明确要求才传null；version与revision不同。canConfirm不等于保存，completed仍需逐项保存数量支持，取消本次不删除已有记录。 |
| 附件及授权 | 上传complete只表示原图成功，关联预览与正式餐次保存是后续阶段；connected不代表所有权限已授予或已有健康记录。 |

字段解释由AI出口附加，不写入原请求、草稿摘要、健康表或审计。MCP正文JSON与structuredContent一致；豆包查询实体的result_json包含同一份解释。客户端应刷新工具定义并用新对话核对，不把协议离线检查通过当成模型回答质量通过。

例如虚构窗口为8月1日至7日，仅2日70kg、6日69kg有效，则change=-1、coverage=2、start=2日、end=6日；window仍是1日至7日。7日缺测时value和previousChange均为null，不能说“7日比昨天下降1kg”或“比前一周均重下降1kg”。

在项目目录运行node --import tsx scripts/export-ai-contracts.mts 私有评测目录/contracts.json，可离线导出18项正式工具、共用规则与字段解释，不执行业务工具。模型评测从同一来源导出，并冻结配置、隔离数据和原答；工具覆盖与回答质量分别验收。

记餐营养估算、食量追问、明确不估及历史保留的共用规则见[AI工具调用](ai-tool-contracts.md)。GPT与豆包规则相同，模型提交估算和依据，服务器不对缺失营养自动补数。

## GPT 与豆包的工具契约

MCP 2.0.0公开18项工具，原生MCP、豆包和站内助手共享正式定义。新增餐次preview_meals、已保存餐次修改preview_meal_changes、食材维护preview_foods各有职责；身体preview_measurements、消耗preview_energy、训练preview_training保留各业务规则。组合preview_record_bundle至少两类功能动作，get_preview统一查状态，update_preview只修改原待审草稿及补照片。完整参数和边界见[AI工具调用规则](ai-tool-contracts.md)。

## 网页与AI服务地址

日常网页统一为https://43.142.148.58。GPT／MCP、OAuth授权与令牌地址继续使用https://formward-ten.vercel.app，issuer及resource保持，既有GPT与Garmin连接无需重建。海外图片下载和私有Blob读取继续由Vercel后台执行；业务仍由上海检查并写入唯一主库。普通旧网页转国服，API、OAuth、旧页RSC及POST不随网页跳转。

身体、饮食、训练和混合预览返回的confirmationUrl统一为国服；未登录时保留原路径，登录后继续审核，不等于自动保存。不得把网页域名变更当作重新签发或扩大AI授权。两域Cookie独立，详细职责见[部署说明](mainland-deployment.md)。

## 当前兼容规则

旧MCP业务工具名已停用，不注册隐藏别名、不自动转接执行；旧会话需刷新工具目录。新旧MCP协议、现有OAuth连接和scope保持。旧预览编号、确认链接及HTTP路径继续可用，旧HTTP完整批量输入仍复用原业务函数。HTTP保留能力不代表向模型公开两个同用途入口。

## 统一连接与授权

完整接入使用authorize_formward统一检查并申请身体、饮食／食材、消耗和训练的查询与提交预览权限。该工具只返回连接状态，不读取健康内容、不生成预览或保存事实；OAuth同意仍由用户完成。缺权限时保留原有授权，并合并申请四类记录权限；只有读取权限的连接在日常查询补授权时只申请四类读取，明确调用完整接入或提交工具才申请提交权限。已有令牌不会因请求授权而自动扩权，旧客户端与单类授权继续可用。

在客户端刷新Formward工具列表后，可让AI“统一连接并授权Formward的全部记录能力”。授权页一次列出四类查询与提交预览，允许后再检查连接；AI接入页默认展示当前连接的四类实际权限，“连接详情 → 接入方式与补充权限”提供“复制授权指令”。刷新工具只更新定义，不代表已同意新增权限。

## 混合记录接口

MCP使用preview_record_bundle提交至少两类功能动作，一个任务只有一个父预览和最终确认链接。单纯多餐用preview_meals，模板加排期用preview_training，消耗加实际运动用preview_energy。已生成草稿统一update_preview，按原id/revision与key只改局部内容，漏项appendItems，不整批重建。

HTTP的POST /api/v1/record-operations及GET /api/v1/record-operations/{id}保持旧契约，包括单领域调用和旧完整items修正；只创建预览，最终仍须本人网页登录确认。MCP的组合限制在新工具边界执行，不修改兼容HTTP的计算或保存流程。

## ChatGPT 与其他 MCP 客户端

在用户当前使用的 ChatGPT「插件 → 添加自定义 MCP」入口，填写服务器地址 `https://formward-ten.vercel.app/api/mcp`，认证方式选择 OAuth。添加后跳转到 Formward 登录，在授权页核对客户端名称和权限，点击“允许连接”。其他支持远程 Streamable HTTP 和 OAuth 的大模型客户端使用同一地址。界面的名称和可用入口以客户端当前账号为准。

服务已发布到上述正式地址，部署维护见 [公网部署](deployment.md)。连接后可以查询自己的记录、提交录入／修改预览，再打开返回的 `confirmationUrl` 登录确认。仅把网站网址发给聊天模型不会建立 MCP 连接。

| 工具 | 输入与行为 | 权限 |
| --- | --- | --- |
| `authorize_formward` | 无参数；检查完整连接、缺权限时请求一次统一OAuth授权，不生成健康预览 | 身体／饮食／消耗／训练读写 |
| `query_energy` | from／to／timezone查询最终消耗、录入分项、额外运动及包含关系 | `energy:read` |
| `preview_record_bundle` | items混合预览，返回统一确认链接 | 按内容检查对应write权限 |
| `get_preview` | 查询混合审核状态 | 按内容检查对应read权限 |
| `get_profile` | 返回已连接账号的稳定标识与显示名称 | `profile` |
| `query_measurements` | 可选 from／to、choices、timezone；返回本账号记录、单位、来源、实测／估计、摘要、趋势与时区上下文 | `measurements:read` |
| `preview_measurements` | operationId、1–100 条 items、可选 timezone；生成预览并返回网页审核链接 | `measurements:write` |
| `get_preview` | 提交返回的 id；查询逐行状态、数量和确认链接 | `measurements:read` |
| `import_meal_images` | files私有保存原图，返回附件id，不保存正式餐次 | `meals:write` |
| `search_foods` | q搜索食材及规格／营养／版本 | `meals:read` |
| `query_meals` | from／to查询餐次及每日已记录合计 | `meals:read` |
| `preview_foods` | operationId、actions生成饮食／食材预览 | `meals:write` |
| `get_preview` | id查询饮食审核状态 | `meals:read` |

工具定义提供名称、说明、JSON Schema、权限和操作提示，MCP 客户端把这些说明交给模型决定调用哪个工具及填写哪些参数。模型获取业务结果，账号密码和令牌由客户端及授权流程管理。网页、HTTP API 与 MCP 调用同一 feature，不分别维护健康规则。

OAuth 使用授权码 + S256 PKCE，授权码有效 5 分钟；访问令牌有效 1 小时，刷新令牌轮换，账号连接最多 30 天。支持 CIMD 客户端元数据发现与 DCR 动态注册，兼容当前及 2025 MCP 协议。访问令牌校验签名、issuer、resource audience、到期时间，以及数据库中本账号的连接、当前同意与权限。刷新后连接标识保持，重复请求及审核归属稳定。

登录后的“AI 接入”按AI组织，已接入优先，默认展示有效连接的四类查询／提交预览权限；未接入显示可申请权限及自己的接入步骤。豆包属于需联系管理员加入白名单的内测，未公开申请入口。时间、接入方法与撤销位于连接详情，失效历史连接折叠保留。AI提交记录默认收起，展开后可按发起来源及审核状态筛选；初始化记录仍在饮食页。时间使用北京时间，业务日期和提交时间分开，各预览使用真实有效期。撤销先确认，立即阻止访问、续期及未确认预览；重新授权创建新连接，不恢复旧连接的预览。OAuth 凭据和客户端密钥按摘要保存，JWT 签名私钥加密保存；不要把网页登录密码或数据库凭据交给模型。

公开发现入口为 `/.well-known/oauth-protected-resource/api/mcp` 和 `/.well-known/oauth-authorization-server/api/auth`，公开 JWKS 在 `/api/auth/jwks`。发现信息和工具定义不含健康数据；未授权 MCP 请求返回 401 和 OAuth discovery challenge，默认同时请求账号识别、续期和身体／饮食／消耗／训练读写范围，客户端可明确申请较小范围。

## 饮食照片与补问

import_meal_images只导入当前账号真实附件，最多8张、每张20 MiB，JPEG／PNG／WebP；图片识别由模型完成。模型只依据可见内容，身份模糊时表达候选；实际食量未给先追问，不默认整盒或猜克数。

成功附件ID仍须加入新预览，或通过update_preview的原key及addImageIds追加到原草稿。部分失败保留成功项，不另建记录；上传、关联预览与正式保存是不同阶段。旧HTTP /pending-images继续可用，MCP只公开统一草稿修改工具。

## 手动令牌与本地 HTTP 使用

登录后从小助手“常用功能 → AI 接入”进入，展开“高级接入 · 手动令牌与 HTTP”，填写令牌名称并选择“查询与提交预览”或“只读”。令牌有效30天，原文仅创建时显示一次，关闭高级区或刷新后清除；可经确认随时撤销。数据库只保存不可逆摘要，丢失时撤销并创建新令牌。高级区提供其他MCP客户端、API地址、公开OpenAPI及可复制的HTTP接入说明；本人近期AI提交在独立的折叠记录区查看。

1. 在工作区交互终端运行 `pnpm ai:setup`，输入地址和隐藏输入的令牌。配置写入权限 0600、被 Git 忽略的 `.env.ai.local`，拒绝覆盖已有文件。
2. 运行 `pnpm ai:request GET /measurements`，或把接入说明交给能发送 HTTP 请求的 AI，让它先查询。
3. 把真实提供的候选内容整理为私有 `data/exports/` JSON，再运行 `pnpm ai:request POST /measurement-operations data/exports/请求.json`。
4. 打开响应中的 `confirmationUrl`，在 Formward 登录、逐行核对前后值。可修改并应用修改，逐项确认仅标记草稿，最后在底部统一保存未取消内容。
5. 运行 `pnpm ai:request GET /measurement-operations/操作ID` 检查每行结果和数量。

助手只通过 HTTP 使用私有配置，不读取数据库配置或打印令牌，不跟随重定向。仅允许 HTTPS 或本机 HTTP。Formward 令牌不是模型服务的 API Key，也不需要网页登录密码。公网地址为 `https://formward-ten.vercel.app`，OpenAPI 为 `https://formward-ten.vercel.app/api/v1/openapi.json`，外部 AI 可使用此地址和访问令牌。部署维护见 [公网 HTTPS 部署](deployment.md)；HTTP API 保持独立手动令牌鉴权；OAuth 连接使用上述 MCP 入口。

## HTTP 协议

数据接口使用 `Authorization: Bearer <令牌>`，不接受网页登录 cookie 代替。账号由令牌确定，不能自填 userId。响应禁止缓存。协议在 `/api/v1/openapi.json`。

| 入口 | 用途 |
| --- | --- |
| `GET /api/v1/measurements` | 本账号记录、来源、日期、摘要、趋势、配对与候选，以及本次系统时区与当地日期 |
| `POST /api/v1/measurement-operations` | 跨日期实测批量及兼容单日预览；返回一个审核链接 |
| `GET /api/v1/measurement-operations/{id}` | 预览、草稿、逐条状态、数量与确认链接 |
| `GET /api/v1/openapi.json` | 公开协议，不含账号数据或令牌 |

查询支持 `from`、`to`（YYYY-MM-DD）。记录与趋势按区间筛选，摘要读取完整历史，与网页一致。`choices` 为 URL 编码 JSON，例如 `{"2024-04-04:daytime":"recordId"}`，只接受本账号对应日期时段的实测，仅影响本次分析，不持久修改代表选择。

推荐一次提交一批 `items`，最多 100 条、64 KiB。下面数值、日期和来源均为虚构格式示例，不能当成用户数据：

```json
{
  "kind": "batch",
  "operationId": "fictional-example-0001",
  "items": [
    {
      "kind": "save_record",
      "date": "2024-04-04",
      "period": "daytime",
      "weightKg": "70.20",
      "bodyFatPercent": "20.10",
      "fasting": true,
      "deviceLabel": "虚构体重秤",
      "timezone": "+08:00"
    },
    {
      "kind": "save_record",
      "date": "2024-04-05",
      "period": "evening",
      "bodyFatPercent": "20.40",
      "deviceLabel": "虚构体重秤"
    },
    {
      "date": "2024-04-04",
      "period": "evening",
      "metric": "weightKg"
    }
  ]
}
```

体重单位 kg，体脂率 %，数值为最多两位小数的字符串。日期必须明确为 YYYY-MM-DD，相对日期先确认用户所在地日期。晨间须明确确认空腹 `fasting:true`，旧非空腹／未知晨间只读；晚间固定非空腹。新实测来源须由用户提供，或明确确认不填写；缺少来源时 AI 先询问实际设备／应用名称或是否留空，可列出查询返回的 `sources` 供选择，不能擅自沿用，也不能用“ChatGPT 手动提供”“设备未注明”等描述代填。确认不填时传 `deviceLabel: null` 与 `sourceUnspecifiedConfirmed: true`；该字段只能是布尔值，与非空来源同时提供为 true 会阻止保存。已有记录省略来源保持原值，主动清空须同样确认。其他未提供字段省略。未知不猜、不填 0。省略字段保留已有值，显式数值 null 才清空，每条实测至少一个主要指标非空。

修改已有值、来源或时区，在对应 `save_record` 项提供 `recordId` 和查询返回的 `updatedAt` 作为 `version`。同值跳过，缺项可补；不同已有值产生行内冲突，网页修改时须明确选择历史记录。批量形状错误会拒绝请求；业务无效值留在对应行，供用户纠正。批内重复目标产生冲突，修改目标或取消其中一行后重新预览。

估算项仅保存所选 metric，不自动填另一空项。依据只读取已保存实测，同批未确认实测不参与。整批确认先保存估算，使结果与审核依据一致；审核草稿中的实测不会作为同批估算依据。样本不足跳过并保持空白；冻结历史拒绝新增估计。

兼容原 `save_day` 请求：`{kind:"save_day",operationId,date,periods:{daytime:{...},evening:{...}},timezone?}`；历史编辑字段在对应时段内。已有单日／单项链接使用同一个可编辑审核页。

提交与状态响应中的 `needsUserInput` 列出待核对的 `itemId`、日期、时段、字段、错误码和提示；来源缺失的错误码为 `source_confirmation_required`。AI 应说明并询问待补项；有未解决问题的行不可确认。缺来源也可先保留为待修改预览，用户在网页补填或直接留空后应用修改，再确认保存。原请求和审核草稿分别保留，来源留空确认进入审计。

## 一个链接审核整批

统一审核页按身体状况、摄入记录、食材库记录和消耗记录排列，只显示本次内容。新增直接展示内容，餐次修改突出增减及修改后合计，旧内容按需展开；新增图片贴近对应记录，变更图片展示前后对照。修改先更新草稿，取消可恢复；普通餐次只需底部一次“确认保存”，不显示标记核对或照片清单。缺图可直接保存文字；同日严格重复餐只轻提示，消耗关系未定才提出对应问题。所选内容在一个数据库事务中保存，失败保留输入并整体回滚。手机压缩信息间距，底部吸附按钮保留安全区；依据、备注和审核技术信息折叠。保存成功显示勾，2秒后返回总览，保留立即返回入口；重新打开已完成链接不自动跳转。

来源编辑与身体录入共用来源输入，点击展开本账号历史建议，支持移除；来源可填写或直接留空后应用修改，历史快照不受建议移除影响。已有部分保存的旧审核保留原结果，剩余内容统一确认，不重复写入。

## 时区与审计

界面和查询响应增加 `timezoneLabel`，显示 `GMT+8（东八区）`、`GMT+7（东七区）`，半小时／一刻钟用 `GMT+5:30`、`GMT+5:45`。时区选择只提供 GMT-12 至 GMT+14 的 27 个整点选项，存为 `+08:00` 等固定偏移。旧非整点偏移仍按原值显示。旧 IANA 值不自动转换；标签按准确记录的原偏移，或日期时段当天的地区偏移计算，跨夏令时当天显示两个可能偏移。未知显示“未指定”。

每次新录入自动采用当次系统时区，无须用户重复填写。`pnpm ai:request` 每次读取所在设备的系统偏移并发送 `X-Formward-Timezone`，不改写私有请求文件。其他客户端可传相同请求头；未传则采用 FORMWARD_TIMEZONE 配置地区的当次偏移，未配置才读取服务系统偏移。公网服务配置 Asia/Shanghai，默认 +08:00，不依赖平台固定的 UTC 时区。`GET /measurements` 的 `context` 返回 `timezone`、`timezoneLabel` 和 `localDate`，供 AI 读取本次默认值。无法发送自定义请求头的客户端可在候选 timezone 中明确提供时区。

新记录省略 `timezone` 时由 API 自动带入，明确值优先；显式 null 保持未指定。审核页回显自动采用的时区，仍可选择其他时区或点击“采用设备时区”，然后应用修改、确认。身体记录页面的常规编辑也支持晨晚独立修改时区，选择后点击“保存录入”，无需重输体重和体脂。已有记录补缺或修改省略时区时保留原值，历史时区变更须明确指定记录与版本。`preview.defaultTimezone` 保存本次默认值；自动填入只进入审核草稿，原始请求保留。刷新和相同 operationId 重试保留首次预览／用户修改后的时区，下一次新操作重新读取系统时区。

显式历史修改保留 `sourceLocalTime` 与 recordDate：准确时间重算 UTC，未知钟点继续为 day_period／assumed，UTC 与准确偏移为空。

健康记录、来源历史、写入批次、审计和行结果同一事务。新记录 entryChannel 为 api、actorType 为 ai；历史编辑保留原入口和原始输入。审计关联 tokenId 或 oauthConnectionId、操作、确认人／时间，并保存行 ID、审核版本、原始候选、用户审核草稿和编辑者／时间。审计失败整体回滚。

## 饮食接口

饮食和食材采用本次实际输入，不按历史倍数追加确认。餐次可记录明确0或全部未知营养，未知保持null；空餐、空名称、非法日期／数量／单位仍阻止保存。同日同餐次的严格重复只显示一次“本日已有相同内容的餐次”与查看入口，不要求勾选或再次确认，不自动合并删除。请求幂等、账号归属、版本冲突、草稿保护及AI最终网页登录确认继续有效。消耗、运动及身体原有数值提醒保持。allowDuplicate仅兼容，duplicateIds及重复提示不进入needsUserInput，也不使canConfirm变为false。旧待确认饮食预览在展示及确认时采用当前规则；真实业务错误与有效期继续生效。

MCP增加search_foods、query_meals、preview_foods、get_preview，分别使用meals:read／meals:write；已有身体连接需重新授权。HTTP提供GET /foods?q=、GET /meals?from=&to=、POST /meal-operations、GET /meal-operations/{id}，公开协议1.11.0。输入operationId、actions；save_meal含date、mealType、items，已有食材用foodId＋foodVersion、同单位quantity，新食材可用foodDraft。杂只估未单列的剩余食物，whole整餐估算须为唯一项。AI 标签与成分表需依据，未知null；手动合并来源 reference 为标签／成分表，旧来源继续兼容。新手动自由项用 kind:food，营养直接表示本次摄入，分量不再次相乘。确认链接为/dashboard/meals/review/{id}，15分钟有效，原请求与修订草稿独立；正式保存仅网页登录确认，权限撤销即时阻止。结构、初始化和实例定位见[饮食记录](meals.md)。
\n照片上传需先实际调用import_meal_images，再提交imageIds及expectedImageCount；失败也保留预期张数并说明具体错误。canConfirm表示正常确认可用，canConfirmWithoutImages表示可由用户选择先保存文字。补传与无图保存选择仅在登录网页完成，API没有代确认入口。每项食物可提交reviewExplanation，分别说明identity、amount、cooking、nutrition的来源、basis及uncertainty；已有basis和食材快照继续兼容。


食材查询实时返回 foodLibraryRules；估算说明保留成分分量、参考来源／计算和汇总结果，不只重复营养表，也不写个人餐次背景或泛化使用提醒。新 save_food／foodDraft 不合规则在创建预览前返回 food_description，AI 应改写文案后沿用 operationId 重试，无需为文案再询问使用者。餐次个人备注及既有食材引用保持。自定义 MCP 的工具定义更新后，按 [OpenAI 官方说明](https://developers.openai.com/plugins/deploy/connect-chatgpt#refresh-metadata) 刷新连接并开启新对话；刷新不会修正已保存在 Formward 的文字。

食材可选 category:meal／ingredient，新条目省略为 ingredient，省略更新保留原分类；查询返回分类。餐项查询返回稳定 id，编辑时以 originalItemId 引用同一餐次／版本原项。食材已永久删除的旧餐项不传 foodId 或 nutrition，服务端沿用原快照按同单位 quantity 换算；不能将已删食材用于新餐。永久删除只在网页最近删除提供，不新增 MCP 工具或 HTTP 写接口。

消耗查询为GET /api/v1/energy与MCP query_energy，统一提交支持每日消耗与活动的新增／修改；整条删除及恢复仅限网页手工操作。OAuth独立energy:read／energy:write，旧连接须重新授权；手动令牌沿用read／write。需要完整接入或补齐权限时使用authorize_formward统一申请并由用户同意，不必先提交健康记录来触发授权。AI接入页面按连接以相同格式展示身体、饮食／食材、消耗和训练计划权限；仅刷新工具列表不会增加OAuth授权。规则、字段及虚构例子见[消耗文档](energy.md)。

消耗采用entryMode（components／total）与activityMode（total／activities）显式选择，静息与活动分别使用restingSourceSystem／activeSourceSystem；总数来源仍用sourceSystem。旧无模式请求兼容原口径，估算及notes内部保留。save_energy_defaults及删除／恢复已退役，旧预览必须刷新并取消退役项，不能借旧链接写入。查询不返回defaults，不给未录日期自动生成消耗；公式计算已撤下，兼容formula返回estimate:null、retired:true，旧资料与审计保留。详细字段、未知／零与虚构例子见[消耗](energy.md)。

AI只允许新增或修改，不得整条删除或恢复（包括批量）；餐内增减经审核且不得清空整餐。网页手工删除恢复不受影响，取消本次待保存项不删除既有记录。旧待确认申请也在实际写入前验证。

当前协议增加nutritionBasis／perPortionNutrition、servingQuantity／servingUnit、运动inclusion；旧nutrition仍是本次总量，旧明细不自动相加。静息公式和资料动作停用。普通单餐只要底部一次确认，缺图不阻止文字保存；总数与运动关系不明时列独立核对项，不能按大小推断。MCP服务1.11.0，工具仍13个，不增加OAuth权限；刷新工具列表可获得新字段。

## 网页数字展示与手工修改

蛋白质／碳水／脂肪在网页查看时最多显示一位小数并去掉末尾0，网页填写及AI确认中的手工修改最多接受一位小数。摄入热量、消耗及热量差仍四舍五入显示整数，网页手填热量及消耗仍只接受整数；身体和kg变化保留两位。AI提交营养时保留用户提供的有效精度，公开HTTP／MCP既有字段、最多四位小数兼容和查询原精度保持。热量计算、合计与落库不因展示提前取整；换算结果及未修改旧值也不因打开、聚焦、失焦或只改备注而改写。未知仍为null，明确0保留为0。运动本次总数与当天额外增加分开解释：已包含的运动不重复加入当天总数。

## 训练动作与计划

search_exercises、query_training、preview_training、get_preview使用独立training:read／training:write，旧连接刷新定义后仍须重新授权。GPT可查询统一150项动作库、本人模板和安排，创建或修改模板、一次排多天；新模板以templateRef引用同批key，已有项目带id/version。提交复用统一网页审核，预览24小时有效，确认后保存到同一训练日历；pending不等于已同步。目标与实际完成分开，不生成热量或完成记录，取消不删除既有事实。完整字段、单位及演示见[训练记录](training.md)。统一HTTP记录预览同样接受这两种动作，OpenAPI版本1.14.0；不增加HTTP确认入口。

## 身体记录规则

身体只接收实测，未知保持null，不要求AI猜测体重或体脂。身体估算能力已移除；旧请求返回410 feature_removed，含该项的旧混合任务整批停止且原草稿保留。查询、图表、统计和导出不返回历史估计或计算依据。网页确认、归属校验、版本和请求防重继续有效；饮食及热量估算保持原规则。

## 查询统计与原草稿修正

查询按summary／details及分页返回服务器统计；只对同口径范围比较，优先statistics和balance，未知不补0。身体窗口、有效样本日期、相邻日差与首尾差各自说明。

get_preview按原编号查询新旧预览，update_preview按最新revision、稳定项目key提交局部变化；原payload及首次摘要不变。修改前验证原授权、全部实际领域权限、有效期、版本和附件归属。源食材引用与自由营养互斥，服务器保留未改内容和精度；实际模型改善须由隔离复测确认，接口成功不代表答案或网页流程通过。
