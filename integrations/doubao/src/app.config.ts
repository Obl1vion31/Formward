import { defineAppConfig } from '@doubao-dev/framework/config';
import { runtimeConfig } from './config/runtime';

export default defineAppConfig({
  appId: runtimeConfig.appId,
  name: 'Formward',
  darkMode: true,
  pages: ['pages/home/index'],
  widgets: []
});
