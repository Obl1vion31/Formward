import { getDatabase } from "@/db/client";
import { aiApiResponse } from "@/features/measurements/ai-api";
import { queryMeals } from "@/features/meals/ai-api";
export async function GET(request: Request) { return aiApiResponse(request, getDatabase(), false, identity => queryMeals(getDatabase(), identity.userId, new URL(request.url).searchParams)); }
