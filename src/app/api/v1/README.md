# v1

身体记录 AI API 入口，Bearer 鉴权后调用 feature；接口不包含 SQL 或独立业务规则。

维护时同步接口文档与隔离测试，新业务规则留在 feature。

饮食增加foods、meals与meal-operations，沿用Bearer鉴权及64KiB限制。公开OpenAPI1.4.0同时包含身体与饮食，确认只由网页Action执行。
