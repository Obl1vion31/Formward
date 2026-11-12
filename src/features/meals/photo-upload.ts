"use client";
import { uploadPresigned } from "@vercel/blob/client";
async function request(body: unknown) {
  const response = await fetch("/api/meal-images/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({ error: "照片服务响应异常，请重试。" }));
  if (!response.ok) throw new Error(result.error ?? "照片上传失败，请重试。");
  return result;
}
/** 聊天与原录入表单共用私有原图上传，不经过公开图片缓存。 */
export async function uploadPrivateMealPhoto(file: File, progress: (label: string) => void = () => {}) {
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error("照片须为非空文件，最大20 MiB。");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("支持 JPEG、PNG、WebP，请选择对应原图。");
  progress("正在准备照片…");
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer()), sha256 = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
  const prepared = await request({ step: "prepare", file: { fileName: file.name, size: file.size, mimeType: file.type, sha256 } });
  let image = prepared.image;
  if (!image) {
    if (prepared.provider === "cos") {
      const signed = await request({ type: "blob.generate-presigned-url", payload: { pathname: prepared.pathname, clientPayload: prepared.ticket } });
      const data = new FormData(); for (const [key, value] of Object.entries(signed.fields)) data.append(key, String(value)); data.append("file", file);
      const uploaded = await fetch(signed.url, { method: "POST", body: data }); if (!uploaded.ok) throw new Error("国内原图上传未完成，请重试。");
    } else await uploadPresigned(prepared.pathname, file, { access: "private", handleUploadUrl: "/api/meal-images/upload", clientPayload: prepared.ticket, contentType: file.type, multipart: file.size > 4 * 1024 * 1024, onUploadProgress: event => progress("照片上传 " + Math.round(event.percentage) + "%") });
    progress("正在核对并保存原图…"); image = await request({ step: "complete", ticket: prepared.ticket });
  }
  return { id: String(image.id), notice: prepared.notice as string | undefined };
}
