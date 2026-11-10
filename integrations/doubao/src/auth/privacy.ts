import { definePrivacyApi } from '@doubao-dev/framework';
import { postLoginResult } from '@doubao-dev/framework/api';

export default definePrivacyApi({
  onAgreePrivacy: async () => {},

  onRefusePrivacy: async () => {
    await postLoginResult({ result: false });
  }
});
