/** 来源名称是用户提供的自由文本，不以品牌或历史候选作白名单。 */
export function validateDeviceLabel(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 300 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error("实测请填写数据来源，最多 300 个字符。");
  return value.trim();
}
