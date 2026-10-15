import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { get, put, del } from "@vercel/blob";
import { z } from "zod";
import { mealImage } from "../../db/schema";
import type { Database } from "../../db/client";
import { lockOwner } from "../auth/owner-lock";
import { requireActiveAiToken } from "../auth/ai-tokens";
import { ApiError, type AiIdentity } from "../auth/ai-identity";

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const openAiFileSchema = z.object({ download_url: z.string().url(), file_id: z.string().min(1).max(200), mime_type: z.string().optional(), file_name: z.string().max(255).optional() }).strict();
export const imageImportSchema = z.object({ files: z.array(openAiFileSchema).min(1).max(8) }).strict();
export type ImageResult = { id: string; mimeType: string; fileName: string; repeated: boolean };
type ImageStage = "file_input" | "download" | "validation" | "storage" | "registration";

// 不输出原图地址、签名参数、文件名称、令牌或健康内容。
export function imageDiagnostic(stage: ImageStage, code: string, details: { requestId?: string; index?: number; hostname?: string; bytes?: number; elapsedMs?: number; errorType?: string } = {}) {
  console.info(JSON.stringify({ event: "meal_image", stage, code, ...details }));
}
export function imageMime(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new ApiError(413, "image_size", "照片须为非空文件，最大20 MiB。");
  const b = Buffer.from(bytes);
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  if (b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") return "image/webp";
  throw new ApiError(400, "image_type", "支持 JPEG、PNG 和 WebP 原图，不接受其他文件类型。");
}
export function validateImageDownloadUrl(value: string) {
  const url = new URL(value);
  const allowed = ["oaiusercontent.com", "chatgptusercontent.com", "openai.com"];
  // ChatGPT fileParams 会按地区使用不同的 oaisdmntpr 存储账号。
  // Azure 账号名最多24位；限制完整命名族与后缀，不接受额外子域或任意云账号。
  const azureFileHost = /^oaisdmntpr[a-z0-9]{1,14}\.blob\.core\.windows\.net$/.test(url.hostname);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || (!azureFileHost && !allowed.some(host => url.hostname === host || url.hostname.endsWith("." + host)))) {
    imageDiagnostic("download", "image_url", { hostname: url.hostname });
    throw new ApiError(400, "image_url", "ChatGPT 文件下载域名暂不支持，请重新传入原图；错误码 image_url。");
  }
  return url;
}
export async function readImageBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length;
      if (size > MAX_IMAGE_BYTES) throw new ApiError(413, "image_size", "照片最大20 MiB。");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks);
}
export async function downloadMealImage(value: string, fetcher: typeof fetch = fetch, batchSignal?: AbortSignal): Promise<Uint8Array> {
  const original = validateImageDownloadUrl(value), signal = AbortSignal.any([AbortSignal.timeout(45_000), ...(batchSignal ? [batchSignal] : [])]);
  for (let attempt = 0; attempt < 2; attempt++) {
    let url = original;
    try {
      for (let hop = 0; hop < 4; hop++) {
        const response = await fetcher(url, { redirect: "manual", signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]), cache: "no-store" });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get("location"); await response.body?.cancel();
          if (!location) break; url = validateImageDownloadUrl(new URL(location, url).href); continue;
        }
        if (!response.ok || !response.body) {
          await response.body?.cancel();
          if ([401, 403, 404].includes(response.status)) throw new ApiError(400, "image_url_expired", "照片下载地址失效，请让 GPT 重新传入原图。");
          throw new ApiError(502, "image_download", "照片下载暂时失败，请重试原图传输。");
        }
        if (Number(response.headers.get("content-length")) > MAX_IMAGE_BYTES) { await response.body.cancel(); throw new ApiError(413, "image_size", "照片最大20 MiB。"); }
        return await readImageBytes(response.body);
      }
      throw new ApiError(400, "image_redirect", "照片下载重定向过多，请重新传入原图。");
    } catch (error) {
      if (error instanceof ApiError && (error.status < 500 || attempt)) throw error;
      if (!attempt && !signal.aborted) continue;
      throw new ApiError(504, "image_timeout", "照片下载超时或网络中断，请重试原图传输。");
    }
  }
  throw new ApiError(502, "image_download", "照片下载失败，请重试。");
}
export function cleanImageName(value: string) { return value.replace(/[\x00-\x1f\x7f/\\]/g, "_").slice(0, 255) || "照片"; }
// 可替换存储和清理函数，以便使用隔离数据库测试。
export async function saveMealImage(db: Database, userId: string, bytes: Uint8Array, metadata: { fileName: string; source: "manual" | "ai"; sourceFileId?: string; actorId: string; identity?: AiIdentity; signal?: AbortSignal }, store = async (pathname: string, content: Uint8Array, mimeType: string) => { await put(pathname, Buffer.from(content), { access: "private", contentType: mimeType, addRandomSuffix: false, abortSignal: AbortSignal.any([AbortSignal.timeout(20_000), ...(metadata.signal ? [metadata.signal] : [])]) }); }, remove = async (pathname: string) => { await del(pathname); }): Promise<ImageResult> {
  const mimeType = imageMime(bytes), sha256 = createHash("sha256").update(bytes).digest("hex"); let uploaded: string | undefined;
  try { return await db.transaction(async tx => {
    await lockOwner(tx, userId);
    if (metadata.signal?.aborted) throw new ApiError(504, "image_timeout", "本批上传超时，请重试未成功照片。");
    if (metadata.source === "ai") {
      if (!metadata.identity || metadata.identity.userId !== userId) throw new ApiError(401, "invalid_token", "缺少饮食授权。");
      await requireActiveAiToken(tx, metadata.identity, true, "meals");
    }
    const [prior] = await tx.select().from(mealImage).where(and(eq(mealImage.userId, userId), eq(mealImage.sha256, sha256)));
    if (prior) return { id: prior.id, mimeType: prior.mimeType, fileName: prior.fileName, repeated: true };
    const id = randomUUID(), pathname = "meals/" + userId + "/" + id;
    await store(pathname, bytes, mimeType); uploaded = pathname;
    const fileName = cleanImageName(metadata.fileName);
    await tx.insert(mealImage).values({ id, userId, pathname, sha256, mimeType, byteSize: bytes.length, fileName, source: metadata.source, sourceFileId: metadata.sourceFileId ?? null, createdBy: metadata.actorId });
    return { id, mimeType, fileName, repeated: false };
  }); } catch (error) {
    if (uploaded) await remove(uploaded).catch(() => {});
    if (error instanceof ApiError) throw error;
    imageDiagnostic(uploaded ? "registration" : "storage", "image_unavailable", { errorType: error instanceof Error ? error.name : "unknown" });
    throw new ApiError(503, "image_unavailable", "私有照片保存暂时失败，请重试。原图尚未保存。");
  }
}
export async function importMealImages(db: Database, identity: AiIdentity, input: unknown, dependencies: { download?: typeof downloadMealImage; save?: typeof saveMealImage } = {}) {
  const requestId = randomUUID(), parsed = imageImportSchema.safeParse(input);
  if (!parsed.success) { imageDiagnostic("file_input", "invalid_input", { requestId }); throw new ApiError(400, "invalid_input", "请传入1–8张 ChatGPT 原图文件引用，包含 download_url 和 file_id。"); }
  await db.transaction(tx => requireActiveAiToken(tx, identity, true, "meals"));
  const userId = identity.userId, actorId = identity.tokenId ?? identity.oauthConnectionId!;
  const images: (ImageResult & { index: number })[] = [], failures: { index: number; code: string; message: string; stage: ImageStage; retryable: boolean; requestId: string }[] = [];
  const files = parsed.data.files, signal = AbortSignal.timeout(85_000); let cursor = 0;
  // 两张并行下载，写入由账号锁串行保护；尚未开始的文件可单独重试。
  async function worker() {
    while (cursor < files.length) {
      const index = cursor++, file = files[index], started = Date.now(); let stage: ImageStage = "download";
      try {
        if (signal.aborted) throw new ApiError(504, "image_timeout", "本批上传超时，请只重试未成功的照片。");
        imageDiagnostic("file_input", "received", { requestId, index });
        const bytes = await (dependencies.download ?? downloadMealImage)(file.download_url, undefined, signal);
        stage = "validation"; imageMime(bytes); stage = "storage";
        images.push({ ...await (dependencies.save ?? saveMealImage)(db, userId, bytes, { fileName: file.file_name ?? "照片", source: "ai", sourceFileId: file.file_id, actorId, identity, signal }), index });
        imageDiagnostic("registration", "saved", { requestId, index, bytes: bytes.length, elapsedMs: Date.now() - started });
      } catch (error) {
        if (error instanceof ApiError && [401, 403].includes(error.status)) throw error;
        const failure = error instanceof ApiError ? error : new ApiError(503, "image_unavailable", "照片传输未完成，请重试。");
        failures.push({ index, code: failure.code, message: failure.message, stage, retryable: failure.status >= 500, requestId });
        imageDiagnostic(stage, failure.code, { requestId, index, elapsedMs: Date.now() - started });
      }
    }
  }
  await Promise.all([worker(), worker()]);
  images.sort((a, b) => a.index - b.index); failures.sort((a, b) => a.index - b.index);
  const status = !failures.length ? "complete" : images.length ? "partial" : "failed";
  const rules = (failures.length ? "部分或全部原图未保存。保留成功附件ID，仅重试失败照片；说明具体错误码。image_url_expired须取得新下载地址，不能反复使用旧临时链接。餐次提交expectedImageCount，缺图由用户在网页补传或先保存文字，不声称原图已保存。" : "原图已私有保存，正式餐次／食材尚未保存。使用返回id作为imageIds并提交expectedImageCount。仅图片先核对日期、餐次、身份、实际食用量和额外油酱，再网页登录确认。") + "成功照片仍须放入对应餐次imageIds并提交餐次预览；已有餐次先查询id/version后更新，保留原内容。预览已含照片时说明待网页确认保存，不说需要另行关联；用户确认后查询get_meal_operation或餐次再报告当前关联状态。";
  return { images, failures, status, expectedImageCount: new Set(images.map(image=>image.id)).size + failures.length, requestId, rules };
}
export async function ownedMealImage(db: Pick<Database, "select">, userId: string, id: string) {
  const [image] = await db.select().from(mealImage).where(and(eq(mealImage.userId, userId), eq(mealImage.id, id)));
  if (!image) throw new ApiError(404, "not_found", "照片不存在。"); return image;
}
export async function loadMealImage(db: Database, userId: string, id: string) {
  const image = await ownedMealImage(db, userId, id);
  try { const result = await get(image.pathname, { access: "private" });
    if (!result || result.statusCode !== 200) throw new ApiError(404, "not_found", "原图暂不可读取，请稍后重试。");
    return { stream: result.stream, mimeType: image.mimeType };
  } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(503, "image_unavailable", "原图暂不可读取，请稍后重试。"); }
}
