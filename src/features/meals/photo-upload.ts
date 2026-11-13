"use client";
import { uploadPresigned } from "@vercel/blob/client";
async function request(body: unknown, phase: string, timeoutMs = 30000) {
  let response: Response;
  try {
    response = await fetch("/api/meal-images/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new Error(phase + "连接未完成，请重试。照片尚未登记成功。");
  }
  const result = await response.json().catch(() => ({ error: "照片服务响应异常，请重试。" }));
  if (!response.ok) throw new Error((result.error ?? "照片上传失败，请重试。") + "（" + phase + "，HTTP " + response.status + "）");
  return result;
}
async function snapshotPhoto(file: File) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const bytes = await Promise.race([file.arrayBuffer(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("读取照片超时，请重新选择已下载到手机的原图。")), 30000); })]);
    if (bytes.byteLength !== file.size) throw new Error("照片内容未完整读取，请重新选择原图。");
    // 同一份已读取字节用于摘要和上传；不再让网络进程重读照片选择器的临时文件。
    return { bytes, body: new Blob([bytes], { type: file.type }) };
  } catch (error) {
    if (error instanceof Error && /^(读取照片超时|照片内容未完整读取)/.test(error.message)) throw error;
    throw new Error("无法读取所选照片，请先将原图下载到手机后重新选择。");
  } finally { clearTimeout(timer); }
}
async function cosUploadError(response: Response) {
  const text = await response.text().catch(() => "");
  const code = text.match(/<Code>\s*([A-Za-z][A-Za-z0-9_]{0,63})\s*<\/Code>/)?.[1];
  const rawId = response.headers.get("x-cos-request-id") ?? text.match(/<RequestId>\s*([^<]+)\s*<\/RequestId>/)?.[1];
  const requestId = rawId && /^[A-Za-z0-9+/_=-]{1,160}$/.test(rawId) ? rawId : null;
  // 仅保留受限错误码和请求编号，绝不展示可能回显签名、路径或凭据的原始XML。
  return new Error("国内照片上传未完成（HTTP " + response.status + (code ? "，" + code : "") + "），请重试。" + (requestId ? " 请求编号：" + requestId : ""));
}
/** 聊天与原录入表单共用私有原图上传，不经过公开图片缓存。 */
export async function uploadPrivateMealPhoto(file: File, progress: (label: string) => void = () => {}) {
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error("照片须为非空文件，最大20 MiB。");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("支持 JPEG、PNG、WebP，请选择对应原图。");
  progress("正在读取照片…");
  const snapshot = await snapshotPhoto(file);
  const hash = await crypto.subtle.digest("SHA-256", snapshot.bytes), sha256 = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
  progress("正在申请上传凭据…");
  const prepared = await request({ step: "prepare", file: { fileName: file.name, size: file.size, mimeType: file.type, sha256 } }, "申请上传凭据");
  let image = prepared.image;
  if (!image) {
    if (prepared.provider === "cos") {
      const signed = await request({ type: "blob.generate-presigned-url", payload: { pathname: prepared.pathname, clientPayload: prepared.ticket } }, "签发上传凭据");
      const data = new FormData(); for (const [key, value] of Object.entries(signed.fields)) data.append(key, String(value)); data.append("file", snapshot.body, file.name);
      progress("正在上传照片…");
      let uploaded: Response;
      try { uploaded = await fetch(signed.url, { method: "POST", body: data, signal: AbortSignal.timeout(120000) }); }
      catch { throw new Error("照片上传连接未完成或超时，请重试。照片尚未登记成功。"); }
      if (!uploaded.ok) throw await cosUploadError(uploaded);
    } else await uploadPresigned(prepared.pathname, snapshot.body, { access: "private", handleUploadUrl: "/api/meal-images/upload", clientPayload: prepared.ticket, contentType: file.type, multipart: file.size > 4 * 1024 * 1024, onUploadProgress: event => progress("照片上传 " + Math.round(event.percentage) + "%") });
    progress("正在核对并保存原图…"); image = await request({ step: "complete", ticket: prepared.ticket }, "核对原图", 90000);
  }
  return { id: String(image.id), notice: prepared.notice as string | undefined };
}
