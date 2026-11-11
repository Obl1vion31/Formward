import { defineLoginApi } from '@doubao-dev/framework';
import { navigateTo, postLoginResult, showModal } from '@doubao-dev/framework/api';
import { recordLoginStage } from '../shared/login-diagnostics';

export default defineLoginApi({
  onLogin: async () => {
    // 不读取回调中的手机号票据；所有入口统一使用原有邮箱账号及显式授权。
    recordLoginStage('host_phone_entry', undefined, true);
    try { await navigateTo({ url: '/pages/mcp-login-page/index' }); }
    catch (error) {
      recordLoginStage('login_failed', error, true);
      await showModal({ title: '连接未完成', content: '未能打开 Formward 登录页，请返回 Debugger 更新资源后重试。', showCancel: false, confirmText: '返回对话' }).catch(() => {});
      await postLoginResult({ result: false });
    }
  },
  onRefuseLogin: async () => {
    recordLoginStage('host_login_refused', undefined, true);
    await postLoginResult({ result: false });
  },
});
