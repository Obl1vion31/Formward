/** 仅访问官方 Personal API。这里没有 Formward 数据库或写入功能。 */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Region = "global" | "china";
export type Window = { from: string; to: string; timeZone: string; dates: string[] };
export type ReadResult = { ok: true; data: Json; rawText: string } | { ok: false; code: string; message: string; httpStatus?: number };
export type Capture = { mode: "live" | "demo"; fetchedAt: string; window: Window; region: Region; daily: ReadResult; activityPages: ReadResult[]; activitiesComplete: boolean };

export class GarminError extends Error {
  constructor(public code: string, message: string, public httpStatus?: number) { super(message); this.name = "GarminError"; }
}

export function sevenDays(now = new Date(), timeZone = "Asia/Shanghai"): Window {
  let parts: Intl.DateTimeFormatPart[];
  try { parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now); }
  catch { throw new GarminError("timezone", "时区无效，请填写 Asia/Shanghai 这样的 IANA 时区。"); }
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  const to = `${part("year")}-${part("month")}-${part("day")}`;
  const dates = Array.from({ length: 7 }, (_, i) => new Date(Date.parse(`${to}T00:00:00Z`) - (6 - i) * 86400000).toISOString().slice(0, 10));
  return { from: dates[0], to, timeZone, dates };
}

export const personalHosts = { global: "https://personal.connectapi.garmin.com", china: "https://personal.connectapi.garmin.cn" } as const;
const tokenPath = "/personalapitoken-service/personal-api/personal-api-key/token";
const maxBytes = 4 * 1024 * 1024;

async function readJson(response: Response, plainText = false): Promise<{ data: Json; rawText: string }> {
  if (Number(response.headers.get("content-length")) > maxBytes) { await response.body?.cancel(); throw new GarminError("response_size", "响应超过只读核对的大小限制，本次未继续读取。"); }
  const chunks: Uint8Array[] = []; let size = 0;
  const reader = response.body?.getReader();
  if (reader) {
    try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > maxBytes) { await reader.cancel(); throw new GarminError("response_size", "响应超过只读核对的大小限制，本次未继续读取。"); } chunks.push(chunk.value); } }
    finally { reader.releaseLock(); }
  }
  const rawText = new TextDecoder().decode(Buffer.concat(chunks));
  if (plainText) return { data: rawText.trim(), rawText };
  try { return { data: JSON.parse(rawText) as Json, rawText }; }
  catch { throw new GarminError("invalid_json", "佳明返回的内容不是有效 JSON，请稍后重试。"); }
}

function httpError(status: number, token = false) {
  const message = status === 401 ? (token ? "个人密钥无效、已过期或已撤销，请检查配置。" : "访问令牌被拒绝，请重新运行读取；仍失败时检查密钥。")
    : status === 403 ? "当前站点或账号无权读取此接口，请检查密钥站点和 Personal API 权限。"
    : status === 429 ? "佳明请求频率受限，请稍后重新读取。" : `佳明暂时未完成请求（HTTP ${status}），请稍后重试。`;
  return new GarminError(`http_${status}`, message, status);
}

async function request(fetcher: typeof fetch, url: URL, method: "POST" | "GET", authorization: string, signal?: AbortSignal) {
  try {
    const timeout = AbortSignal.timeout(20000);
    const response = await fetcher(url, { method, headers: { Authorization: authorization, Accept: method === "POST" ? "*/*" : "application/json" }, redirect: "error", cache: "no-store", signal: signal ? AbortSignal.any([timeout, signal]) : timeout });
    if (!response.ok) { await response.body?.cancel(); throw httpError(response.status, method === "POST"); }
    return await readJson(response, method === "POST");
  } catch (error) {
    if (error instanceof GarminError) throw error;
    // 不透传上游异常、响应正文或 headers，避免它们携带密钥／令牌。
    throw new GarminError("network", "请求未完成：请检查网络后重试；本次没有写入正式记录。");
  }
}

