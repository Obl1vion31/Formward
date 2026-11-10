import { defineLoginApi } from '@doubao-dev/framework';
import { postLoginResult, showToast } from '@doubao-dev/framework/api';

export default defineLoginApi({
  onLogin: async () => {
    // Formward 采用已有邮箱账号；不读取或关联宿主手机号。
    await postLoginResult({ result: false });
    await showToast({ message: '请选择其他方式，使用已有 Formward 账号登录。', type: 'warning' });
  },
  onRefuseLogin: async () => {
    await postLoginResult({
      result: false
    });
  }
});
