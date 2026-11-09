# 单一国服网页与上海主库

## 当前部署

日常网页为[国服](https://43.142.148.58)，原GPT／MCP、OAuth与海外图片后台继续由Vercel承担，正式数据统一写入上海。国服应用688081179e63f10f0e5e2e12400cd392c4894572，发布garmin-regions-current-20261110，BUILD_ID -7gprMm9zSgOPO2Tv7euh；已合入并推送main，保留workspace-flow-final的界面与0036。正式库55表、36条migration，本轮没有新增表或migration。

Garmin已启用personal：有效登录账号从“账号菜单 → 外部接入 → 设备与数据来源”选择中国站／国际站，填写本人密钥并同步。旧v1连接仍按国际站读取且密文不变；明确换站创建独立连接并保留历史。仅调整FORMWARD_DATA_SOURCE_ACCESS，原Garmin与OAuth安全摘要及其他私有配置保持，Neon继续停写。

578项测试、lint、typecheck、干净构建，以及最终standalone双引擎各8组／19图通过，慢查询最大布局偏差0px；线上双端已核看。原GPT连接及Garmin国际站真实只读读取成功；中国站网络可达，缺少真实中国站密钥，完整认证仅用隔离响应验证。真实手机与系统键盘未测。发布、备份、原数据核对、观察窗口、截图及兼容恢复边界见[部署](deployment.md)和[验收](regional-acceptance.md)。


海外后台沿用工作区基线的READY dpl_5Q1VAQn5XMDfJJsNTFhmuG4RELgp、CLE1，两正式别名保持；本轮没有执行海外发布。0036此前以独立管理身份添加提醒忽略表，应用仅保留必要读取／插入权限。工作区加载、助手及严格TLS旧页保存的保留证据见[维护验收](maintenance-verification.md)。

## 入口与职责

| 部件 | 当前职责 |
|---|---|
| 上海公网IP | 唯一日常网页、业务与账号校验、正式记录和PostgreSQL主库 |
| Vercel原域名 | 保留原GPT／MCP及OAuth地址，签名回源上海；处理海外照片下载、私有Blob读取及OAuth客户端资料获取 |
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
