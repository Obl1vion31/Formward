# 食材查询

`GET` 以 Bearer 令牌验证账号，`q` 搜索个人食材的名称、品牌和做法，也用于匹配公共参考名称、别名和明确的规格条件。`queryFoods` 返回本账号有效规格 `foods`、最多 40 个公共候选 `referenceFoods` 和实时规则 `foodLibraryRules`。兼容字段 `presets` 保留为空数组。AI 引用公共规格须提交 `referenceFood` 的 `id`、`version` 与计件所用的 `portionId`，连同实际食量和单位由 meals feature 换算并经确认保存。
