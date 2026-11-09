// 仅由隔离浏览器测试的 Node --import 加载，不进入应用运行包。
if (process.env.FORMWARD_GARMIN_FIXTURE !== "1" || new URL(process.env.DATABASE_URL).hostname !== "127.0.0.1") throw new Error("Garmin fixture requires an isolated loopback database");
const originalFetch = globalThis.fetch;
globalThis.fetch = async function fixtureFetch(input, init) {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (!["personal.connectapi.garmin.com", "personal.connectapi.garmin.cn"].includes(url.hostname)) return originalFetch(input, init);
  const china = url.hostname === "personal.connectapi.garmin.cn";
  const auth = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).get("authorization") ?? "";
  if (url.pathname.endsWith("/personal-api-key/token")) {
    const key = auth.replace(/^ApiKey /, "");
    if (!(china ? /^fictional-garmin-cn(-slow)?$/ : /^fictional-garmin-(a|b|slow|unavailable)$/).test(key)) return new Response("unauthorized", { status: 401 });
    if (key.endsWith("slow")) await new Promise(resolve => setTimeout(resolve, 1600));
    if (key.endsWith("unavailable")) return new Response("unavailable", { status: 503 });
    return new Response(key.replace("fictional-garmin-", "fixture-token-"));
  }
  if (!(china ? /^Bearer fixture-token-cn(-slow)?$/ : /^Bearer fixture-token-(a|b|slow)$/).test(auth)) return new Response("unauthorized", { status: 401 });
  if (url.pathname.endsWith("/dailysummaries")) {
    const total = china ? 2650 : auth.endsWith("b") ? 2750 : 2350, dates = [];
    for (let date = url.searchParams.get("startDate"); date <= url.searchParams.get("endDate");) {
      dates.push(date); const next = new Date(date + "T00:00:00Z"); next.setUTCDate(next.getUTCDate() + 1); date = next.toISOString().slice(0, 10);
      if (dates.length > 3670) throw new Error("Fixture range exceeded");
    }
    return Response.json({ data: dates.map(calendarDate => ({ calendarDate, calories: { burnedTotal: total, burnedResting: 1900, burnedActive: total - 1900 }, movement: { steps: { value: 7200 } } })) });
  }
  if (url.pathname.endsWith("/activities/search/activities")) return Response.json([]);
  return new Response("unsupported fixture endpoint", { status: 404 });
};
