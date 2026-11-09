import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { singleWebRedirect, confirmationPageUrl } from "./web-entry";
import { regionConfig, canonicalMcpUrl } from "./regions";
import { siteOrigin } from "./site-url";
import { proxy } from "../../proxy";
import { handleGatewayRequest } from "./regional-gateway";

const settings = {
  FORMWARD_REGIONAL: "1", FORMWARD_SINGLE_WEB: "1",
  BETTER_AUTH_URL: "https://legacy.example",
  FORMWARD_CN_ORIGIN: "https://203.0.113.10",
  FORMWARD_GLOBAL_ORIGIN: "https://worker.example",
  FORMWARD_SELECTOR_ORIGIN: "https://entry.example",
  FORMWARD_ORIGIN_URL: "https://203.0.113.10",
  FORMWARD_GATEWAY_SECRET: "fictional-only-gateway-key-at-least-32",
};
async function configured(work: () => void | Promise<void>) {
  const prior = { ...process.env };
  Object.assign(process.env, settings);
  try { await work(); } finally {
    for (const key of Object.keys(process.env)) if (!(key in prior)) delete process.env[key];
    Object.assign(process.env, prior);
  }
}

test("旧网页仅GET/HEAD临时跳转国服，保留目标路径与查询且不传Cookie或凭据", () => configured(async () => {
  for (const origin of [settings.BETTER_AUTH_URL, settings.FORMWARD_GLOBAL_ORIGIN]) {
    for (const method of ["GET", "HEAD"]) {
      const response = await handleGatewayRequest(new Request(origin + "/dashboard/training?date=2026-11-09&next=https%3A%2F%2Fevil.example", {
        method, headers: { cookie: "fictional-session=1", authorization: "Bearer fictional", "x-forwarded-host": "evil.example" },
      }));
      assert.equal(response.status, 307);
      const target = new URL(response.headers.get("location")!);
      assert.equal(target.origin, settings.FORMWARD_CN_ORIGIN);
      assert.equal(target.pathname, "/dashboard/training");
      assert.equal(target.searchParams.get("date"), "2026-11-09");
      assert.equal(target.searchParams.get("next"), "https://evil.example");
      assert.equal(response.headers.get("set-cookie"), null);
      assert.equal(response.headers.get("authorization"), null);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    }
  }
}));

test("MCP、授权发现、OAuth网页、原图和静态资源不被网页跳转接管", () => configured(() => {
  for (const path of [
    "/api/mcp", "/api/auth/oauth2/token", "/api/auth/oauth2/authorize", "/api/internal/image-worker",
    "/.well-known/oauth-protected-resource/api/mcp", "/.well-known/oauth-authorization-server/api/auth",
    "/oauth/login?oauth_query=fictional", "/oauth/consent", "/api/meal-images/fictional",
    "/api/v1/openapi.json", "/api/v1/record-operations", "/dashboard/export/file", "/_next/image?url=fictional",
    "/_next/static/chunks/fictional.js", "/icons/formward-mark.svg",
  ]) assert.equal(singleWebRedirect(new Request(settings.BETTER_AUTH_URL + path)), null, path);
}));

test("旧页面POST保存和RSC读取不跨域重放，保护进行中的草稿与原域会话", () => configured(() => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const request = new Request(settings.BETTER_AUTH_URL + "/dashboard/meals", { method, body: "fictional-draft", headers: { "Next-Action": "fictional-action" } });
    assert.equal(singleWebRedirect(request), null);
    assert.equal(request.bodyUsed, false);
  }
  for (const headers of [new Headers({ RSC: "1" }), new Headers({ "Next-Router-Prefetch": "1" })]) {
    assert.equal(singleWebRedirect(new Request(settings.BETTER_AUTH_URL + "/dashboard/meals?_rsc=fictional", { headers })), null);
  }
}));

