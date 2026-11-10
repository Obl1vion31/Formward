import { describe, expect, it } from '@rstest/core';
import { createLoginReporter, type LoginResultPayload } from '../src/shared/login-result';

describe('登录回传', () => {
  it('成功只回传一次，重复网页消息和页面销毁不补失败', async () => {
    const calls: LoginResultPayload[] = [];
    const reporter = createLoginReporter(async value => { calls.push(value); });
    expect(await reporter.success('fictional-developer-code')).toBe(true);
    expect(await reporter.success('fictional-developer-code')).toBe(false);
    await reporter.failure();
    expect(calls).toEqual([{ result: true, code: 'fictional-developer-code' }]);
  });
  it('失败或取消后不把迟到成功发给宿主', async () => {
    const calls: LoginResultPayload[] = [];
    const reporter = createLoginReporter(async value => { calls.push(value); });
    await reporter.failure(); await reporter.failure();
    expect(await reporter.success('fictional-late-code')).toBe(false);
    expect(calls).toEqual([{ result: false }]);
  });
  it('成功回传出错时只补发一次失败', async () => {
    const calls: LoginResultPayload[] = [];
    const reporter = createLoginReporter(async value => { calls.push(value); if (value.result) throw new Error('fictional host failure'); });
    await expect(reporter.success('fictional-code')).rejects.toThrow();
    await reporter.failure();
    expect(calls).toEqual([{ result: true, code: 'fictional-code' }, { result: false }]);
  });
  it('宿主正在接收成功时，重复消息和关闭等待同一结果', async () => {
    const calls: LoginResultPayload[] = [];
    let finish: () => void = () => {};
    const reporter = createLoginReporter(async value => { calls.push(value); if (value.result) await new Promise<void>(resolve => { finish = resolve; }); });
    const success = reporter.success('fictional-code');
    expect(await reporter.success('fictional-code')).toBe(false);
    const closing = reporter.failure(); finish();
    expect(await success).toBe(true); await closing;
    expect(calls).toEqual([{ result: true, code: 'fictional-code' }]);
  });
});
