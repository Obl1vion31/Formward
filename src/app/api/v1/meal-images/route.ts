import { getDatabase } from "@/db/client";
import { aiApiResponse, readAiJson } from "@/features/measurements/ai-api";
import { importMealImages } from "@/features/meals/images";
import { processingRegion } from "@/features/auth/regions";
export const maxDuration=120;
export async function POST(request:Request){return aiApiResponse(request,getDatabase(),true,async identity=>{const input=await readAiJson(request);return importMealImages(getDatabase(),identity,{...(input as object),processingRegion:(input as {processingRegion?:string})?.processingRegion??processingRegion(request.headers)});});}