test("国服与相同入口不循环跳转，未知来源及伪造主机不能改变目标", () => configured(async () => {
  assert.equal(singleWebRedirect(new Request(settings.FORMWARD_CN_ORIGIN + "/dashboard")), null);
  assert.equal(singleWebRedirect(new Request("https://evil.example/dashboard", { headers: { host: "legacy.example" } })), null);
  assert.equal((await handleGatewayRequest(new Request("https://evil.example/dashboard"))).status, 421);
  process.env.FORMWARD_CN_ORIGIN = settings.BETTER_AUTH_URL;
  assert.equal(singleWebRedirect(new Request(settings.BETTER_AUTH_URL + "/")), null);
}));

test("统一身体、饮食、训练和混合审核链接，OAuth issuer及MCP和API来源保持", () => configured(() => {
  const request = new Request("http://localhost:3200/api/mcp", { headers: { "x-formward-public-origin": settings.BETTER_AUTH_URL, host: "evil.example" } });
  for (const path of [
    "/dashboard/ai/operations/fictional", "/dashboard/meals/review/fictional",
    "/dashboard/ai?operation=fictional", "/dashboard/training?date=2026-11-09",
  ]) assert.equal(confirmationPageUrl(request, path), settings.FORMWARD_CN_ORIGIN + path);
  assert.equal(siteOrigin(request), settings.BETTER_AUTH_URL);
  assert.equal(canonicalMcpUrl(), settings.BETTER_AUTH_URL + "/api/mcp");
  assert.equal(regionConfig().canonical, settings.BETTER_AUTH_URL);
  for (const path of ["https://evil.example/claim", "//evil.example/claim", "relative", "/\\evil.example/claim"]) {
    assert.throws(() => confirmationPageUrl(request, path));
  }
  assert.throws(() => confirmationPageUrl(new Request(settings.BETTER_AUTH_URL, { headers: { "x-formward-public-origin": "https://evil.example" } }), "/dashboard"));
}));

test("选择页收拢时不转交入口令牌，国服与主域同址仍正常进入", () => configured(() => {
  const response = proxy(new NextRequest(settings.FORMWARD_SELECTOR_ORIGIN + "/?token=fictional", { headers: { host: "entry.example" } }));
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), settings.FORMWARD_CN_ORIGIN + "/");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  process.env.FORMWARD_SELECTOR_ORIGIN = settings.FORMWARD_CN_ORIGIN;
  const cn = proxy(new NextRequest(settings.FORMWARD_CN_ORIGIN + "/", { headers: { host: "203.0.113.10" } }));
  assert.equal(cn.status, 200);
  assert.equal(cn.headers.get("x-middleware-request-x-formward-region"), "cn");
}));

test("关闭统一网页模式保持原区域行为，图片服务仍执行签名检查", () => configured(async () => {
  process.env.FORMWARD_SINGLE_WEB = "0";
  assert.equal(singleWebRedirect(new Request(settings.BETTER_AUTH_URL + "/dashboard")), null);
  assert.equal(confirmationPageUrl(new Request(settings.BETTER_AUTH_URL, { headers: { "x-formward-public-origin": settings.BETTER_AUTH_URL } }), "/dashboard"), settings.BETTER_AUTH_URL + "/dashboard");
  process.env.FORMWARD_SINGLE_WEB = "1";
  const response = await handleGatewayRequest(new Request(settings.BETTER_AUTH_URL + "/api/internal/image-worker", { method: "POST", body: "{}" }));
  assert.equal(response.status, 403);
}));

test("登录返回路径只采用实际URL，伪造同名请求头被覆盖",()=>configured(()=>{
 const response=proxy(new NextRequest(settings.FORMWARD_CN_ORIGIN+"/dashboard/ai/operations/fictional?view=1",{headers:{host:"203.0.113.10","x-formward-web-path":"https://evil.example"}}));
 assert.equal(response.headers.get("x-middleware-request-x-formward-web-path"),"/dashboard/ai/operations/fictional?view=1");
}));
