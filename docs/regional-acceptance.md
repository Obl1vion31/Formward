# 国服网页与海外后台验收

## 当前正式状态

日常网页为[国服](https://43.142.148.58)，应用版本`dual-entry-2583580b-chart-return-final-20261110`，构建源码`2583580bdeb1af62e9dc770369dd978ba15c55c0`，BUILD_ID `7qKmpqveL87PoHSOFLJHU`，发布目录`chart-return-final-20261110`；已合入并推送main。上海`formward_primary`仍为55表、36条migration，本轮没有数据库、公开接口或业务计算变更。

晨间、晨晚与体脂采用同一绘图外壳。日期轴为MM.DD、最多4个含首尾的等距刻度；完整日期YYYY.MM.DD，范围MM.DD—MM.DD，跨年显示年份。开启晚间只增加真实系列，缺测保持断线；桌面选中读数位置固定，手机保留顶部读数。完整图的线宽和点径按实际屏幕尺寸保持一致。

返回总览由持久工作区立即显示原布局外壳，先恢复滚动及横滑位置，再进行一次约300ms回缩；准备期保留原图，浮层可见后交接。总览具有独立加载边界，真实数据原位接管。指标、区间或数据变化后正常返回，取消、迟到响应及快速反向共用清理。

Garmin personal、中国站／国际站、旧v1连接、原GPT授权及Blob／COS沿用既有逻辑；配置与OAuth安全摘要校验保持。Vercel继续承担原GPT／MCP、OAuth和海外图片后台，Neon停写。原47项Server Action、绑定加密密钥及234项旧静态资源保留；上一应用`garmin-regions-current-20261110`保留供兼容回退，保留用户合法更新。

579项单元／集成、lint、typecheck和干净production build通过。最终应用的Chromium完整186次往返、24组身体图表检查通过，正常热返回最慢13.2ms启动；WebKit另24组日期、点选、外框及实际笔触检查通过。公共布局实现的双引擎128组四页慢加载最大偏差0.328125px，最终包另32组身体页慢加载偏差0px；失败恢复、重复返回及草稿保护5项通过。

WebKit Linux的完整连续动效采样未通过：部分样本未采到可见回程帧，GTK后端还出现稳定性等待超时；原因未确定，失败原件保留，不计为动效通过。上述WebKit布局与图表专项通过不能代替该项。物理iPhone／Android帧率、系统键盘和真实系统文字放大未测。

## 本轮实际发布核对

发布前备份`formward-primary-20261110T095704321214Z.dump.json`已加密异机回读校验。候选3201就绪后切换3200，2525项产物文件逐项验证；2415项相同文件复用，110项变化文件差量传输。应用构建源码仍为2583580，主线同时合入0f831ea的公开域名校验文件及README；release manifest单独记录staticSourceCommit，编译应用文件与浏览器验收产物一致。

正式库结构、事实及配置摘要前后无差异，OAuth安全摘要保持；应用、Nginx、PostgreSQL及相关timer为active。两个入口版本一致，原OAuth issuer／MCP resource保持；匿名MCP POST返回401，普通海外网页307到国服，原协议HTML／CSS匿名200且SHA与源码一致。本轮没有重发Vercel网关，域名校验的平台进度见[豆包资料](doubao-onboarding.md)。

应用journal观察窗为`2026-11-10T10:01:45.900827+00:00`至`2026-11-10T10:04:51.946343+00:00`，11条消息、匹配错误0条；仅为实际短窗口，不代表长期或全量5xx统计。未创建正式虚构健康记录。

私有证据位于workspace-flow工作树的`.codex/chart-final-motion`、`chart-final-body`、`chart-verified-loading`、`chart-final-body-loading`、`chart-final-edges`及`chart-release`，服务器档案为`/var/lib/formward/chart-return-final-20261110`。可展示截图和往返录像位于`C:/Users/14878/.codex/visualizations/2026/11/10/formward-chart-return`，数据为隔离虚构样本；截图与录像已人工核看，采样不冒充真机帧率。

## 保留的入口与图片验证

单一国服入口继续沿用已验证的规则：旧普通网页307到固定CN，保留合法路径／查询且不转交Cookie、Authorization或正文；RSC及POST沿原签名链路返回，完整查询参与证明，不能忽略业务参数。AI身体、饮食、训练和混合审核使用国服URL，未登录后返回原预览。上海检查本人会话或Bearer、账号及权限；海外网关没有数据库或认证签名密钥。

2026-11-09已用严格信任测试CA和独立真实PostgreSQL验证原Cookie／JWT／refresh、匿名登录返回、真实确认、跨账号404及旧页草稿保存；旧私有Blob600911字节SHA、COS虚构68字节PNG写／读／清理通过。本次没有修改这些协议、图片逻辑或海外部署，不重复声称全部图片及OAuth写入流程已重新执行。旧证据为.codex/single-web及服务器/var/lib/formward/single-web-20261109。

## 工作区基线保留证据

0f3434d的workspace-flow-final先完成0036：仅新增assistant_reminder_dismissals，旧结构、事实、来源、审计与OAuth安全摘要保持。首次使用运行账号迁移因无CREATE权限在切换前停止，随后由独立数据库管理身份执行，应用仅获新表所需权限；未创建正式虚构账号或健康测试记录。该过程不会在本轮重复执行。

工作区双引擎各80组加载、各17组助手、三类卡片及19组原生库流程和TLS旧页保存仍包含于当前应用；详细问题、失败诊断及证据见[维护验收](maintenance-verification.md)。该基线在UTC 2026-11-09T19:35:37.597208+00:00—19:39:39.085899+00:00应用journal匹配错误0，海外Runtime／fatal与HTTP5xx查询无记录且无排除／后续分页，国服access log关闭，不声称全量历史为0。该基线的海外READY为dpl_5Q1VAQn5XMDfJJsNTFhmuG4RELgp；后续公开静态文件发布见[豆包资料](doubao-onboarding.md)，本轮仅更新上海应用。

## 恢复与未测边界

应用恢复必须兼容0036和v2区域凭据；不能在新区域连接已保存后直接启用只识别v1的旧应用。只修复／替换应用，不回退正式数据、用户新增记录、撤销状态或已完成migration。备份恢复先进入全新隔离库验证，备份不包含Blob／COS原图。

真实中国站密钥、多人正式Garmin联网、物理iPhone／Android、系统软键盘、屏幕阅读器及长期跨境性能未测。匿名中国站400只证明当前网络请求能抵达接口；模拟响应不证明真实授权成功。短日志窗口不等于长期无错或完整5xx统计。
