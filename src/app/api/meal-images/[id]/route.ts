import { regionConfig } from "@/features/auth/regions";
import { imageReadTicket } from "@/features/meals/image-read";
import { currentPageUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { ownedMealImage, loadMealImage } from "@/features/meals/images";
import { safeAiError } from "@/features/measurements/ai-api";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
 const user=await currentPageUser();if(!user)return new Response(null,{status:401});
 try {const {id}=await params; const ref=await ownedMealImage(getDatabase(),user.id,id);
 if(regionConfig().enabled&&request.headers.get("x-formward-region")==="global"&&ref.storageProvider==="blob")return Response.json({ticket:imageReadTicket({userId:ref.userId,pathname:ref.pathname,storageProvider:"blob",storageLocation:ref.storageLocation,mimeType:ref.mimeType})},{headers:{"Cache-Control":"private, no-store","x-image-worker":"1"}});
 const image=await loadMealImage(getDatabase(),user.id,id);return new Response(image.stream,{headers:{"Content-Type":image.mimeType,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});}catch(error){const safe=safeAiError(error);return Response.json({error:safe.error.message},{status:safe.status,headers:{"Cache-Control":"no-store"}});}
}
