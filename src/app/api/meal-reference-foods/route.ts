import { currentPageUser } from "@/features/auth/server";
import { searchReferenceFoods } from "@/features/meals/reference-catalog";
import { referenceSections, type ReferenceFamily } from "@/features/meals/reference-food";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  if (!await currentPageUser()) return Response.json({ error: "请重新登录后查看食材库。" }, { status: 401, headers });
  const params = new URL(request.url).searchParams;
  const query = params.get("q") ?? "";
  const family = params.get("family");
  const knownFamily = referenceSections.some(section => section.families.some(item => item.id === family));
  if ([...params.keys()].some(key => key !== "q" && key !== "family") ||
    params.getAll("q").length > 1 || params.getAll("family").length > 1 || query.length > 200 || family !== null && !knownFamily) {
    return Response.json({ error: "请检查搜索内容或食材分类。" }, { status: 400, headers });
  }
  return Response.json(searchReferenceFoods(query, (family ?? undefined) as ReferenceFamily | undefined), { headers });
}
