import packageInfo from "../../package.json";

/** 只维护已公开、已核实的产品资料；公安备案获批后再补入。 */
export const appInformation = {
  name: "Formward",
  productVersion: packageInfo.version,
  website: "https://formward.top",
  icpNumber: "沪ICP备2026060534号-1",
  icpUrl: "https://beian.miit.gov.cn/",
  email: "opg.obl1v@gmail.com",
  privacyUrl: "/privacy.html",
  termsUrl: "/terms.html",
  helpUrl: "/dashboard/tutorial",
} as const;

// 随产品变化维护面向用户的短说明，不展示提交或部署日志。
export const recentChanges = [
  "首页恢复完整人物画面，底部保留备案与更多信息入口。",
  "可以手动检查更新，并查看备案、联系方式和使用帮助。",
  "刷新前会保护尚未保存的输入。",
] as const;
