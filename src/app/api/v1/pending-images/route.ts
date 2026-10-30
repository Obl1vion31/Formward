import {getDatabase} from "@/db/client";
import {aiApiResponse,readAiJson} from "@/features/measurements/ai-api";
import {appendPendingImages} from "@/features/records/operations";
export async function POST(request:Request){return aiApiResponse(request,getDatabase(),true,async identity=>appendPendingImages(getDatabase(),identity,await readAiJson(request)));}
