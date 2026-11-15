import {relayImageUpload,recordImageUploadDiagnostic} from "@/features/meals/image-upload-relay";
import { withCurrentSession } from "@/features/auth/server";
import { isAccountRequestOrigin } from "@/features/auth/site-url";
import { getDatabase } from "@/db/client";
import { saveMealImage } from "@/features/meals/images";
import { prepareImageUpload, completeImageUpload, signImageUpload, signDirectImageUpload } from "@/features/meals/image-upload";
import { safeAiError } from "@/features/measurements/ai-api";
import type { HandleUploadPresignedBody } from "@vercel/blob/client";
import { processingRegion } from "@/features/auth/regions";
import { imageUploadRoutes } from "@/features/meals/image-routes";
export const maxDuration = 600;
export async function GET(request: Request) {
  try { return await withCurrentSession(request.headers, async () => Response.json(imageUploadRoutes(processingRegion(request.headers)), { headers: { "Cache-Control": "private, no-store" } })); }
  catch (error) { const failure = safeAiError(error); return Response.json({ error: failure.error.message, code: failure.error.code }, { status: failure.status, headers: { "Cache-Control": "private, no-store" } }); }
}
export async function POST(request: Request) {
  if (!isAccountRequestOrigin(request.headers)) return Response.json({ error: "上传来源无效。" }, { status: 403 });
  try {
    return await withCurrentSession(request.headers, async user => {
    let result;
    if(request.headers.get("content-type")==="application/octet-stream") {
      if(processingRegion(request.headers)!=="cn")return Response.json({error:"当前入口请改用国际通道上传原图。"},{status:409});
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
      if (body.step === "prepare") {
        if (body.region !== undefined && body.region !== "cn" && body.region !== "global") return Response.json({ error: "上传通道无效。" }, { status: 400 });
        result = {...await prepareImageUpload(getDatabase(), user.id, body.file, undefined, body.region ?? processingRegion(request.headers)),relayAvailable:processingRegion(request.headers)==="cn"};
      }
      else if(body.step==="sign_direct"&&typeof body.ticket==="string"&&body.ticket.length<=4096)result=await signDirectImageUpload(getDatabase(),user.id,body.ticket);
      else if (body.step === "complete" && typeof body.ticket === "string" && body.ticket.length <= 4096) result = await completeImageUpload(getDatabase(), user.id, body.ticket);
      else result = await signImageUpload(request, body as HandleUploadPresignedBody, user.id);
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    });
  } catch (error) { const safe = safeAiError(error); return Response.json({ error: safe.error.message, code: safe.error.code }, { status: safe.status, headers: { "Cache-Control": "no-store" } }); }
}
