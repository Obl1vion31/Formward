// 浏览器表单、认证配置与网站保存共用；新密码只校验长度，不限制字符组合或改写已有密码。
export const MIN_PASSWORD_LENGTH = 6;
export const MAX_PASSWORD_LENGTH = 128;
export const PASSWORD_LENGTH_LABEL = `${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} 个字符`;
