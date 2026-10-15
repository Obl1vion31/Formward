import { getDatabase } from "@/db/client";
import { aiApiResponse } from "@/features/measurements/ai-api";
import { queryFoods } from "@/features/meals/ai-api";
import { ApiError } from "@/features/auth/ai-identity";
export async function GET(request: Request) { return aiApiResponse(request, getDatabase(), false, async identity => { const params = new URL(request.url).searchParams; if ([...params.keys()].some(k => k !== "q") || params.getAll("q").length > 1) throw new ApiError(400,"invalid_input","食材查询仅支持q。"); return queryFoods(getDatabase(), identity.userId, params.get("q") ?? ""); }); }
