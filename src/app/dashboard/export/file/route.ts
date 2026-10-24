import { headers } from "next/headers";
import { currentUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { buildAccountWorkbook, exportRange, readAccountExport } from "@/features/exports/workbook";
import { localMeasurementDate } from "@/features/measurements/entry-state";
import { ApiError } from "@/features/auth/ai-identity";
export const runtime = "nodejs";
export const maxDuration = 60;
const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Vary": "Cookie" };
export async function GET(request: Request) {
  const user = await currentUser(await headers());
  if (!user) return Response.json({ error: "请先登录再下载。" }, { status: 401, headers: privateHeaders });
  try {
    const range = exportRange(new URL(request.url).searchParams), timezone = process.env.FORMWARD_TIMEZONE ?? "Asia/Shanghai", today = localMeasurementDate(new Date(), timezone);
    const workbook = await buildAccountWorkbook(await readAccountExport(getDatabase(), user.id), range, { today, timezone });
    const filename = `formward-records-${range.from ?? "all"}-${range.to ?? today}.xlsx`;
    return new Response(workbook, { headers: { ...privateHeaders, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}"` } });
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.status, headers: privateHeaders });
    return Response.json({ error: "导出未完成，请稍后重试。" }, { status: 500, headers: privateHeaders });
  }
}
