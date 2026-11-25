import { currentPageUser } from "@/features/auth/server";
import { referenceCatalogOverview, searchReferenceFoods } from "@/features/meals/reference-catalog";
import { referenceSections, type ReferenceFamily } from "@/features/meals/reference-food";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  if (!await currentPageUser()) return Response.json({ error: "请重新登录后查看食材库。" }, { status: 401, headers });
  const params = new URL(request.url).searchParams;
  const query = params.get("q") ?? "";
  const family = params.get("family");
  const view = params.get("view");
  const offset = params.get("offset");
  const knownFamily = referenceSections.some(section => section.families.some(item => item.id === family));
  const supported = ["q", "family", "view", "offset"];
  if ([...params.keys()].some(key => !supported.includes(key) || params.getAll(key).length !== 1) ||
    query.length > 200 || family !== null && !knownFamily ||
    view !== null && (view !== "summary" || params.size !== 1) ||
    offset !== null && (!/^\d+$/.test(offset) || !Number.isSafeInteger(Number(offset)))) {
    return Response.json({ error: "请检查搜索内容或食材分类。" }, { status: 400, headers });
  }
  const result = view === "summary"
    ? referenceCatalogOverview()
    : searchReferenceFoods(query, (family ?? undefined) as ReferenceFamily | undefined, undefined, Number(offset ?? 0));
  return Response.json(result, { headers });
}
