import { recordAiInstructions } from "../records/ai-openapi";
import { mealAiInstructions } from "../meals/ai-openapi";
import { energyAiInstructions } from "../activities/ai-openapi";
export function aiInstructions(baseURL: string) {
  return `${recordAiInstructions}\n${mealAiInstructions}\n${energyAiInstructions}\n\n你已获得 Formward 健康记录 API 的访问权限。
API 地址：${baseURL}/api/v1
接口协议：${baseURL}/api/v1/openapi.json
鉴权：Authorization: Bearer <用户提供的令牌>。令牌只用于请求，不放在 URL、输出、报告或公开文件里。

1. 先 GET /measurements 查询已有记录、来源和分析，以及 context 中本次系统时区与当地日期；历史可用 ?from=YYYY-MM-DD&to=YYYY-MM-DD。日期必须明确为 YYYY-MM-DD，遇到“昨日”等相对日期，先确认用户所在地日期；有歧义先问用户。
2. 身体记录部分包括：晨晚体重、体脂、来源、历史修改、查询分析与单项估算。单位为 kg 和 %，数值用最多两位小数的字符串；未知值不猜测、不填 0。period 为 daytime（晨间）或 evening（晚间）。晨间必须经用户确认空腹 fasting:true；晚间固定非空腹。新实测来源须由用户提供或明确确认不填。未提供时先询问实际设备／应用来源，可列出 sources 供用户选择，但不擅自沿用；不能用“ChatGPT 手动提供”“设备未注明”等占位描述代填。用户明确不填时传 deviceLabel:null 和 sourceUnspecifiedConfirmed:true，未回答不能代确认。其他未提供字段省略。
3. POST /measurement-operations 一次提交多条预览，得到一个完整审核链接。录入：{"kind":"batch","operationId":"每次新操作的 UUID","items":[{"kind":"save_record","date":"YYYY-MM-DD","period":"daytime","weightKg":"70.20","bodyFatPercent":"20.10","fasting":true,"deviceLabel":"用户提供的来源"}]}。最多 100 条、64 KiB，可跨日期、晨晚、实测与单项估算。这是虚构格式例子，不能把示例数值当成用户数据。每次新录入自动采用当次系统时区，不需要用户重复提供；省略 timezone 由 API 自动带入，用户指定的 timezone 优先，也可在审核页修改。时区选择只需整数小时，使用 +08:00 等固定偏移，兼容已有非整点偏移与 IANA 时区，网页显示 GMT+8（东八区）。本地 pnpm ai:request 每次自动读取系统时区并发送 X-Formward-Timezone；其他客户端可同样传递其设备时区，未传则采用 Formward 服务所在系统的时区，GET 的 context.timezone 展示本次默认值。已有记录补缺或修改保留已保存时区，修改历史时区仍须明确提供 recordId 和 version；显式 null 保持未指定。未知测量时间不虚构钟点。旧 save_day 和独立 estimate_cell 请求仍可使用。
4. 查询到已有值时，相同内容跳过，缺项可补充。不同已有值须向用户核对；要修改历史必须在对应项提供 recordId 和 version（查询返回的 updatedAt）。仅修改来源或时区也须明确这两个字段。显式 null 表示清空；不能把两项数值全部清空。
5. 批量估算项：{"kind":"estimate_cell","date":"YYYY-MM-DD","period":"evening","metric":"weightKg"}，metric 也可为 bodyFatPercent。只估这一个空项，展示依据与不确定性；同批未确认实测不参与估算，样本不足保持空白，冻结历史不新增估计。
6. 先检查返回的 needsUserInput；非空时说明待补字段，不能说成可直接保存。将 confirmationUrl 完整交给用户，登录后可逐项核对、修改或取消；确认本项只标记草稿，修改先更新预览，最后在底部“确认并全部保存”一次写入未取消的有效内容。错误项须修改或取消后再统一保存，AI 不能代点击或绕过确认。过期或数据变化须刷新核对；令牌失效须重新授权。相同请求重试复用 operationId 和原始内容。
7. GET /measurement-operations/{id} 检查结果。每条 items 的 status=confirmed 才表示该条已保存；counts 给出保存、取消、跳过和待处理数量。总体 status=confirmed 表示全部待保存行已保存，partially_confirmed 表示部分已保存且仍有待处理，completed 表示混合结果或全部跳过；不能把整批取消、过期或冲突宣称为全部保存。无改动预览无需确认。同一天晨间／晚间各采用最后保存的记录。再次录入先显示旧值与新值，确认后覆盖；遗漏字段保留，不能填写未来日期。

本地 Codex 试验：在 Formward 工作区运行 pnpm ai:setup，按提示输入 API 地址和令牌，写入被 Git 忽略的 .env.ai.local。pnpm ai:request GET /measurements 发起查询；提交时用 pnpm ai:request POST /measurement-operations 私有请求.json。此助手只通过 HTTP 使用上述权限，不需要网页登录密码、数据库凭据或模型 API Key。`;
}
export const operationStatusLabels: Record<string, string> = { pending: "待处理", partially_confirmed: "部分已保存", confirmed: "已保存", completed: "审核完成", cancelled: "已取消", expired: "已过期" };
