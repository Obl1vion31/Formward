/** 正式AI出口与离线评测共用的字段选择；不计算或修改业务数据。 */
/** @param {unknown} value @param {string[]} parts @param {number} index @returns {boolean} */
function containsPath(value, parts, index = 0) {
  if (index === parts.length) return true;
  if (value === null || typeof value !== "object") return false;
  const children = () => Object.entries(value).filter(([key]) => key !== "fieldDefinitions").map(([, child]) => child);
  const part = parts[index];
  if (part === "**") return containsPath(value, parts, index + 1) || children().some(child => containsPath(child, parts, index));
  if (part === "*") return children().some(child => containsPath(child, parts, index + 1));
  return Object.hasOwn(value, part) && containsPath(Reflect.get(value, part), parts, index + 1);
}
/** @param {unknown} data @param {Record<string, string>} definitions @returns {Record<string, string>} */
export function selectFieldDefinitions(data, definitions) {
  return Object.fromEntries(Object.entries(definitions).filter(([path]) => containsPath(data, path.split("."))));
}
