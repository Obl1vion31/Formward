import { currentPageUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { loadMealImage } from "@/features/meals/images";
import { safeAiError } from "@/features/measurements/ai-api";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
 const user=await currentPageUser();if(!user)return new Response(null,{status:401});
 try {const {id}=await params, image=await loadMealImage(getDatabase(),user.id,id);return new Response(image.stream,{headers:{"Content-Type":image.mimeType,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});}catch(error){const safe=safeAiError(error);return Response.json({error:safe.error.message},{status:safe.status,headers:{"Cache-Control":"no-store"}});}
}
