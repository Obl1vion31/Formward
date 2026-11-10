import { defineLoginPage } from '@doubao-dev/framework';
import { FormwardConnection } from '../../shared/connection';

export default defineLoginPage({ render() { return <FormwardConnection mcpLogin />; } });
