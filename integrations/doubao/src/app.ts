import { defineApp } from '@doubao-dev/framework';
import { showToast } from '@doubao-dev/framework/api';
import { recordLoginStage } from './shared/login-diagnostics';

export default defineApp({
  onLaunch() { recordLoginStage('app_launch', undefined, true); },
  onError(error) {
    recordLoginStage('app_error', error, true);
    void showToast({ message: 'Formward 插件未能正常启动，请返回 Debugger 更新资源后重试。', type: 'error' }).catch(() => {});
  },
});
