# 单一国服网页与上海主库

## 公开协议

原域名现直接提供[隐私政策](https://formward-ten.vercel.app/privacy.html)和[服务条款](https://formward-ten.vercel.app/terms.html)，生效日期2026年11月10日。两页及legal.css通过Build Output静态文件优先提供，匿名200，无跳转或Cookie；不转至国服登录，也不调用健康API。该发布只新增三份静态文件，253个原文件及网关不变，未重发下方国服应用或改变数据库／授权配置。具体部署与证据见[公开协议资料](doubao-onboarding.md)。

## 当前部署

日常网页为[国服](https://43.142.148.58)，当前应用 `dual-entry-0f5c7e24-doubao-mcp-request-20261110`，源码0f5c7e24，BUILD_ID `a-cKXvLOUnAhAig-m7rcY`，目录 `doubao-mcp-request-20261110`。上海仍为55表、36条migration，原GPT、Garmin、图片及身体图表／骨架基线保持。原47项Server Action、加密密钥与282项旧静态资源保留；上一豆包应用和骨架应用均保留作兼容回退。

海外READY `dpl_DR2jkfpiv7qzxydBP4DVjcVhr9V5`，网关源码74754129，保留257项静态文件与路由并增加有界错误元数据诊断。两个海外别名、公网三入口版本、新旧豆包MCP发现及原GPT实际连接已核对。豆包域名与白名单生效、测试版云构建成功，真实手机登录与健康查询仍待本人授权验证；故障恢复与准确验证范围见[部署](deployment.md)和[豆包接入](doubao-onboarding.md)。

## 保留的浅色骨架验收

以下为已包含在当前应用中的浅色骨架基线，原构建为04d25b30／`skeleton-contrast-20261110`，不代表当前应用版本。

浅色占位使用#D6D0C4暖灰底与90%暖白扫光，数字、卡片及图形占位共用骨架色。扫光保持1.6秒从左向右，底色与光层继续由同一圆角容器裁切。深色沿用原灰底和米色光；减少动态效果时静止显示。固定标题、图例及操作从首帧显示，真实数据原位接管。

579项单元／集成、lint、typecheck及干净production build通过。最终产物在Chromium和WebKit各20组五页面深浅主题慢加载检查通过，覆盖390×640与1440×900，固定槽位最大偏差0px；320／390／430／1440另作6组实际页面像素对照，浅色扫光中心与底色的亮度比约1.02升至1.45，深色取样点保持一致。真实扫光连续播放、数据接管及减少动态效果检查通过。

身体晨晚／体脂共用日期轴、居中图表和返回交接继续保留；Garmin双站点、原GPT授权及Blob／COS沿用既有逻辑。47项Server Action、原绑定密钥与238项旧静态资源保留，上一应用`chart-return-final-20261110`保留供兼容回退。原数据、结构、配置与OAuth安全摘要前后校验无差异。

两入口版本及新版CSS公网SHA核对通过，原OAuth issuer／MCP resource保持，匿名MCP POST为401，原协议HTML／CSS匿名200且SHA一致；本轮未重发Vercel网关。此前WebKit完整连续图形转场的未通过样本仍保留，本次骨架加载检查不代表该问题已解决；物理手机帧率及系统键盘未测。详细证据见[维护验收](maintenance-verification.md)。

## 入口与职责

| 部件 | 当前职责 |
|---|---|
| 上海公网IP | 唯一日常网页、业务与账号校验、正式记录和PostgreSQL主库 |
| Vercel原域名 | 保留原GPT／MCP及OAuth地址，签名回源上海；处理海外照片下载、私有Blob读取及OAuth客户端资料获取 |
| global.formward.top | 同一海外网关的已验证别名，过渡承接豆包request、WebView及独立登录；普通网页仍转国服 |
| 上海PostgreSQL | 唯一权威数据库，应用与迁移角色分离，只监听回环地址，不公开5432 |
| Blob／COS | GPT附件在海外后台处理并保存在私有Blob；国服网页新上传使用私有上海COS，旧图保留原位置 |
| Neon | 停写的旧数据源，仅保留恢复材料，不再接收正式新增记录 |

国服当前使用有效HTTPS公网IP证书。global.formward.top是海外后台别名；CLE1通过有效HTTPS回源公网IP。origin.formward.top已配A记录与证书，当前不承担回源。根域与www未启用；未来更换网页域名时单独更新CN来源，不改变既有OAuth issuer或MCP resource。

## 连接与草稿保持

- BETTER_AUTH_URL、OAuth issuer、MCP resource、JWKS、原Better Auth secret、账号accessVersion、会话、刷新令牌和授权保持。原GPT连接已在线get_profile验证，无需重连。
- 两个域的host-only Secure Cookie继续隔离。网页跳转不转交Cookie、Authorization或请求正文；国服使用本人在国服的会话，首次进入可正常登录。
- 切换前已打开页面的RSC读取、预取及POST保存继续原路径；不跨域重放写入。保留当前上线版本47项Server Action标识、绑定参数加密密钥与旧静态资源，已用真实旧页草稿保存验证。
- Next proxy保留原始URL及RSC头，服务证明绑定完整路径与全部查询。不能为修复框架归一化而忽略业务查询或放宽签名。
- Garmin原连接编号、密文、AES-GCM主密钥、来源事实及人工保护保持；上海只读网络检查验证换取令牌、每日和活动接口成功。
- 海外网关不包含数据库驱动、数据库凭据或认证签名密钥。上海重新检查Cookie／Bearer、账号和权限。公网IP同一HTTPS入口区分国服直达与已签名回源，伪造身份头不能提升来源。

## 应用发布与恢复

1. 从最新已发布应用合入当前授权变更，保留其他上线功能；从同一干净提交生成两端产物并绑定锁文件、migration摘要、BUILD_ID和协议。
2. 完成隔离测试、必要浏览器验收和实际异机备份校验。只读核对完整库时使用服务器本地管理身份，不扩大应用角色权限。
3. 在私有回环端口检查新应用与正式库身份，验证当前版本表单兼容；原子切换上海应用；海外协议未变时保留原部署，仅网关变更时更新海外别名。恢复版本同时兼容当前schema及凭据格式。
4. 验证原GPT、Garmin、私有图片、网页跳转和登录返回；比较发布前后结构、业务、审计、授权及配置。正常使用时间与限流元数据单独核对，不笼统豁免健康表。
5. 保留切换前workspace-flow-final-20261110供审计与无v2连接时的紧急退回；已有v2区域凭据时不能直接启用只识别v1的旧应用。采用兼容0036及v2的修复产物，保留用户新增记录，不恢复旧估算能力或旧Neon快照。

数据库灾难恢复须另行停写并保全新增记录与撤销状态；先将最新加密归档恢复到隔离库完整核对，再制定正式恢复方案。已完成的0034／0035／0036不重复执行，不修改已发布migration。

## 图片、备份与维护

数据库只保存图片归属与引用，不含原件。旧Blob经海外工作节点私有读取；本次600911字节旧图SHA与原附件一致。上海COS虚构68字节PNG写入、回读及清理通过，桶保持私有，没有新增永久Blob静态密钥。

每日03:20备份正式库，生成原生归档与AES-256-GCM副本，再上传私有上海COS的database-backups/formward-primary/v1/目录；完整回读及SHA一致才成功。失败保留本机文件，每5分钟重试，1小时最多3次。本机匹配日备份保留14天，远端暂不自动删除。授权仅为该备份目录PutObject／GetObject／HeadObject，不含远端删除或密钥上传。

原生与加密备份位于/var/backups/formward-primary，root0700；密钥独立root0600并另有用户电脑私有副本。0035后的实际云端副本已完整恢复至隔离库验证54表、35条migration及有效约束，详见[交接](../handoff.md)。备份不含Blob／COS原图；每日自动校验归档和云端回读，不等于每日自动完整恢复。

每日06:00 Garmin同步、主库备份与IP证书续期timer均保持active。IP续期每6小时检查，配置3天续期间隔；自然续证、14天清理与长期跨境性能仍按完整周期观察。资源、网络与可视化数据库方法见[服务器查看指南](server-operations.md)，本次实际证据和边界见[验收记录](regional-acceptance.md)。

工具与配置见[维护工具](../scripts/self-hosting/README.md)，隔离演示环境见[IP入口](ip-preview.md)。公开/_next/static/资源在清除外来身份头后允许无Host内部读取，业务来源、授权及健康接口检查继续有效。
