import { ApiError } from "../auth/ai-identity";

/** 对端未声明 Content-Length 时也按实际字节数限制，不记录请求或响应正文。 */
export async function limitedJson(input: Request | Response, maximum = 16384): Promise<unknown> {
  if (Number(input.headers.get("content-length")) > maximum) throw new ApiError(413, "request_too_large", "请求内容过大。");
  const reader = input.body?.getReader();
  if (!reader) throw new ApiError(400, "invalid_input", "请求内容无效。");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maximum) throw new ApiError(413, "request_too_large", "请求内容过大。");
      chunks.push(next.value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new ApiError(400, "invalid_input", "请求内容无效。"); }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export function privateJson(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
}
