/** 食材库是饮食的正文子页。录入链接仍优先进入原来的录入面板。 */
export function isMealLibrary(params: Pick<URLSearchParams, "getAll" | "has">) {
  const section = params.getAll("section");
  return section.length === 1 && section[0] === "foods" && !params.has("entry");
}
