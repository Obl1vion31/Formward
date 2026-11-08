import test from "node:test";
import assert from "node:assert/strict";
import { cosPostPolicy } from "./image-storage";

test("COS表单的q-key-time与策略的q-sign-time分别使用官方要求的名称", () => {
  const keys = ["FORMWARD_COS_BUCKET", "FORMWARD_COS_REGION", "FORMWARD_COS_SECRET_ID", "FORMWARD_COS_SECRET_KEY"] as const;
  const before = keys.map(key => process.env[key]);
  try {
    Object.assign(process.env, { FORMWARD_COS_BUCKET: "fictional-1250000000", FORMWARD_COS_REGION: "ap-shanghai", FORMWARD_COS_SECRET_ID: "fictional-id", FORMWARD_COS_SECRET_KEY: "fictional-secret" });
    const result = cosPostPolicy("meal-tmp-v2/user/fixture", 68, "image/png", 1_700_000_600_000, 1_700_000_000_000);
    assert.equal(result.fields["q-key-time"], "1699999970;1700000600");
    assert.equal("q-sign-time" in result.fields, false);
    const policy = JSON.parse(Buffer.from(result.fields.policy, "base64").toString("utf8"));
    assert.ok(policy.conditions.some((value: unknown) => JSON.stringify(value) === JSON.stringify({ "q-sign-time": "1699999970;1700000600" })));
    assert.ok(!policy.conditions.some((value: unknown) => typeof value === "object" && value !== null && "q-key-time" in value));
    assert.equal(policy.expiration, "2023-11-14T22:23:20.000Z");
    assert.ok(policy.conditions.some((value: unknown) => JSON.stringify(value) === JSON.stringify(["content-length-range", 68, 68])));
  } finally {
    keys.forEach((key, index) => { if (before[index] === undefined) delete process.env[key]; else process.env[key] = before[index]; });
  }
});
