import {createHash,randomUUID} from "node:crypto";
import {issueSignedToken} from "@vercel/blob";
import {handleUploadPresigned,type HandleUploadPresignedBody} from "@vercel/blob/client";
import {ApiError} from "../auth/ai-identity";
import {verifyImageUploadTicket,type ImageTicket} from "./image-ticket";
import {blobImageStorage} from "./blob-storage";
import {imageMime,readImageBytes,downloadMealImage} from "./image-bytes";
import type {ImageStorage} from "./image-storage";
export type ImageReceipt={pathname:string;size:number;mimeType:string;sha256:string};
export async function signBlobImageUpload(request:Request,body:HandleUploadPresignedBody,ticket:ImageTicket){
  if (body.type !== "blob.generate-presigned-url") throw new ApiError(400, "image_input", "上传请求无效。");
  return handleUploadPresigned({ request, body, getSignedToken: async pathname => {
    if (pathname !== ticket.pathname) throw new ApiError(403, "image_owner", "上传路径不匹配。");
    return { token: await issueSignedToken({ pathname, operations: ["put"], validUntil: ticket.expiresAt, allowedContentTypes: [ticket.mimeType], maximumSizeInBytes: ticket.size }), urlOptions: { access: "private", validUntil: ticket.expiresAt, allowedContentTypes: [ticket.mimeType], maximumSizeInBytes: ticket.size, addRandomSuffix: false, allowOverwrite: false } };
  } });
}
export async function promoteImage(ticket: ImageTicket, storage: ImageStorage, bytes?: Uint8Array): Promise<ImageReceipt> {
  const content = bytes ?? await readImageBytes(await storage.read(ticket.pathname)), mimeType = imageMime(content), sha256 = createHash("sha256").update(content).digest("hex");
  if (!ticket.downloadUrl && (content.length !== ticket.size || sha256 !== ticket.sha256 || mimeType !== ticket.mimeType)) throw new ApiError(400, "image_mismatch", "照片内容与上传信息不一致，请重新选择原图。");
  const pathname = "meal-formal-v2/" + ticket.userId + "/" + randomUUID();
  await storage.write(pathname, content, mimeType);
  return { pathname, size: content.length, mimeType, sha256 };
}
export async function runImageWorker(request: Request) {
  const input = await request.json(), ticket = verifyImageUploadTicket(input.ticket);
  if (ticket.region !== "global" || ticket.provider !== "blob") throw new ApiError(403, "image_region", "处理区不匹配。");
  const storage = blobImageStorage(ticket.location);
  if (input.command === "sign") return Response.json(await signBlobImageUpload(request, input.body, ticket));
  if (input.command === "promote") return Response.json(await promoteImage(ticket, storage));
  if (input.command === "import" && ticket.downloadUrl) return Response.json(await promoteImage(ticket, storage, await downloadMealImage(ticket.downloadUrl)));
  if (input.command === "remove-temp") { await storage.remove(ticket.pathname); return Response.json({ ok: true }); }
  throw new ApiError(400, "image_input", "图片操作无效。");
}
