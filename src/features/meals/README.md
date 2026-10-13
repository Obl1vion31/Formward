# Meals

负责饮食网页、食材规格、整餐估算与杂、营养计算、版本化修改、软删除／恢复，以及AI预览和网页登录确认。model.ts集中校验与换算，records.ts处理归属、事务、幂等和审计；meals-view.tsx／meals.module.css为摘要、趋势图、表格、食材库和编辑抽屉，meal-review.tsx为审核。

初始化一行一餐、整餐估算，具体食物写备注。以后具体食物与杂相加，杂只计剩余。数据关联user_id，未知null，网页、MCP、HTTP和导入共用规则；食材版本更新保留历史快照。规则与定位见[饮食记录](../../../docs/meals.md)。

