import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { del, get, issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { z } from "zod";
import { mealImage } from "../../db/schema";
import type { Database } from "../../db/client";
import { lockOwner } from "../auth/owner-lock";
import { ApiError } from "../auth/ai-identity";
import { MAX_IMAGE_BYTES, IMAGE_TYPES, cleanImageName, imageDiagnostic, imageMime, readImageBytes } from "./images";

const fileSchema = z.object({ fileName: z.string().max(255), size: z.number().int().positive().max(MAX_IMAGE_BYTES), mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const ticketSchema = fileSchema.extend({ userId: z.string().min(1), pathname: z.string(), id: z.string().uuid(), expiresAt: z.number() }).strict();
function signingKey(secret: string | undefined) {
  if (!secret) throw new ApiError(503, "image_configuration", "照片上传暂不可用，请稍后重试。");
  return createHmac("sha256", secret).update("formward-private-image-upload-v1").digest();
}
export function verifyImageUploadTicket(raw: string, userId: string, secret = process.env.BETTER_AUTH_SECRET, now = Date.now()) {
  const [encoded, signature, extra] = raw.split(".");
  if (!encoded || !signature || extra) throw new ApiError(400, "image_ticket", "上传凭据无效，请重新选择照片。");
  const expected = createHmac("sha256", signingKey(secret)).update(encoded).digest(), actual = Buffer.from(signature, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new ApiError(400, "image_ticket", "上传凭据无效。");
  let value: unknown;
  try { value = JSON.parse(Buffer.from(encoded, "base64url").toString()); } catch { throw new ApiError(400, "image_ticket", "上传凭据无效。"); }
  const parsed = ticketSchema.safeParse(value);
  if (!parsed.success || parsed.data.userId !== userId || parsed.data.pathname !== "meal-uploads/" + userId + "/" + parsed.data.id) throw new ApiError(403, "image_owner", "上传凭据不属于当前账号。");
  if (parsed.data.expiresAt <= now) throw new ApiError(409, "image_ticket_expired", "上传凭据已过期，请重试上传；已完成照片不会重复保存。");
  return parsed.data;
}
export async function prepareImageUpload(db: Database, userId: string, input: unknown, secret = process.env.BETTER_AUTH_SECRET) {
  const parsed = fileSchema.safeParse(input);
  if (!parsed.success) throw new ApiError(400, "image_file", "请选择最大20 MiB的 JPEG、PNG 或 WebP 原图。");
  const file = parsed.data;
  const [prior] = await db.select().from(mealImage).where(and(eq(mealImage.userId, userId), eq(mealImage.sha256, file.sha256)));
  if (prior) return { image: { id: prior.id, mimeType: prior.mimeType, fileName: prior.fileName, repeated: true } };
  const id = randomUUID(), payload = { ...file, fileName: cleanImageName(file.fileName), id, userId, pathname: "meal-uploads/" + userId + "/" + id, expiresAt: Date.now() + 10 * 60_000 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const ticket = encoded + "." + createHmac("sha256", signingKey(secret)).update(encoded).digest("base64url");
  return { ticket, pathname: payload.pathname };
}
export async function signImageUpload(request: Request, body: HandleUploadPresignedBody, userId: string) {
  if (body.type !== "blob.generate-presigned-url") throw new ApiError(400, "image_input", "上传请求无效。");
  return handleUploadPresigned({ request, body, getSignedToken: async (pathname, clientPayload) => {
    const ticket = verifyImageUploadTicket(clientPayload ?? "", userId);
    if (pathname !== ticket.pathname) throw new ApiError(403, "image_owner", "上传路径不匹配。");
    const options = { pathname, operations: ["put"] as ("put")[], validUntil: ticket.expiresAt, allowedContentTypes: IMAGE_TYPES, maximumSizeInBytes: ticket.size };
    return { token: await issueSignedToken(options), urlOptions: { access: "private", validUntil: ticket.expiresAt, allowedContentTypes: IMAGE_TYPES, maximumSizeInBytes: ticket.size, addRandomSuffix: false, allowOverwrite: false } };
  } });
}
const readUploaded = async (pathname: string) => {
  const result = await get(pathname, { access: "private", useCache: false, abortSignal: AbortSignal.timeout(30_000) });
  if (!result || result.statusCode !== 200) throw new ApiError(409, "image_not_uploaded", "照片尚未上传完成，请重试。");
  return readImageBytes(result.stream);
};
export async function completeImageUpload(db: Database, userId: string, raw: string, dependencies: { read?: typeof readUploaded; remove?: typeof del; secret?: string } = {}) {
  const ticket = verifyImageUploadTicket(raw, userId, dependencies.secret ?? process.env.BETTER_AUTH_SECRET);
  const remove = dependencies.remove ?? del;
  let committed = false;
  try {
    const result = await db.transaction(async tx => {
      await lockOwner(tx, userId);
      const [prior] = await tx.select().from(mealImage).where(and(eq(mealImage.userId, userId), eq(mealImage.sha256, ticket.sha256)));
      if (prior) {
        committed = prior.pathname === ticket.pathname;
        return { id: prior.id, mimeType: prior.mimeType, fileName: prior.fileName, repeated: true };
      }
      const bytes = await (dependencies.read ?? readUploaded)(ticket.pathname), mimeType = imageMime(bytes);
      if (bytes.length !== ticket.size || createHash("sha256").update(bytes).digest("hex") !== ticket.sha256 || mimeType !== ticket.mimeType) throw new ApiError(400, "image_mismatch", "照片内容与上传信息不一致，请重新选择原图。");
      await tx.insert(mealImage).values({ id: ticket.id, userId, pathname: ticket.pathname, sha256: ticket.sha256, mimeType, byteSize: bytes.length, fileName: ticket.fileName, source: "manual", createdBy: userId });
      return { id: ticket.id, mimeType, fileName: ticket.fileName, repeated: false };
    });
    if (!result.repeated) committed = true;
    if (!committed) await remove(ticket.pathname).catch(() => {});
    imageDiagnostic("registration", "saved", { bytes: ticket.size });
    return result;
  } catch (error) {
    if (!committed) await remove(ticket.pathname).catch(() => {});
    imageDiagnostic("registration", error instanceof ApiError ? error.code : "image_unavailable");
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, "image_unavailable", "照片登记未完成，请重试，当前草稿已保留。");
  }
}
