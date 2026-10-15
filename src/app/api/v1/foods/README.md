# 食材查询

GET以Bearer令牌验证账号，q搜索食材名称、品牌和做法。通过 queryFoods 返回本账号有效规格 foods、只读基础食材 presets 和实时 foodLibraryRules；采用预设仍须生成草稿并确认，业务调用meals feature。