function failed(error: unknown): ReadResult {
  const e = error instanceof GarminError ? error : new GarminError("read_failed", "本区域读取未完成，请重新运行。");
  return { ok: false, code: e.code, message: e.message, ...(e.httpStatus ? { httpStatus: e.httpStatus } : {}) };
}

export async function capturePersonal(input: { apiKey: string; region: Region; timeZone: string; now?: Date; from?: string; daily?: boolean; activities?: boolean; signal?: AbortSignal }, fetcher: typeof fetch = fetch): Promise<Capture> {
  if (!input.apiKey.trim() || /[\r\n]/.test(input.apiKey)) throw new GarminError("missing_key", "请先在私有配置文件填写 GARMIN_PERSONAL_API_KEY，再重新运行。");
  if (!Object.hasOwn(personalHosts, input.region)) throw new GarminError("region", "站点只能选择 global 或 china。");
  const window = sevenDays(input.now, input.timeZone), host = personalHosts[input.region];
  if (input.from) {
    const first = Date.parse(input.from + "T00:00:00Z"), last = Date.parse(window.to + "T00:00:00Z"), count = (last - first) / 86400000 + 1;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.from) || !Number.isInteger(count) || count < 1 || count > 3661 || new Date(first).toISOString().slice(0, 10) !== input.from) throw new GarminError("date_range", "读取日期范围无效。");
    window.from = input.from; window.dates = Array.from({ length: count }, (_, i) => new Date(first + i * 86400000).toISOString().slice(0, 10));
  }
  const token = await request(fetcher, new URL(tokenPath, host), "POST", `ApiKey ${input.apiKey.trim()}`, input.signal);
  // Personal API 认证返回纯文本 JWT，不是业务 JSON，也不是业务 OAuth 的 token JSON。
  if (typeof token.data !== "string" || !token.data || token.data.length > 20000 || !/^[a-zA-Z0-9._~-]+$/.test(token.data)) throw new GarminError("token_shape", "佳明认证响应未包含可用的访问令牌，请检查接口状态。");
  const authorization = `Bearer ${token.data}`;
  const get = async (path: string, params: Record<string, string>): Promise<ReadResult> => {
    const url = new URL(path, host); for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    try { return { ok: true, ...await request(fetcher, url, "GET", authorization, input.signal) }; } catch (error) { return failed(error); }
  };
  const dailyTask: Promise<ReadResult> = input.daily === false ? Promise.resolve({ ok: true, data: { data: [] }, rawText: "" }) : get("/usersummary-service/v2/dailysummaries", { startDate: window.from, endDate: window.to });
  const activitiesTask = (async () => {
    const pages: ReadResult[] = [], seen = new Set<string>(), limit = 50;
    if (input.activities === false) return { pages, complete: true };
    for (let page = 0; page < 20; page++) {
      const result = await get("/activitylist-service/activities/search/activities", { start: String(page * limit), limit: String(limit), startDate: window.from, endDate: window.to, excludeChildren: "true", sortOrder: "desc" });
      pages.push(result);
      if (!result.ok) return { pages, complete: false };
      if (!Array.isArray(result.data)) { pages.push(failed(new GarminError("activities_shape", "活动列表结构与官方文档不同，已保留原始响应供核对。"))); return { pages, complete: false }; }
      if (result.data.length < limit) return { pages, complete: true };
      if (seen.has(result.rawText)) { pages.push(failed(new GarminError("repeated_page", "活动分页返回了重复的一页，读取已停止，请核对分页接口。"))); return { pages, complete: false }; }
      seen.add(result.rawText);
    }
    pages.push(failed(new GarminError("page_limit", "活动超过本次 1000 条核对上限，列表并非完整结果。")));
    return { pages, complete: false };
  })();
  const [daily, activity] = await Promise.all([dailyTask, activitiesTask]);
  return { mode: "live", fetchedAt: new Date().toISOString(), region: input.region, window, daily, activityPages: activity.pages, activitiesComplete: activity.complete };
}
