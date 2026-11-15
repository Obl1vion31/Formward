import assert from "node:assert/strict";

export type FieldDifference = { path: string; before: unknown; after: unknown };
const missing = { absent: true };
/** 比较真实业务结果；允许路径必须由测试预先列出，不从请求或实际差异反推。 */
export function fieldDifferences(before: unknown, after: unknown, path = ""): FieldDifference[] {
  if (Object.is(before, after)) return [];
  if (before instanceof Date || after instanceof Date) {
    const a = before instanceof Date ? before.toISOString() : before, b = after instanceof Date ? after.toISOString() : after;
    return Object.is(a, b) ? [] : [{ path, before: a, after: b }];
  }
  if (before && after && typeof before === "object" && typeof after === "object" && Array.isArray(before) === Array.isArray(after)) {
    const a = before as Record<string, unknown>, b = after as Record<string, unknown>;
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(key => {
      const next = path ? `${path}.${key}` : key;
      if (!Object.hasOwn(a, key) || !Object.hasOwn(b, key)) return [{ path: next, before: Object.hasOwn(a, key) ? a[key] : missing, after: Object.hasOwn(b, key) ? b[key] : missing }];
      return fieldDifferences(a[key], b[key], next);
    });
  }
  return [{ path, before, after }];
}
export function preservationResult(before: unknown, after: unknown, allowed: readonly string[]) {
  const actual = fieldDifferences(before, after);
  return { allowed, actual, unexpected: actual.filter(change => !allowed.includes(change.path)) };
}
export function assertOnlyFieldsChanged(before: unknown, after: unknown, allowed: readonly string[]) {
  const result = preservationResult(before, after, allowed);
  assert.deepEqual(result.unexpected, [], `出现未授权字段变化：${JSON.stringify(result.unexpected)}`);
  return result;
}
