import { currentPageUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { saveMealImage, MAX_IMAGE_BYTES } from "@/features/meals/images";
import { safeAiError } from "@/features/measurements/ai-api";
export const maxDuration=60;
export async function POST(request:Request) {
 const user=await currentPageUser(); if(!user) return Response.json({error:"请先登录。"},{status:401});
 if(request.headers.get("origin")!==new URL(request.url).origin) return Response.json({error:"上传来源无效。"},{status:403});
 if(Number(request.headers.get("content-length"))>MAX_IMAGE_BYTES+65536) return Response.json({error:"照片最大4 MiB。"},{status:413});
 try { const form=await request.formData(), file=form.get("file"); if(!(file instanceof File) || file.size>MAX_IMAGE_BYTES) return Response.json({error:"请选择最大4 MiB的原图。"},{status:400});
 const image=await saveMealImage(getDatabase(),user.id,new Uint8Array(await file.arrayBuffer()),{fileName:file.name,source:"manual",actorId:user.id});return Response.json(image,{headers:{"Cache-Control":"no-store"}});
 } catch(error) { const safe=safeAiError(error);return Response.json({error:safe.error.message},{status:safe.status}); }
}
