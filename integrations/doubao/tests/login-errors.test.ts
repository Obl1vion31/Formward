import { describe, expect, it } from '@rstest/core';
import { loginFailureMessage, safeLoginError, withLoginDeadline } from '../src/shared/login-errors';

describe('原生登录失败反馈', () => {
  it('只保留固定错误类型和数值码，不上报原始错误、凭据或任意字段', () => {
    expect(safeLoginError({ name: 'TypeError', errNo: 102, message: 'secret-code', access_token: 'secret-token' })).toEqual({ errorKind: 'TypeError', errorNo: 102 });
    expect(safeLoginError({ name: 'secret-name', errorCode: 'secret-code' })).toEqual({ errorKind: 'Unknown' });
    expect(safeLoginError(new Error('secret-message'))).toEqual({ errorKind: 'Error' });
  });
  it('非有限、负数、过大或小数错误码不进入输出', () => {
    for (const errNo of [NaN, Infinity, -1, 1.5, 1_000_000_001]) expect(safeLoginError({ errNo })).toEqual({ errorKind: 'Unknown' });
  });
  it('身份、宿主凭证、网络与响应错误给出各自恢复方式', () => {
    expect(loginFailureMessage('identity', {})).toContain('更新');
    expect(loginFailureMessage('login_code', { errNo: 102 })).toContain('登录凭证');
    expect(loginFailureMessage('login_code', { errNo: 102 })).toContain('102');
    expect(loginFailureMessage('exchange', {})).toContain('网络');
    expect(loginFailureMessage('response', {})).toContain('响应无效');
  });
  it('原始平台错误文字和URL永不展示给用户', () => {
    const value = loginFailureMessage('exchange', { message: 'https://example.test/?code=secret', errorCode: 'private-code' });
    expect(value).not.toContain('example'); expect(value).not.toContain('secret'); expect(value).not.toContain('private-code');
  });
});

it('登录请求超时后不接管迟到响应，快速完成仍正常返回', async () => {
  let finish: (value: string) => void = () => {};
  const pending = new Promise<string>(resolve => { finish = resolve; });
  const result = withLoginDeadline(pending, 1);
  await expect(result).rejects.toThrow('timed out');
  finish('late');
  await expect(result).rejects.toThrow('timed out');
  await expect(withLoginDeadline(Promise.resolve('ready'), 100)).resolves.toBe('ready');
});
