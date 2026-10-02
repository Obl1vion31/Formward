import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  // Next.js 的运行 / 可用性规则与 TypeScript 规则；展开运算符把规则数组放入配置。
  ...nextVitals,
  ...nextTs,
  // 构建产物和自动生成的类型入口无需人工检查，实际源码仍会经过 pnpm lint。
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
