export type LoginPhase = 'identity' | 'login_code' | 'exchange' | 'response';
export function safeLoginError(error: unknown) {
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const names = ['Error', 'TypeError', 'ReferenceError', 'RangeError', 'SyntaxError'];
  const errorKind = typeof value.name === 'string' && names.includes(value.name) ? value.name : 'Unknown';
  const code = value.errNo ?? value.errorCode;
  const errorNo = typeof code === 'number' && Number.isInteger(code) && code >= 0 && code <= 1_000_000_000 ? code : undefined;
  return { errorKind, ...(errorNo === undefined ? {} : { errorNo }) };
}
export function loginFailureMessage(phase: LoginPhase, error: unknown) {
  const descriptions: Record<LoginPhase, string> = {
    identity: '无法识别当前插件，请在豆包 Debugger 更新 Formward 资源后重试。',
    login_code: '未能取得豆包登录凭证，请返回对话重新发起连接。',
    exchange: '未能连接 Formward 登录服务，请检查网络后重试。',
    response: 'Formward 登录响应无效，请返回对话重新发起连接。',
  };
  const { errorNo } = safeLoginError(error);
  return descriptions[phase] + (errorNo === undefined ? '' : `（错误码 ${errorNo}）`);
}

/** 只终止当前等待，迟到响应不会继续页面流程；不向JSB加入不支持的参数。 */
export function withLoginDeadline<T>(pending: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Formward login request timed out')), milliseconds);
    pending.then(resolve, reject);
  }).finally(() => clearTimeout(timer));
}
