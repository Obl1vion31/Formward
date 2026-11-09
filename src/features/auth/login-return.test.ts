import assert from "node:assert/strict";
import { test } from "node:test";
import { loginDestination, loginPageUrl } from "./login-return";

test("登录返回本人原业务路径、日期和确认目标，默认仍进入总览", () => {
  for (const path of ["/dashboard/ai/operations/fictional", "/dashboard/meals/review/fictional", "/dashboard/ai?operation=fictional", "/dashboard/training?date=2026-11-09#day"]) {
    assert.equal(loginDestination(path), path);
    assert.equal(new URL(loginPageUrl(path), "https://local.example").searchParams.get("next"), path);
  }
  assert.equal(loginPageUrl(null), "/");
  assert.equal(loginDestination(null), "/dashboard");
});

test("外部地址、反斜线、跨路径和登录循环不能成为登录目标", () => {
  for (const value of [
    undefined, 0, {}, "https://evil.example/dashboard", "//evil.example/dashboard",
    "javascript:alert(1)", "/\\evil.example/dashboard", "/dashboard/../../api/auth",
    "/api/mcp", "/oauth/login", "/?next=/dashboard", "/" + "a".repeat(5000),
  ]) assert.equal(loginDestination(value), "/dashboard");
});
