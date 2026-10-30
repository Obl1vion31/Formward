import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { type HandleUploadPresignedBody } from "@vercel/blob/client";
import type { Database } from "../../db/client";
import { mealImage } from "../../db/schema";
import { lockActiveAccount, requireSessionProof, webSessionContext } from "../auth/account-security";
import { requireActiveAiToken } from "../auth/ai-tokens";
import { ApiError, type AiIdentity } from "../auth/ai-identity";
import { serviceHeaders } from "../auth/regional-transport";
import { regionConfig } from "../auth/regions";
import { imageFileSchema, signImageTicket, verifyImageUploadTicket, ticketIdentity, ticketSession, type ImageTicket } from "./image-ticket";
import { cosLocation, cosPostPolicy, imageStorage, type ImageStorage } from "./image-storage";
import { cleanImageName } from "./image-bytes";
import { promoteImage,signBlobImageUpload } from "./image-worker";
export { verifyImageUploadTicket } from "./image-ticket";

export type ImageReceipt = { pathname: string; sha256: string; size: number; mimeType: string };
export async function assertImageTicket(db: Database, ticket: ImageTicket) {
  const owner = await lockActiveAccount(db as never, ticket.userId);
  if (owner.accessVersion !== ticket.proof.accessVersion) throw new ApiError(401, "invalid_token", "照片上传授权已失效。");
  if(ticket.expiresAt<=Date.now())throw new ApiError(409,"image_ticket_expired","上传凭据已过期。");
  const proof = ticketSession(ticket); if (proof) { const current=webSessionContext.getStore();if(current&&current.sessionId!==proof.sessionId)throw new ApiError(403,"image_owner","上传凭据不属于当前登录会话。");await requireSessionProof(db, proof); }
  const identity = ticketIdentity(ticket); if (identity) await requireActiveAiToken(db as never, identity, true, "meals");
  if (ticket.proof.kind === "maintenance" && process.env.NODE_ENV === "production") throw new ApiError(401, "invalid_session", "请重新登录。");
}
export async function prepareImageUpload(db: Database, userId: string, input: unknown, secret?: string, region: "cn" | "global" = process.env.FORMWARD_IMAGE_REGION === "cn" ? "cn" : "global", identity?: AiIdentity, download?: { url: string; fileId: string }) {
  const parsed = imageFileSchema.safeParse(input);
  if (!parsed.success) throw new ApiError(400, "image_file", "请选择最大20 MiB的 JPEG、PNG 或 WebP 原图。");
  return db.transaction(async tx => {
    const owner = await lockActiveAccount(tx, userId), proof = webSessionContext.getStore();
    if (identity) await requireActiveAiToken(tx, identity, true, "meals");
    const [prior] = await tx.select().from(mealImage).where(and(eq(mealImage.userId, userId), eq(mealImage.sha256, parsed.data.sha256)));
    if (prior && !download) return { image: { id: prior.id, mimeType: prior.mimeType, fileName: prior.fileName, repeated: true, storageProvider: prior.storageProvider } };
    const id = randomUUID(), payload: ImageTicket = { ...parsed.data, fileName: cleanImageName(parsed.data.fileName), v: 2, id, userId, pathname: "meal-tmp-v2/" + userId + "/" + id, expiresAt: Date.now() + 600000, provider: region === "cn" ? "cos" : "blob", location: region === "cn" ? cosLocation() : process.env.FORMWARD_BLOB_LOCATION ?? "legacy", region,
      proof: identity ? { kind: "ai", accessVersion: owner.accessVersion, ...(identity.tokenId ? { tokenId: identity.tokenId } : { oauthConnectionId: identity.oauthConnectionId }) } : proof ? { kind: "session", sessionId: proof.sessionId, accessVersion: owner.accessVersion } : { kind: "maintenance", accessVersion: owner.accessVersion },
      ...(download ? { downloadUrl: download.url, sourceFileId: download.fileId } : {}) };
    if (payload.proof.kind === "maintenance" && process.env.NODE_ENV === "production") throw new ApiError(401, "invalid_session", "请重新登录。");
    return { ticket: signImageTicket(payload, secret), pathname: payload.pathname, provider: payload.provider };
  });
}
export async function callImageWorker(ticket: string, command: string, body?: unknown) {
  const config = regionConfig(), target = new URL("/api/internal/image-worker", process.env.FORMWARD_IMAGE_WORKER_URL ?? config.global);
  const response = await fetch(target, { method: "POST", headers: { "Content-Type": "application/json", ...serviceHeaders("POST", target.pathname, config.canonical) }, body: JSON.stringify({ ticket, command, body }), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(85000) });
  if (!response.ok) throw new ApiError(503, "image_region_unavailable", "国际照片处理暂时不可用，请稍后重试。");
  return response;
}
export async function signLocalImageUpload(request: Request, body: HandleUploadPresignedBody, ticket: ImageTicket) {
  if (ticket.provider === "cos") return { provider: "cos", ...cosPostPolicy(ticket.pathname, ticket.size, ticket.mimeType, ticket.expiresAt) };
  return signBlobImageUpload(request,body,ticket);
}
export async function signImageUpload(request: Request, body: HandleUploadPresignedBody, userId: string) {
  const raw = body.type === "blob.generate-presigned-url" ? body.payload.clientPayload : null;
  const ticket = verifyImageUploadTicket(raw ?? "", userId);
  if (ticket.region === "global" && regionConfig().enabled) return (await callImageWorker(raw!, "sign", body)).json();
  return signLocalImageUpload(request, body, ticket);
}
export async function registerImageReceipt(db: Database, ticket: ImageTicket, receipt: ImageReceipt) {
  if (!receipt.pathname.startsWith("meal-formal-v2/" + ticket.userId + "/") || !/^meal-formal-v2\/[^/]+\/[a-f0-9-]{36}$/.test(receipt.pathname) || !/^[a-f0-9]{64}$/.test(receipt.sha256) || receipt.size <= 0 || receipt.size > 20971520 || !["image/jpeg","image/png","image/webp"].includes(receipt.mimeType)) throw new ApiError(400, "image_receipt", "照片登记信息无效。");
  if (!ticket.downloadUrl && (receipt.sha256 !== ticket.sha256 || receipt.size !== ticket.size || receipt.mimeType !== ticket.mimeType)) throw new ApiError(400, "image_mismatch", "照片信息不一致。");
  return db.transaction(async tx => {
    await assertImageTicket(tx as never, ticket);
    const [prior] = await tx.select().from(mealImage).where(and(eq(mealImage.userId, ticket.userId), eq(mealImage.sha256, receipt.sha256)));
    if (prior) return { id: prior.id, mimeType: prior.mimeType, fileName: prior.fileName, repeated: true, storageProvider: prior.storageProvider };
    await tx.insert(mealImage).values({ id: ticket.id, userId: ticket.userId, pathname: receipt.pathname, storageProvider: ticket.provider, storageLocation: ticket.location, sha256: receipt.sha256, mimeType: receipt.mimeType, byteSize: receipt.size, fileName: ticket.fileName, source: ticket.proof.kind === "ai" ? "ai" : "manual", sourceFileId: ticket.sourceFileId, createdBy: ticket.proof.kind === "ai" ? (ticketIdentity(ticket)!.tokenId ?? ticketIdentity(ticket)!.oauthConnectionId!) : ticket.userId });
    return { id: ticket.id, mimeType: receipt.mimeType, fileName: ticket.fileName, repeated: false, storageProvider: ticket.provider };
  });
}
export async function completeImageUpload(db: Database, userId: string, raw: string, dependencies: { read?: (path: string) => Promise<Uint8Array>; remove?: (path: string) => Promise<unknown>; write?: ImageStorage["write"]; secret?: string } = {}) {
  const ticket = verifyImageUploadTicket(raw, userId, dependencies.secret);
  // 正式对象提交结果不确定时留给24小时后的核对清理，只即时删除独立临时路径。
  try {
    await db.transaction(tx => assertImageTicket(tx as never, ticket));
    const [prior] = await db.select().from(mealImage).where(and(eq(mealImage.userId, userId), eq(mealImage.sha256, ticket.sha256)));
    if (prior) return { id: prior.id, mimeType: prior.mimeType, fileName: prior.fileName, repeated: true, storageProvider: prior.storageProvider };
    let receipt: ImageReceipt;
    if (ticket.region === "global" && regionConfig().enabled && !dependencies.read) receipt = await (await callImageWorker(raw, "promote")).json();
    else {
      const storage: ImageStorage = dependencies.read ? { ref: { storageProvider: ticket.provider, storageLocation: ticket.location }, read: async path => new Response(Buffer.from(await dependencies.read!(path))).body!, write: dependencies.write ?? (async () => { throw new Error("测试须提供独立写入存储。"); }), remove: async path => { await dependencies.remove?.(path); }, list: async () => [] } : imageStorage({ storageProvider: ticket.provider, storageLocation: ticket.location });
      receipt = await promoteImage(ticket, storage);
    }
    return await registerImageReceipt(db, ticket, receipt);
  } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(503, "image_unavailable", "照片登记未完成，请重试，当前草稿已保留。"); }
  finally {
    if (ticket.region === "global" && regionConfig().enabled && !dependencies.read) await callImageWorker(raw, "remove-temp").catch(() => {});
    else await (dependencies.remove ?? imageStorage({ storageProvider: ticket.provider, storageLocation: ticket.location }).remove)(ticket.pathname).catch(() => {});
  }
}
export async function importGlobalImage(db: Database, identity: AiIdentity, file: { download_url: string; file_id: string; file_name?: string }) {
  const prepared = await prepareImageUpload(db, identity.userId, { fileName: file.file_name ?? "照片", size: 1, mimeType: "image/png", sha256: "0".repeat(64) }, undefined, "global", identity, { url: file.download_url, fileId: file.file_id });
  const ticket = verifyImageUploadTicket(prepared.ticket!, identity.userId);
  await db.transaction(tx => assertImageTicket(tx as never, ticket));
  const receipt = await (await callImageWorker(prepared.ticket!, "import")).json() as ImageReceipt;
  return registerImageReceipt(db, ticket, receipt);
}
