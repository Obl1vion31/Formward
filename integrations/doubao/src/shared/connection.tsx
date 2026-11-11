import { useDestroy, useEffect, useRef, useState } from '@doubao-dev/framework';
import { exitApp, getAccountInfoSync, login, postLoginResult, request, showModal, showToast } from '@doubao-dev/framework/api';
import { createLoginReporter } from './login-result';
import { runtimeConfig } from '../config/runtime';
import { recordLoginStage } from './login-diagnostics';
import { loginFailureMessage, withLoginDeadline, type LoginPhase } from './login-errors';
import './connection.scss';

const API_BASE = runtimeConfig.apiBaseUrl;
async function showLoginFailure(message: string) {
  try { await showModal({ title: '连接未完成', content: message, showCancel: false, confirmText: '返回对话' }); }
  catch { await showToast({ message, type: 'error' }).catch(() => {}); }
}

type StartResponse = { authorizationUrl: string; requestId: string };
type AuthorizationMessage = { type: string; requestId: string; refused: boolean; code?: string };

export function FormwardConnection({ mcpLogin = false }: { mcpLogin?: boolean }) {
  const [authorizationUrl, setAuthorizationUrl] = useState('');
  const [working, setWorking] = useState(false);
  const [resultPosting, setResultPosting] = useState(false);
  const [reported, setReported] = useState<'success' | 'refused' | null>(null);
  const [error, setError] = useState('');
  const generation = useRef(0), alive = useRef(true), busy = useRef(false), requestId = useRef('');
  const attempted = useRef(false);
  const posting = useRef(false), closing = useRef(false);
  const reporter = useRef(createLoginReporter(postLoginResult));
  useEffect(() => {
    alive.current = true;
    recordLoginStage('connection_mounted');
    // React子树卸载不等于宿主关闭登录页，不能在此向宿主补发拒绝。
    return () => { alive.current = false; generation.current++; recordLoginStage('connection_unmounted'); };
  }, []);
  useDestroy(() => {
    if (attempted.current || mcpLogin) void reporter.current.failure().catch(() => {});
  });

  async function begin() {
    if (busy.current || closing.current) return;
    attempted.current = true;
    busy.current = true; setWorking(true); setError(''); setReported(null);
    const current = ++generation.current;
    const resultReporter = createLoginReporter(postLoginResult);
    reporter.current = resultReporter;
    let phase: LoginPhase = 'identity';
    try {
      recordLoginStage('identity_check');
      const appId = getAccountInfoSync().miniProgram.appId;
      if (!appId || appId !== runtimeConfig.appId) throw new Error();
      phase = 'login_code'; recordLoginStage('login_code_requested');
      const { code: loginCode } = await login({ timeout: 30000 });
      recordLoginStage('login_code_received');
      if (!alive.current || current !== generation.current) return;
      phase = 'exchange'; recordLoginStage('login_exchange_requested');
      const response = await withLoginDeadline(request({
        url: API_BASE + '/api/doubao/login', method: 'POST',
        header: { 'content-type': 'application/json' }, data: { app_id: appId, login_code: loginCode },
      }), 20000);
      if (!alive.current || current !== generation.current) return;
      phase = 'response';
      const data = response.data as Partial<StartResponse>;
      if (response.statusCode !== 200 || typeof data.authorizationUrl !== 'string' ||
          !data.authorizationUrl.startsWith(API_BASE + '/api/doubao/authorize?') ||
          typeof data.requestId !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(data.requestId)) throw new Error();
      requestId.current = data.requestId;
      setAuthorizationUrl(data.authorizationUrl);
      recordLoginStage('authorization_ready', undefined, true);
    } catch (failure) {
      if (!alive.current || current !== generation.current) return;
      const message = loginFailureMessage(phase, failure);
      setError(message);
      recordLoginStage('login_failed', failure, true);
      // 宿主收到失败后可能立即关闭登录页，先给出可见原因。
      await showLoginFailure(message);
      await resultReporter.failure().catch(() => {});
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
    recordLoginStage('result_received');
    busy.current = true; posting.current = true; setWorking(true); setResultPosting(true);
    let accepted = false;
    try {
      if (message.refused) await reporter.current.failure();
      else if (!await reporter.current.success(message.code!)) return;
      accepted = true;
      if (alive.current) setReported(message.refused ? 'refused' : 'success');
      recordLoginStage('result_reported', undefined, true);
    } catch (failure) {
      recordLoginStage('result_failed', failure, true);
      if (alive.current) setError('登录结果未能通知豆包，请返回对话重试。');
      await showLoginFailure('登录结果未能通知豆包，请返回对话重试。');
      await reporter.current.failure().catch(() => {});
    } finally {
      posting.current = false;
      if (alive.current) { busy.current = false; setWorking(false); setResultPosting(false); }
    }
    if (accepted) {
      try { await exitApp(); }
      catch { if (alive.current) setError(message.refused ? '这次连接未获授权。请使用豆包的返回操作回到对话。' : '连接结果已通知豆包。请使用豆包的返回操作回到对话。'); }
    }
  }

  async function cancel() {
    if (posting.current || closing.current) return;
    closing.current = true;
    recordLoginStage('connection_cancelled', undefined, true);
    generation.current++;
    requestId.current = ''; busy.current = false;
    setWorking(false);
    if (attempted.current || mcpLogin) await reporter.current.failure().catch(() => {});
    try { await exitApp(); }
    catch { if (alive.current) setError('请使用豆包的返回操作回到对话。'); }
    finally { closing.current = false; }
  }

  if (authorizationUrl) return <view className="connection-frame">
    <view className="connection-webview"><web-view src={authorizationUrl} onMessage={event => void receive(event.data)} onLoad={() => recordLoginStage('webview_loaded')} onError={() => {
      if (alive.current) setError('Formward 登录网页未能加载，请检查网络后重新连接。');
      recordLoginStage('webview_failed', undefined, true);
      void showLoginFailure('Formward 登录网页未能加载，请检查网络后重新连接。').then(() => reporter.current.failure()).catch(() => {});
    }} /></view>
    {error && <text className="connection-error">{error}</text>}
    <button type="plain" className="connection-secondary" style={{ backgroundColor: 'transparent', minHeight: '48px' }} disabled={resultPosting} onClick={() => void cancel()}><text className="connection-secondary-label">{reported ? '返回对话' : '取消连接'}</text></button>
  </view>;

  return <scroll-view className="connection-page" scroll-orientation="vertical" enable-scroll={true}>
    <view className="connection-content">
      <text className="connection-title">连接 Formward</text>
      <text className="connection-copy">使用已有的 Formward 邮箱账号登录，再选择是否允许豆包查询记录和提交预览。</text>
      <text className="connection-copy">饮食、身体、消耗与训练共用你的原有记录。正式保存仍需在 Formward 网页确认。</text>
      {error && <text className="connection-error">{error}</text>}
      <button type="plain" className="connection-primary" style={{ backgroundColor: '#cbb083', minHeight: '48px' }} disabled={working} onClick={() => void begin()}><text className="connection-primary-label">{working ? '正在连接…' : '使用 Formward 账号连接'}</text></button>
      <button type="plain" className="connection-secondary" style={{ backgroundColor: 'transparent', minHeight: '48px' }} disabled={resultPosting} onClick={() => void cancel()}><text className="connection-secondary-label">返回对话</text></button>
    </view>
  </scroll-view>;
}
