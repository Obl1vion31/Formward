import { getDatabase } from "@/db/client";
import { aiApiResponse, readAiJson } from "@/features/measurements/ai-api";
import { importMealImages } from "@/features/meals/images";
export const maxDuration=120;
export async function POST(request:Request){return aiApiResponse(request,getDatabase(),true,async identity=>importMealImages(getDatabase(),identity,await readAiJson(request)));}
