import {relayImageUpload,recordImageUploadDiagnostic} from "@/features/meals/image-upload-relay";
import { withCurrentSession } from "@/features/auth/server";
import { isAccountRequestOrigin } from "@/features/auth/site-url";
import { getDatabase } from "@/db/client";
import { saveMealImage } from "@/features/meals/images";
import { prepareImageUpload, completeImageUpload, signImageUpload } from "@/features/meals/image-upload";
import { safeAiError } from "@/features/measurements/ai-api";
import type { HandleUploadPresignedBody } from "@vercel/blob/client";
import { processingRegion } from "@/features/auth/regions";
export const maxDuration = 60;
export async function POST(request: Request) {
  if (!isAccountRequestOrigin(request.headers)) return Response.json({ error: "上传来源无效。" }, { status: 403 });
  try {
    return await withCurrentSession(request.headers, async user => {
    let result;
    if(request.headers.get("content-type")==="application/octet-stream") {
      result=await relayImageUpload(getDatabase(),user.id,request);
    } else if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      // 兼容旧客户端；新网页20 MiB原图通过预签名直传，不经过函数请求体。
      if (Number(request.headers.get("content-length")) > 4 * 1024 * 1024 + 65536) return Response.json({ error: "旧上传入口最大4 MiB，请刷新页面使用大图上传。" }, { status: 413 });
      const file = (await request.formData()).get("file");
      if (!(file instanceof File) || file.size > 4 * 1024 * 1024) return Response.json({ error: "请刷新页面使用新版照片上传。" }, { status: 400 });
      result = await saveMealImage(getDatabase(), user.id, new Uint8Array(await file.arrayBuffer()), { fileName: file.name, source: "manual", actorId: user.id });
    } else {
      if (Number(request.headers.get("content-length")) > 8192) return Response.json({ error: "上传请求过大。" }, { status: 413 });
      const body = await request.json();
      if(body.step==="diagnostic"){recordImageUploadDiagnostic(body.diagnostic);return new Response(null,{status:204,headers:{"Cache-Control":"no-store"}});}
      if (body.step === "prepare") result = await prepareImageUpload(getDatabase(), user.id, body.file, undefined, processingRegion(request.headers));
      else if (body.step === "complete" && typeof body.ticket === "string" && body.ticket.length <= 4096) result = await completeImageUpload(getDatabase(), user.id, body.ticket);
      else result = await signImageUpload(request, body as HandleUploadPresignedBody, user.id);
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    });
  } catch (error) { const safe = safeAiError(error); return Response.json({ error: safe.error.message, code: safe.error.code }, { status: safe.status, headers: { "Cache-Control": "no-store" } }); }
}
