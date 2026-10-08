export function aiInstructions(baseURL: string) {
  return `你已获得 Formward 身体记录 API 的访问权限。
API 地址：${baseURL}/api/v1
接口协议：${baseURL}/api/v1/openapi.json
鉴权：Authorization: Bearer <用户提供的令牌>。令牌只用于请求，不放在 URL、输出、报告或公开文件里。

1. 先 GET /measurements 查询已有记录、来源和分析；历史可用 ?from=YYYY-MM-DD&to=YYYY-MM-DD。日期必须明确为 YYYY-MM-DD，遇到“昨日”等相对日期，先确认用户所在地日期；有歧义先问用户。
2. 只处理目前身体记录界面：晨晚体重、体脂、来源、历史修改、查询分析与单项估算。单位为 kg 和 %，数值用最多两位小数的字符串；未知值不猜测、不填 0。period 为 daytime（晨间）或 evening（晚间）。晨间必须经用户确认空腹 fasting:true；晚间固定非空腹。新实测必须填用户提供的 deviceLabel 来源。未提供的字段直接省略，不擅自填历史来源。
3. POST /measurement-operations 提交预览。录入：{"kind":"save_day","operationId":"每次新操作的 UUID","date":"YYYY-MM-DD","periods":{"daytime":{"weightKg":"70.20","bodyFatPercent":"20.10","fasting":true,"deviceLabel":"用户提供的来源"}}}。这是虚构格式例子，不能把示例数值当成用户数据。timezone 可省略，未知时间不虚构钟点。
4. 查询到已有值时，相同内容跳过，缺项可补充。不同已有值须向用户核对；要修改历史必须在对应时段提供 recordId 和 version（查询返回的 updatedAt）。仅修改来源也必须明确这两个字段。显式 null 表示清空数值；不能把两项全部清空。
5. 估算：{"kind":"estimate_cell","operationId":"新的 UUID","date":"YYYY-MM-DD","period":"evening","metric":"weightKg"}，metric 也可为 bodyFatPercent。只估这一个空项，展示依据与不确定性，样本不足保持空白，冻结历史不新增估计。
6. 将返回的 confirmationUrl 交给用户打开，在 Formward 登录并查看前后值后点击确认保存。你不能代替点击或通过 API 绕过确认。冲突、取消、过期、令牌撤销或数据变化时不能宣称已保存；查询后用新 operationId 重新生成预览。相同请求重试必须复用 operationId 和相同内容。
7. GET /measurement-operations/{id} 检查结果；只有 status=confirmed 才表示保存完成。无改动预览无需确认。多候选 choices 为 {"YYYY-MM-DD:daytime":"recordId"} 的 URL 编码 JSON，仅影响本次分析，不修改历史代表选择。

本地 Codex 试验：在 Formward 工作区运行 pnpm ai:setup，按提示输入 API 地址和令牌，写入被 Git 忽略的 .env.ai.local。pnpm ai:request GET /measurements 发起查询；提交时用 pnpm ai:request POST /measurement-operations 私有请求.json。此助手只通过 HTTP 使用上述权限，不需要网页登录密码、数据库凭据或模型 API Key。`;
}
export const operationStatusLabels: Record<string, string> = { pending: "待处理", confirmed: "已保存", cancelled: "已取消", expired: "已过期" };
