import { z } from "zod";
import { ApiError } from "../auth/ai-identity";
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const openAiFileSchema = z.object({ download_url: z.string().url(), file_id: z.string().min(1).max(200), mime_type: z.string().optional(), file_name: z.string().max(255).optional() }).strict();
export const imageImportSchema = z.object({ files: z.array(openAiFileSchema).min(1).max(8), processingRegion: z.enum(["cn","global"]).optional() }).strict();
export type ImageResult = { id: string; mimeType: string; fileName: string; repeated: boolean };
export type ImageStage = "file_input" | "download" | "validation" | "storage" | "registration";

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
