# AI 工具调用规则

GPT和豆包共用健康业务，常见任务使用三个较小入口；原有18项工具和OAuth连接继续兼容。模型负责听懂用户、核对缺失事实，服务器负责日期解析、份量换算、合并未改内容和重复保护。所有正式保存仍需用户在Formward网页确认。

## 按实际任务选择

| 用户要做什么 | 调用与处理 |
| --- | --- |
| 检查连接 | authorize_formward；只检查权限，不读取健康历史 |
| 看最近七天身体／饮食／消耗／训练 | 对应query工具，range=last7、view=summary；修改前再details |
| 看指定历史区间 | from/to与view；不能混用range。检查page.hasMore，按nextFrom继续 |
| 新增单餐 | preview_meal：日期、餐次、foods，营养平铺，服务器组织原预览 |
| 修改已保存餐次 | details取得meal.id/version及item.id，再preview_meal_changes，仅发改动 |
| 修正尚未确认的一餐 | previewId/revision，混合批次带key；更新原链接，不另添一条餐次 |
| 用户明确要求食材入库或改库规格 | search_foods后submit_meal_operation；普通记餐不自动入库 |
| 全天消耗／静息与活动分项／实际运动 | preview_energy；不经过包含身体与训练的大型混合定义 |
| 同一句包含身体、饮食、消耗等多个领域 | submit_record_operation，一份审核链接，不拆散 |
| 晨晚身体新增或修改 | 原submit_measurement_operation；只接收实测，日期、空腹、来源规则保持 |
| 模板、排期 | 原训练查询与预览工具；计划不等于实际训练，不自动产生消耗 |
| 查询是否保存 | 返回operationType=meal用get_meal_operation，为record用get_record_operation；只看状态可view=status |
| 照片 | 原import_meal_images保留成功附件；补图用append_pending_images，不重复上传成功项 |

## 默认营养估算与追问

GPT、HTTP与豆包共用`src/features/meals/ai-nutrition-guidance.json`。新增餐项默认估算热量及蛋白质／碳水／脂肪，不逐次询问是否需要估算。优先真实用户数值、匹配的本人食材和标签；自由项只有部分数值已知时保留原值，补估部分在basis单独说明，整项标estimated。用户明确只记录或确实无法合理估算时仍保留未知，服务器不会擅自补数。

操作顺序为先确认本次实际食量，再估算对应营养。只给食物名称而没有实际数量时，先集中追问数量、大小或实际吃下的比例，不调用单餐、局部修改或统一提交来创建预览；不能先填常见克数再让用户纠正。食材的每100克／每份规格和历史食量均不能证明本次吃了多少。已有毫升、个数或份数可作为实际食量，不强求克重。用户明确接受某个食量估算或明确保留未知后，才按对应amountDecision继续；basis中的估算声明不能代替用户接受。这是共用提示规则，现有接口仍不独立核验对话来源，也不增加额外的模型审核请求。

- “今天中午加个鸡蛋”：实际数量为1个，可用常见单个规格估算并说明大小不确定；不擅自推断水煮或煎炒。“中午”填写午餐，不能变成snack。表达加／补／追加食物时必须先查目标日details；唯一对应餐次局部添加，无匹配或明确另记一餐才新增，不重复建立午餐。
- 食物身份、实际食量、生熟／做法、油酱差异明显影响结果时，集中追问缺失的关键信息；常见单个食物未报克重不必先问是否估算。默认营养估算不代表用户接受食量估算，不能冒填estimate_accepted。
- 估算填写sourceKind=estimated及basis，区分实际食量、参考规格和假设，不伪造来源链接、标签或用户确认。明确0保持，未知不是0。
- 默认只作用于新增食物（含addFoods）；查询和仅改备注／日期等操作不重估历史。明确要求补估历史项时走局部修改预览，仍需网页确认。

共用规则更新后运行`node scripts/sync-ai-nutrition.mjs`生成豆包Skill及Manifest描述；`--check`用于检查漂移。新请求编号使用新UUID，只含ASCII字母数字及半角短横线(-)，8至120字符，不放宽原校验。更新平台测试资源后才会采用新版运行态Skill。GPT客户端需刷新工具定义／新对话；不撤销原连接、不扩大权限。

## 四种营养输入

数值使用十进制字符串，未知字段省略，明确零填"0"。来源sourceKind与数值是否已知分开：已知数值而来源不明可保留unknown；不能编造标签或估算依据。estimated必须说明basis，标签／成分表沿用依据校验。

| 用户提供的事实 | 食物输入 | 服务器处理 |
| --- | --- | --- |
| 吃两份，两份合计600kcal | quantity="2"，caloriesKcal="600"，省略nutritionBasis | 直接采用600，不再乘2 |
| 吃两份，每份300kcal | quantity="2"，nutritionBasis="per_portion"，caloriesKcal="300" | 原业务计算为600，保留每份原值 |
| 吃150g，每100g是200kcal | quantity="150"，unit="g"，nutritionBasis="per_reference"，referenceQuantity="100"，caloriesKcal="200" | 直接按150/100计算300，不先除成每克并舍入；依据保留原参考量 |
| 包装只有每份418.4kJ，吃一份 | quantity="1"，unit="份"，caloriesKj="418.4" | 换算100kcal；不能同时填caloriesKcal |
| 本人已有食材规格 | foodId、foodVersion、实际quantity/unit | 按真实规格或历史快照换算，不同时填营养 |
| 用户明确不估或确实无法合理估算，营养全未知 | 只提供名称与实际食量，省略四项营养 | 保持null，不填0，不自动用宏量反推热量 |
| 食量确实未知且用户明确保留 | amountDecision="unknown_accepted"，省略quantity | 保留未知；不能默认1份 |
| 用户接受食量估算 | amountDecision="estimate_accepted"及basis | 保留估算身份，不说成实测或用户确认的精确量 |

