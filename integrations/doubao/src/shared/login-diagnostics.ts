import { request } from '@doubao-dev/framework/api';
import { runtimeConfig } from '../config/runtime';
import { safeLoginError } from './login-errors';

type Stage = 'app_launch' | 'app_error' | 'login_page_created' | 'login_page_destroyed' | 'connection_mounted' | 'connection_unmounted' | 'host_phone_entry' | 'host_login_refused' | 'privacy_refused' | 'identity_check' | 'login_code_requested' | 'login_code_received' | 'login_exchange_requested' | 'authorization_ready' | 'login_failed' | 'webview_loaded' | 'webview_failed' | 'result_received' | 'result_reported' | 'result_failed' | 'connection_cancelled';
const started = Date.now();
const trace = `native_${started.toString(36)}_${Math.random().toString(36).slice(2, 12).padEnd(10, '0')}`;
let queue: object[] = [], timer: ReturnType<typeof setTimeout> | undefined, batches = 0;

/** 仅发送固定阶段与数值错误码；不发送原始错误、URL、身份、凭据或健康内容。 */
export function recordLoginStage(stage: Stage, error?: unknown, immediate = false) {
  const entry = { stage, elapsedMs: Math.min(3_600_000, Math.max(0, Date.now() - started)), ...(error === undefined ? {} : safeLoginError(error)) };
  console.info(JSON.stringify({ event: 'formward_native_login', trace, ...entry }));
  if (batches >= 4) return;
  queue.push(entry);
  if (queue.length > 12) queue.shift();
  if (timer) clearTimeout(timer);
  if (immediate) flush();
  else timer = setTimeout(flush, 700);
}
function flush() {
  timer = undefined;
  if (!queue.length || batches >= 4) return;
  const events = queue; queue = []; batches++;
  try { void request({
    url: runtimeConfig.apiBaseUrl + '/api/doubao/client-events', method: 'POST',
    header: { 'content-type': 'application/json' },
    data: { app_id: runtimeConfig.appId, trace, build: 'login-recovery-3', events },
  }).catch(() => {}); } catch { /* 诊断失败不影响登录。 */ }
}
