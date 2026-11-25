import { currentPageUser } from "@/features/auth/server";
import { referenceCatalogDetail, referenceCatalogOverview, searchReferenceFoods } from "@/features/meals/reference-catalog";
import { referenceSections, type ReferenceFamily } from "@/features/meals/reference-food";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  if (!await currentPageUser()) return Response.json({ error: "请重新登录后查看食材库。" }, { status: 401, headers });
  const params = new URL(request.url).searchParams;
  const query = params.get("q") ?? "";
  const family = params.get("family");
  const view = params.get("view");
  const offset = params.get("offset");
  const id = params.get("id");
  const knownFamily = referenceSections.some(section => section.families.some(item => item.id === family));
  const supported = ["q", "family", "view", "offset", "id"];
  if ([...params.keys()].some(key => !supported.includes(key) || params.getAll(key).length !== 1) ||
    query.length > 200 || family !== null && !knownFamily ||
    id !== null && (params.size !== 1 || !/^[a-z0-9-]{1,100}$/.test(id)) ||
    view !== null && (view !== "summary" || params.size !== 1) ||
    offset !== null && (!/^\d+$/.test(offset) || !Number.isSafeInteger(Number(offset)))) {
    return Response.json({ error: "请检查搜索内容或食材分类。" }, { status: 400, headers });
  }
  const result = id ? referenceCatalogDetail(id) : view === "summary"
    ? referenceCatalogOverview()
    : searchReferenceFoods(query, (family ?? undefined) as ReferenceFamily | undefined, undefined, Number(offset ?? 0));
  return result ? Response.json(result, { headers }) :
    Response.json({ error: "参考食材已更新，请重新搜索选择。" }, { status: 404, headers });
}
