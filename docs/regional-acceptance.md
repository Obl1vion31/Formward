# 国服网页与海外后台验收

## 当前正式状态

唯一日常网页 https://43.142.148.58；原 https://formward-ten.vercel.app 和global.formward.top保留GPT／MCP、OAuth及海外图片后台，普通网页临时转到国服。上海formward_primary是唯一正式库，Neon继续停写，演练副本不参与正式写入。

应用141445b0474c0fa0723d243ad44bbd1ec94fb286，single-web-current-20261109，BUILD_ID C2tZf20bDMFuElnOE4wd1。上海standalone与海外Build Output同源构建；海外READY dpl_24PpPLF4KJeSZroWPnJijGKodMNQ、CLE1，两别名API均匹配。已合入身体实测版本及0035，未合入或推送main。后续测试和文档提交不改变该应用。

## 网页与连接

| 检查 | 实际结果 |
|---|---|
| 旧网页 | 首页、dashboard、饮食日期链接、账号与region均307到固定CN，保留合法路径／查询；no-store，不传Cookie／Authorization／正文 |
| 人工审核 | 身体、饮食、训练、混合URL共用CN目标；真实混合预览经匿名访问、网页登录、返回原预览和确认成功，原OAuth查询显示confirmed |
| 已有页面 | RSC／预取与POST不跨域重放；原始URL和全部查询参与签名，防止Next移除_rsc造成403 |
| 既有表单 | 当前上线46项Server Action标识、绑定加密密钥及旧静态文件保留；两个引擎实际填写旧页草稿、切换并保存成功 |
| 账号隔离 | 同一审核链接另一个账号404；伪造来源、修改签名查询及外部返回目标均拒绝 |
| 旧会话与令牌 | 隔离真实PostgreSQL、受信任CA及生产构建下，原Cookie／JWT／refresh保持账号、issuer、resource与连接编号 |
| 原GPT连接 | 正式发布后既有连接get_profile成功，对应原账号，无重新授权 |
| OAuth与MCP | 原issuer、授权／令牌地址、resource及JWKS保持；OAuth登录和同意页200，未授权MCP POST401，均不被网页跳转接管 |
| Garmin | 上海使用原加密连接换取令牌成功，每日及活动接口成功，activitiesComplete=true，连接active；只读检查不写健康事实 |
| 旧私有图片 | 通过海外图片后台读取原Blob600911字节，SHA与原附件一致 |
| 国内存储 | 私有COS虚构68字节PNG写入、回读与清理成功；未公开桶或旧图 |

Windows严格HTTPS公开请求全部通过；WSL直连公网IP超时记录保留，没有关闭TLS校验。Chrome实际从原Vercel首页进入后，地址变为https://43.142.148.58/，封面显示完成。

## 数据、配置与发布保护

发布前后以服务器本地postgres身份，在repeatable read／read only事务内核对完整库。54表、35条migration及全部列／约束／索引保持；健康、历史、审计、JWKS、会话与令牌表摘要无变化。仅public.oauth_connections和public.rate_limits有正常使用元数据变化；移除last_used_at后的OAuth安全摘要一致，其他表没有宽泛豁免。除FORMWARD_SINGLE_WEB之外的全部配置摘要一致，原认证与Garmin主密钥保持。

应用角色不能读取完整管理清单，首次保护步骤在切换前因42501停止；没有授予额外权限。修正为本地管理身份只读核对后通过。候选服务的失败状态清理后使用--collect重试；保留失败日志、归档SHA和原配置检查，上海新版本先在回环3201就绪，再原子切换3200。海外部署先READY并保持别名，再提升两别名。没有重新执行数据库迁移或创建正式虚构健康记录。

实际启用时间2026-11-09T15:41:04.276160Z，应用日志观察到15:47:42.228836Z，1条日志、匹配error／fatal／uncaught／unhandled为0。公开smoke请求和实际连接检查成功；Nginx没有收集完整访问历史，不把本次观测写成20分钟或全量5xx统计。

发布前私有COS备份已完整回读校验；正式备份、Garmin同步和IP证书timer保持active。当前应用回退保留body-observed-20261109与海外READY dpl_4fNL8bJcnQtaaTwVeMPfzXia4BUg，兼容0035，只切应用，不恢复旧Neon或旧估算数据。

## 自动化与视觉验收

571项单元／集成、lint、typecheck、同源production build通过。区域签名、正常／非法／重复／跨账号及安全返回测试包含在该检查中；严格TLS旧Cookie／JWT／刷新链路通过。

Chromium与WebKit各完成5组真实端到端检查；每个引擎保留12张截图和完整操作录屏。深色320×560、390×640、430×780、844×390、1100×850和1440×900；浅色320／390／430及1440检查审核内容、溢出、保存操作和登录返回，24张截图已逐张核看。D1／D4审核事实与统一保存、D6尺寸与实际交互、D7主题与共用行为、D8已授权发布均通过；D11草稿和失败保护保持。

本次改变入口和登录返回，不改页面布局或骨架。未重新执行全站慢网逐帧1px矩阵；原身体实测发布的加载证据保留于[完善验收](maintenance-verification.md)。原生手机、系统软键盘、屏幕阅读器、系统文字放大、自然证书续期、14天清理及长期跨境性能未测，不以模拟浏览器代替。

## 证据位置

- 本工作树.codex/single-web：两引擎报告、截图、视频、原Cookie／JWT／refresh日志、571项测试日志、action-compatibility.json、public-verification.json、gpt-existing-connection.json与Vercel别名结果。
- .codex/regional-releases/single-web-current-20261109：干净应用归档、manifest、构建日志与双端产物。
- 服务器/var/lib/formward/single-web-20261109：原配置副本、前后只读摘要、data-verification.json、installed.json、final-server-verification.json、checks/summary.json与失败诊断；全部位于私有目录。
- 可展示的公开入口截图：C:/Users/14878/.codex/visualizations/2026/11/09/formward-single-web/mainland-public-entry.png，不含健康数据或凭据。

## 主库建立与既有恢复证据

Neon最终只读源归档为PostgreSQL18.6、54表、2624行、33条migration；恢复到上海后全部行摘要、字段、约束、索引和序列一致，再执行0034图片存储位置迁移。0035身体实测退役的数据事务、实测保持和云端副本完整恢复另见[交接](../handoff.md)。既有/var/lib/formward/dual-cutover与backup-closeout-v1材料保留，不重复隔离旧源或覆盖新主库。

每日03:20自动原生与AES-GCM备份上传私有COS专用目录，完整回读校验后才成功；每日06:00 Garmin同步。0035后实际云端副本完整恢复验证54表／35 migration、有效约束和索引。远端备份没有自动删除权限，数据库备份不包含照片原件；运维和恢复边界见[部署说明](mainland-deployment.md)及[服务器查看指南](server-operations.md)。
