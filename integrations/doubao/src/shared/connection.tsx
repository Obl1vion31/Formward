import { useEffect, useRef, useState } from '@doubao-dev/framework';
import { exitApp, getAccountInfoSync, login, postLoginResult, request } from '@doubao-dev/framework/api';
import { createLoginReporter } from './login-result';
import { runtimeConfig } from '../config/runtime';
import './connection.scss';

const API_BASE = runtimeConfig.apiBaseUrl;
type StartResponse = { authorizationUrl: string; requestId: string };
type AuthorizationMessage = { type: string; requestId: string; refused: boolean; code?: string };

export function FormwardConnection({ mcpLogin = false }: { mcpLogin?: boolean }) {
  const [authorizationUrl, setAuthorizationUrl] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0), alive = useRef(true), busy = useRef(false), requestId = useRef('');
  const attempted = useRef(false);
  const reporter = useRef(createLoginReporter(postLoginResult));
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; generation.current++; if (attempted.current || mcpLogin) void reporter.current.failure().catch(() => {}); };
  }, [mcpLogin]);

  async function begin() {
    if (busy.current) return;
    attempted.current = true;
    busy.current = true; setWorking(true); setError('');
    const current = ++generation.current;
    const resultReporter = createLoginReporter(postLoginResult);
    reporter.current = resultReporter;
    try {
      const appId = getAccountInfoSync().miniProgram.appId;
      if (!appId || appId !== runtimeConfig.appId) throw new Error();
      const { code: loginCode } = await login({ timeout: 30000 });
      if (!alive.current || current !== generation.current) return;
      const response = await request({
        url: API_BASE + '/api/doubao/login', method: 'POST',
        header: { 'content-type': 'application/json' }, data: { app_id: appId, login_code: loginCode },
      });
      if (!alive.current || current !== generation.current) return;
      const data = response.data as Partial<StartResponse>;
      if (response.statusCode !== 200 || typeof data.authorizationUrl !== 'string' ||
          !data.authorizationUrl.startsWith(API_BASE + '/api/doubao/authorize?') ||
          typeof data.requestId !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(data.requestId)) throw new Error();
      requestId.current = data.requestId;
      setAuthorizationUrl(data.authorizationUrl);
    } catch {
      await resultReporter.failure().catch(() => {});
      if (alive.current && current === generation.current) setError('连接未完成，请返回对话重新发起，或稍后重试。');
      console.info(JSON.stringify({ event: 'formward_login', stage: 'failed' }));
    } finally {
      if (alive.current && current === generation.current) { busy.current = false; setWorking(false); }
    }
  }

  async function receive(raw: unknown) {
    if (busy.current || !alive.current) return;
    let message: AuthorizationMessage;
    try { message = (typeof raw === 'string' ? JSON.parse(raw) : raw) as AuthorizationMessage; }
    catch { return; }
    if (!message || message.type !== 'formward.authorization' || message.requestId !== requestId.current || typeof message.refused !== 'boolean') return;
    if (!message.refused && (typeof message.code !== 'string' || !message.code.startsWith('fdb1.') || message.code.length > 16000)) return;
    busy.current = true; setWorking(true);
    try {
      if (message.refused) await reporter.current.failure();
      else if (!await reporter.current.success(message.code!)) return;
      console.info(JSON.stringify({ event: 'formward_login', stage: message.refused ? 'refused' : 'complete' }));
      await exitApp();
    } catch {
      await reporter.current.failure().catch(() => {});
      if (alive.current) setError('暂时无法完成连接，请返回豆包对话重试。');
    } finally { if (alive.current) { busy.current = false; setWorking(false); } }
  }

  async function cancel() {
    if (busy.current) return;
    generation.current++;
    if (attempted.current || mcpLogin) await reporter.current.failure().catch(() => {});
    try { await exitApp(); }
    catch { if (alive.current) setError('请使用豆包的返回操作回到对话。'); }
  }

  if (authorizationUrl) return <view className="connection-frame">
    <view className="connection-webview"><web-view src={authorizationUrl} onMessage={event => void receive(event.data)} onError={() => { void reporter.current.failure().catch(() => {}); if (alive.current) setError('登录页面暂时无法打开，请返回豆包重新连接。'); }} /></view>
    {error && <text className="connection-error">{error}</text>}
    <button className="connection-secondary" disabled={working} onClick={() => void cancel()}>取消连接</button>
  </view>;

  return <scroll-view className="connection-page" scroll-orientation="vertical" enable-scroll={true}>
    <view className="connection-content">
      <text className="connection-title">连接 Formward</text>
      <text className="connection-copy">使用已有的 Formward 邮箱账号登录，再选择是否允许豆包查询记录和提交预览。</text>
      <text className="connection-copy">饮食、身体、消耗与训练共用你的原有记录。正式保存仍需在 Formward 网页确认。</text>
      {error && <text className="connection-error">{error}</text>}
      <button className="connection-primary" disabled={working} onClick={() => void begin()}>{working ? '正在连接…' : '使用 Formward 账号连接'}</button>
      <button className="connection-secondary" disabled={working} onClick={() => void cancel()}>返回对话</button>
    </view>
  </scroll-view>;
}
