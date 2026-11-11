import { defineLoginPage } from '@doubao-dev/framework';
import { FormwardConnection } from '../../shared/connection';
import { recordLoginStage } from '../../shared/login-diagnostics';

export default defineLoginPage({
  onCreated() { recordLoginStage('login_page_created'); },
  onDestroy() { recordLoginStage('login_page_destroyed', undefined, true); },
  render() { return <FormwardConnection mcpLogin />; },
});
