import { headers } from "next/headers";
import { currentUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { readAssistantContext } from "@/features/assistant/server";
import { assistantTimezone } from "@/features/assistant/model";

const responseHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function GET(request: Request) {
  const user = await currentUser(await headers());
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401, headers: responseHeaders });
  const params = new URL(request.url).searchParams;
  let timezone: string;
  try {
    if ([...params.keys()].some(key => key !== "timezone")) throw new Error("请求参数无效。");
    timezone = assistantTimezone(params.get("timezone"));
  } catch { return Response.json({ error: "请选择有效的设备时区。" }, { status: 400, headers: responseHeaders }); }
  try { return Response.json(await readAssistantContext(getDatabase(), user, timezone), { headers: responseHeaders }); }
  catch { return Response.json({ error: "暂时无法核对记录，请重试。" }, { status: 503, headers: responseHeaders }); }
}
