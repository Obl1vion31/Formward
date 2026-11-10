import { defineConfig } from '@rstest/core';

// Docs: https://rstest.rs/config/
export default defineConfig({
  globals: false,
  testEnvironment: 'node',
  include: ['tests/**/*.test.ts']
});
