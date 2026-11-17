import { getDatabase } from "@/db/client";
import { accountRequestSource } from "@/features/auth/request-identity";
import { boundedSecurityJson } from "@/features/auth/http-security";
import { consumeSecurityRate, recordSecurityEvent } from "@/features/auth/security-usage";
export async function POST(request: Request) {
  try {
    const db = getDatabase(), source = accountRequestSource(request.headers);
    await consumeSecurityRate(db, "csp-report", source, 20);
    const input = await boundedSecurityJson(request) as { "csp-report"?: { "effective-directive"?: unknown; "blocked-uri"?: unknown } };
    const report = input?.["csp-report"];
    if (report && typeof report["effective-directive"] === "string" && /^[a-z-]{1,60}$/.test(report["effective-directive"])) {
      let host = "inline"; try { host = new URL(String(report["blocked-uri"])).hostname.slice(0, 200); } catch { /* 不保存原文。 */ }
      await recordSecurityEvent(db, "csp_violation", undefined, { directive: report["effective-directive"], host }, source);
    }
  } catch { /* 浏览器反馈不回显内容，不影响页面。 */ }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