kind通常省略即food；misc仅是未单列的剩余食物，whole只能是整餐唯一项。食物总营养与每份营养的业务区别继续存在，由简单入口转换，不能为了缩短定义把它们混成一种。

每参考量输入会转为本次总量并保留文字计算依据。保存后再仅改变食量时，它按自由总量项处理，需要明确保持或同比缩放，不从说明文字猜测原始结构。

虚构示例：

```json
{
  "operationId": "fictional-lunch-001",
  "date": "yesterday",
  "timezone": "Asia/Shanghai",
  "mealType": "午餐",
  "foods": [{
    "name": "虚构包装食品",
    "quantity": "2",
    "unit": "份",
    "nutritionBasis": "per_portion",
    "caloriesKcal": "300",
    "proteinG": "0",
    "sourceKind": "label",
    "basis": "虚构包装转录：每份300kcal、蛋白质0g，其余未知。"
  }]
}
```

## 局部修改

省略字段保留原值；clearNotes清备注，updateFoods.clearFields明确清营养或依据。不能同时设置和清空同一字段。

| 情况 | 处理 |
| --- | --- |
| 只改备注、餐次或日期 | 其他餐项、照片与精度由服务器保留；改日不伪造新的准确发生时间 |
| 只改一项营养 | updateFoods定位指定食物，仅覆盖该项本次总营养，其余保留 |
| 库项／每份项只改食量 | 自动按原规格／每份值换算；库规格后来变更不改历史快照 |
| 自由总量项改食量 | 有已知营养时须明确quantityEffect=keep_total或scale_total；不能按模型猜测自动乘 |
| 自由项改变单位 | 没有可靠等价关系时不能同比缩放；提供新总营养或明确保持 |
| 添加／移除餐内食物 | addFoods／removeFoods；不能移除后留下空餐，整条删除只在网页 |
| 替换库项营养或身份 | 移除该餐项并添加正确的新食物，不改历史库快照 |
| 修改待确认预览 | 原授权、pending、有效期、父子revision均须匹配；更新AI修改账，人工审核记录不被冒充 |

已保存餐次修改产生新的待确认预览；修改待确认餐次会保留原链接。返回operationType和最新id/revision是下一步查询依据，不能把预览中的未来meal.id当成已经保存的餐次。

## 消耗与运动

全天总数用totalKcal；静息／活动分项用restingKcal、activeKcal，不能混填。只有已完成运动时只传activities，全天未知继续留空。没有手填活动合计时采用activities累计，不补人工0。

运动total采用原caloriesKcal；components只以exerciseActiveKcal纯运动部分计入，exerciseRestingKcal保留查看。included已包含、additional额外增加，只按用户事实表达；没有明确说明则留空，由网页核对，不能按数值大小猜。来源日总数不再叠加其中的运动。

修改日记录带dayId/dayVersion，运动带id/version；省略保留、null清空，0是已知。原版本、日期重复、来源保护、包含关系和改期规则继续由activities feature判断。

## 查询、分页和返回

query_meals只返回已保存餐次；day.status表示全天是否记全，不能当作本餐是否保存。待确认预览另查get_*_operation。summary用于分析，details用于明细与修改；旧调用不传view时保留原返回结构。新摘要不返回全部食材库、重复完整快照或与任务无关的原始历史。

新返回明确requested range及page：摘要每页最多366日，明细每页50日。hasMore=true时用nextFrom至原to继续，下一次仍按当前事实读取，不缓存旧健康数值。日历分页可能遇到空日，不能补0或声称这页以外没有记录。食材搜索仍保留最多100项的原规则，按名称继续缩小搜索。

身体只返回实测。新sevenDay按本页结束日及前六天统计，必要时读取区间前最多六日；它不是整个长区间的平均。旧analyses.summary仍为当前最新有效七日，scope=latest_available_seven_days明确区分。来源没有获得用户确认时仍需询问，不能因为查询到了历史来源就代填。

## 重试、错误和保存

- 新请求生成operationId；同一请求重试保持全部原参数，包括today／yesterday。服务器固定首次解释日期，跨零点不会换日。内容变化使用新标识。
- 修改请求也独立幂等；重复添加食物的同一请求不会再添加一次，也不再次增加审核版本。
- invalid_input／needs_input修正参数或问用户；版本、快照或审核变化先重读；过期重新预览；授权失败重新连接。request_conflict不能换标识盲目重放旧操作。
- 可重试的服务故障继续沿用原标识与内容。工具参数在平台派发前即解析失败时，服务器无法修正它，需核对实际调用和schema。
- pending与awaiting_web_confirmation均未保存。confirmed/completed还要检查saved／counts及逐项结果；取消或跳过不算保存。混合审核允许用户选择保存范围，不承诺所有条目都已保存。
- AI没有确认、整条删除、恢复或批量删除入口。预览到期以返回expiresAt为准，不能统一称为24小时。

## 验证边界

隔离测试覆盖新旧协议、原工具兼容、未知／0、计算口径、历史快照、部分修改、清空、原授权、版本、取消、过期与重试；实际Next产物和网页确认另外验收。全部使用虚构账号，不向正式账号写入测试健康记录。

新增工具保留旧定义，因此总工具定义可能变大；不据此宣称节省token、降低费用或提高模型首轮完成率。真实GPT和豆包模型分别测量，客户端缓存、工具选择、参数生成和最终网页保存不能互相代替。

常用入口对明确标签／成分表数值自动生成忠实转录，保留未知，不新增推断来源；已有basis或链接保持。新增消耗按totalKcal／activeKcal是否明确提供推导模式，包括明确0，不要求模型重复指定可确定字段；修改旧记录仍保留原模式。
