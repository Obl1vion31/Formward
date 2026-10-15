"use client";
import { useRef, useState } from "react";
import { uploadPresigned } from "@vercel/blob/client";
import { usePageLoading } from "@/components/page-loading-state";
import styles from "./meals.module.css";

export function ImageGallery({ ids = [] }: { ids?: string[] }) {
  return ids.length ? <div className={styles.photos} aria-label="原始照片">{ids.map((id, index) => <a href={"/api/meal-images/" + id} key={id} target="_blank" rel="noreferrer">
    {/* 原图必须经会话验证，不能通过公开图片优化缓存提供。 */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={"/api/meal-images/" + id} alt={"原图 " + (index + 1)} loading="lazy" />查看原图 ↗
  </a>)}</div> : null;
}
async function uploadRequest(body: unknown) {
  const response = await fetch("/api/meal-images/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({ error: "照片服务响应异常，请重试。" }));
  if (!response.ok) throw new Error(result.error ?? "照片上传失败，请重试。");
  return result;
}
export function PhotoFields({ ids, change, busy, onBusy, onError, expectedCount = 0, onExpected }: { ids: string[]; change: (ids: string[]) => void; busy: boolean; onBusy: (active: boolean) => void; onError: (error: string) => void; expectedCount?: number; onExpected?: (count: number) => void }) {
  const input = useRef<HTMLInputElement>(null), guard = useRef(false), remaining = useRef<File[]>([]);
  const [error, setError] = useState(""), [uploading, setUploading] = useState(false), [progress, setProgress] = useState("");
  usePageLoading({ active: uploading, label: progress || "正在保存原图…" });
  async function upload(files: File[]) {
    if (!files.length || guard.current) return;
    guard.current = true; setUploading(true); onBusy(true); setError(""); onError("");
    const next = [...ids], failed: File[] = [], messages: string[] = [];
    try {
      if (next.length + files.length > 8) throw new Error("最多关联8张照片。");
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        try {
          if (!file.size || file.size > 20 * 1024 * 1024) throw new Error("照片须为非空文件，最大20 MiB。");
          if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("支持 JPEG、PNG、WebP，请选择对应原图。");
          setProgress("正在准备照片 " + (index + 1) + "/" + files.length + "…");
          const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
          const sha256 = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
          const prepared = await uploadRequest({ step: "prepare", file: { fileName: file.name, size: file.size, mimeType: file.type, sha256 } });
          let image = prepared.image;
          if (!image) {
            await uploadPresigned(prepared.pathname, file, { access: "private", handleUploadUrl: "/api/meal-images/upload", clientPayload: prepared.ticket, contentType: file.type, multipart: file.size > 4 * 1024 * 1024, onUploadProgress: event => setProgress("照片 " + (index + 1) + "/" + files.length + " · " + Math.round(event.percentage) + "%") });
            setProgress("正在核对并保存原图…");
            image = await uploadRequest({ step: "complete", ticket: prepared.ticket });
          }
          if (!next.includes(image.id)) next.push(image.id);
          change([...next]);
        } catch (e) { failed.push(file); messages.push(file.name + "：" + (e instanceof Error ? e.message : "上传未完成，请重试。")); }
      }
      remaining.current = failed;
      onExpected?.(Math.max(expectedCount, next.length + failed.length));
      if (failed.length) throw new Error(messages.join("；"));
      if (input.current) input.current.value = "";
    } catch (e) {
      if (!remaining.current.length) remaining.current = files;
      const message = e instanceof Error ? e.message : "照片上传失败，请重试。";
      setError(message); onError(message);
      onExpected?.(Math.max(expectedCount, next.length + remaining.current.length));
    } finally { guard.current = false; setUploading(false); onBusy(false); setProgress(""); }
  }
  return <div className={styles.photoFields}>
    <label>原始照片（最多8张，每张20 MiB）<input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || uploading} onChange={e => { remaining.current = []; void upload(Array.from(e.target.files ?? [])); }} /></label>
    {progress && <p role="status" className={styles.hint}>{progress}</p>}<ImageGallery ids={ids} />
    {ids.map((id, i) => <button type="button" key={id} disabled={busy || uploading} onClick={() => change(ids.filter(n => n !== id))}>移除照片 {i + 1}</button>)}
    {error && <><p role="alert" className={styles.error}>{error}</p><button type="button" disabled={busy || uploading} onClick={() => void upload(remaining.current)}>重试未完成照片</button><button type="button" disabled={busy || uploading} onClick={() => { setError(""); onError(""); remaining.current = []; if (input.current) input.current.value = ""; }}>稍后补传</button></>}
  </div>;
}
