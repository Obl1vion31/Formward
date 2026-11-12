import { ApiError } from "../auth/ai-identity";
export async function readChatJson(request: Request, limit: number) {
  if (!request.body) throw new ApiError(400,"invalid_request","请求不能为空。");
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > limit) { await reader.cancel(); throw new ApiError(413,"request_too_large","请求内容过长。"); } chunks.push(next.value); } }
  finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new ApiError(400,"invalid_request","请求格式无效。"); }
}
