import assert from "node:assert/strict";
import { test } from "node:test";
import { siteOrigin } from "./site-url";
import { aiConfirmationUrl, aiRequestTimezone } from "../measurements/ai-api";
import { measurementOpenApiForRequest } from "../measurements/ai-openapi";

test("公网地址固定采用配置中的 HTTPS，忽略代理内部地址和伪造 Host", () => {
  const request = new Request("http://localhost:3000/api/v1/openapi.json", {
    headers: { Host: "attacker.example", "X-Forwarded-Host": "another.example", "X-Forwarded-Proto": "http" },
  });
  assert.equal(siteOrigin(request, "https://formward.example"), "https://formward.example");
  const previous = process.env.BETTER_AUTH_URL;
  process.env.BETTER_AUTH_URL = "https://formward.example";
  try {
    assert.equal(aiConfirmationUrl(request, "/dashboard/ai/operations/fictional"), "https://formward.example/dashboard/ai/operations/fictional");
    const schema = measurementOpenApiForRequest(request);
    assert.deepEqual(schema.servers, [{ url: "https://formward.example/api/v1" }]);
    assert.equal(schema.components.securitySchemes.bearerAuth.scheme, "bearer");
    assert.ok(schema.paths["/measurement-operations"].post);
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_URL;
    else process.env.BETTER_AUTH_URL = previous;
  }
});

test("本机网站保留 localhost、127.0.0.1 和 IPv6 的实际访问地址", () => {
  for (const host of ["localhost:4567", "127.0.0.1:4567", "[::1]:4567"]) {
    const request = new Request("http://localhost:3000/api/v1/openapi.json", { headers: { Host: host } });
    assert.equal(siteOrigin(request, "http://localhost:4567"), `http://${host}`);
  }
});

test("拒绝非 HTTPS 公网配置、含凭据的地址和错误根路径", () => {
  const request = new Request("http://localhost:3000");
  for (const base of ["http://formward.example", "https://user:password@formward.example", "https://formward.example/subpath", "https://formward.example?token=fictional", "https://formward.example#fragment", "ftp://localhost"]) {
    assert.throws(() => siteOrigin(request, base));
  }
  assert.throws(() => siteOrigin(new Request("https://attacker.example"), "http://localhost:3000"), /配置公网 HTTPS/);
});

test("云服务默认时区可独立配置，客户端时区优先，无效配置不静默忽略", () => {
  assert.equal(aiRequestTimezone(new Request("http://localhost"), "Asia/Shanghai"), "+08:00");
  assert.equal(aiRequestTimezone(new Request("http://localhost", { headers: { "X-Formward-Timezone": "+05:45" } }), "Asia/Shanghai"), "+05:45");
  assert.throws(() => aiRequestTimezone(new Request("http://localhost"), "invalid-zone"), /时区无效/);
});
