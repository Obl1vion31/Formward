import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { mealImage } from "../../db/schema";
import type { Database } from "../../db/client";
import { lockOwner } from "../auth/owner-lock";
import { requireActiveAiToken } from "../auth/ai-tokens";
import { ApiError, type AiIdentity } from "../auth/ai-identity";
import { activeImageStorage, imageStorage } from "./image-storage";
import { regionConfig } from "../auth/regions";

import { imageMime, imageDiagnostic, downloadMealImage, validateImageDownloadUrl, cleanImageName, imageImportSchema, type ImageResult, type ImageStage } from "./image-bytes";
export { MAX_IMAGE_BYTES, IMAGE_TYPES, openAiFileSchema, imageImportSchema, imageMime, imageDiagnostic, downloadMealImage, validateImageDownloadUrl, cleanImageName, readImageBytes, type ImageResult } from "./image-bytes";
// 可替换存储和清理函数，以便使用隔离数据库测试。
export async function saveMealImage(db: Database, userId: string, bytes: Uint8Array, metadata: { fileName: string; source: "manual" | "ai"; sourceFileId?: string; actorId: string; identity?: AiIdentity; signal?: AbortSignal; region?: "cn"|"global" }, store?: (pathname:string,content:Uint8Array,mime:string)=>Promise<void>, _remove?: (pathname:string)=>Promise<unknown>): Promise<ImageResult> {
  void _remove;
  const mimeType=imageMime(bytes),sha256=createHash("sha256").update(bytes).digest("hex");
  const storage=store?null:activeImageStorage(metadata.region??(process.env.FORMWARD_IMAGE_REGION==="cn"?"cn":"global"));
  try { return await db.transaction(async tx=>{
    await lockOwner(tx,userId);
    if(metadata.signal?.aborted)throw new ApiError(504,"image_timeout","本批上传超时，请重试未成功照片。");
    if(metadata.source==="ai"){
      if(!metadata.identity||metadata.identity.userId!==userId)throw new ApiError(401,"invalid_token","缺少饮食授权。");
      await requireActiveAiToken(tx,metadata.identity,true,"meals");
    }
    const [prior]=await tx.select().from(mealImage).where(and(eq(mealImage.userId,userId),eq(mealImage.sha256,sha256)));
    if(prior)return {id:prior.id,mimeType:prior.mimeType,fileName:prior.fileName,repeated:true,storageProvider:prior.storageProvider};
    const id=randomUUID(),pathname="meal-formal-v2/"+userId+"/"+id,fileName=cleanImageName(metadata.fileName);
    try{await (store??storage!.write)(pathname,bytes,mimeType);}catch{throw new ApiError(503,"image_unavailable","私有照片保存暂时失败，请重试。");}
    // 不确定的 COMMIT 失败不能即时删除正式文件；延期核对数据库后才清理孤立对象。
    await tx.insert(mealImage).values({id,userId,pathname,sha256,mimeType,byteSize:bytes.length,fileName,source:metadata.source,sourceFileId:metadata.sourceFileId??null,createdBy:metadata.actorId,storageProvider:storage?.ref.storageProvider??"blob",storageLocation:storage?.ref.storageLocation??"legacy"});
    return {id,mimeType,fileName,repeated:false,storageProvider:storage?.ref.storageProvider??"blob"};
  }); } catch(error) { if(error instanceof ApiError) throw error; throw new ApiError(503,"image_unavailable","照片登记未完成，请重试。"); }
}
export async function importMealImages(db: Database, identity: AiIdentity, input: unknown, dependencies: { download?: typeof downloadMealImage; save?: typeof saveMealImage } = {}) {
  const requestId = randomUUID(), parsed = imageImportSchema.safeParse(input);
  if (!parsed.success) { imageDiagnostic("file_input", "invalid_input", { requestId }); throw new ApiError(400, "invalid_input", "请传入1–8张 ChatGPT 原图文件引用，包含 download_url 和 file_id。"); }
  await db.transaction(tx => requireActiveAiToken(tx, identity, true, "meals"));
  const userId = identity.userId, actorId = identity.tokenId ?? identity.oauthConnectionId!;
  const images: (ImageResult & { index: number })[] = [], failures: { index: number; code: string; message: string; stage: ImageStage; retryable: boolean; requestId: string }[] = [];
  const parsedInput = parsed.data;
  const files = parsedInput.files, signal = AbortSignal.timeout(85_000); let cursor = 0;
  // 两张并行下载，写入由账号锁串行保护；尚未开始的文件可单独重试。
  async function worker() {
    while (cursor < files.length) {
      const index = cursor++, file = files[index], started = Date.now(); let stage: ImageStage = "download";
      try {
        if (signal.aborted) throw new ApiError(504, "image_timeout", "本批上传超时，请只重试未成功的照片。");
        imageDiagnostic("file_input", "received", { requestId, index });
        if (regionConfig().enabled && parsedInput.processingRegion === "global" && !dependencies.save) {
          const { importGlobalImage } = await import("./image-upload");
          validateImageDownloadUrl(file.download_url);
          images.push({ ...await importGlobalImage(db, identity, file), index });
          continue;
        }
        const bytes = await (dependencies.download ?? downloadMealImage)(file.download_url, undefined, signal);
        stage = "validation"; imageMime(bytes); stage = "storage";
        images.push({ ...await (dependencies.save ?? saveMealImage)(db, userId, bytes, { fileName: file.file_name ?? "照片", source: "ai", sourceFileId: file.file_id, actorId, identity, signal, region: parsedInput.processingRegion }), index });
        imageDiagnostic("registration", "saved", { requestId, index, bytes: bytes.length, elapsedMs: Date.now() - started });
      } catch (error) {
        if (error instanceof ApiError && [401, 403].includes(error.status)) throw error;
        const failure = error instanceof ApiError ? error : new ApiError(503, "image_unavailable", "照片传输未完成，请重试。");
        failures.push({ index, code: failure.code, message: failure.message + (parsedInput.processingRegion !== "global" && regionConfig().enabled ? " 可询问用户是否改用国际区处理本张照片，保留已有文字和成功附件。" : ""), stage, retryable: failure.status >= 500, requestId });
        imageDiagnostic(stage, failure.code, { requestId, index, elapsedMs: Date.now() - started });
      }
    }
  }
  await Promise.all([worker(), worker()]);
  images.sort((a, b) => a.index - b.index); failures.sort((a, b) => a.index - b.index);
  const status = !failures.length ? "complete" : images.length ? "partial" : "failed";
  const rules = (failures.length ? "部分或全部原图未保存。保留成功附件ID，仅重试失败照片；说明具体错误码。image_url_expired须取得新下载地址，不能反复使用旧临时链接。餐次提交expectedImageCount，缺图由用户在网页补传或先保存文字，不声称原图已保存。" : "原图已私有保存，正式餐次／食材尚未保存。使用返回id关联预览并提交expectedImageCount。仅图片先核对日期、餐次、身份、实际食用量和额外油酱，再网页登录确认。") + "新餐用preview_meals；已保存餐次先查询id/version，再用preview_meal_changes；已有待审草稿用update_preview追加addImageIds，保留原内容和附件。预览已含照片时说明待网页确认保存，不说需要另行关联；用户确认后查询get_preview或餐次，再报告当前关联状态。";
  return { images, failures, status, ...((parsedInput.processingRegion==="cn"&&images.some(image=>image.storageProvider==="blob"))?{storageNotice:"已复用国际存储原附件，本次没有复制到COS，国内读取可能受网络影响。"}:{}), expectedImageCount: new Set(images.map(image=>image.id)).size + failures.length, requestId, rules };
}
export async function ownedMealImage(db: Pick<Database, "select">, userId: string, id: string) {
  const [image] = await db.select().from(mealImage).where(and(eq(mealImage.userId, userId), eq(mealImage.id, id)));
  if (!image) throw new ApiError(404, "not_found", "照片不存在。"); return image;
}
export async function loadMealImage(db: Database, userId: string, id: string) {
  const image = await ownedMealImage(db, userId, id);
  try {
    if (regionConfig().enabled && image.storageProvider === "blob") {
      const { imageReadTicket } = await import("./image-read"); const { callImageWorker } = await import("./image-upload");
      const response = await callImageWorker(imageReadTicket({userId:image.userId,pathname:image.pathname,storageProvider:"blob",storageLocation:image.storageLocation,mimeType:image.mimeType}),"read");
      if (!response.body) throw new ApiError(503,"image_unavailable","国际原图暂不可读取。");
      return {stream:response.body,mimeType:image.mimeType};
    }
    return { stream: await imageStorage(image).read(image.pathname), mimeType: image.mimeType };
  } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(503, "image_unavailable", "原图暂不可读取，请稍后重试。"); }
}
