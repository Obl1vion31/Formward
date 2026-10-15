# 饮食页面

提供饮食汇总、餐次与食材库网页入口。身份与数据归属在页面和每个 Server Action 分别校验，计算与写入调用 meals feature。初始化与 AI 预览在 review 中确认。

page.tsx 按当前 Next.js 约定等待 searchParams，校验 ?date=YYYY-MM-DD 后打开对应日期历史。非法日期忽略，不改变今天摘要；不接受 URL 账号标识。
