import { timingSafeEqual } from "node:crypto";
import { getDatabase } from "@/db/client";
import { synchronizeSource } from "@/features/data-sources/sync";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET, provided = request.headers.get("authorization"), userId = process.env.FORMWARD_DATA_SOURCE_USER_ID;
  const expected = secret ? `Bearer ${secret}` : "";
  if (!secret || !userId || !provided || Buffer.byteLength(provided) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (new URL(request.url).search) return new Response(null, { status: 400 });
  try {
    const result = await synchronizeSource(getDatabase(), userId, { background: true });
    return Response.json({ status: result.status }, { status: result.status === "failed" ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ status: "failed" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
