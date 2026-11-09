# 双入口与上海主库验收

## 当前正式状态

国服 https://43.142.148.58 与国际 https://formward-ten.vercel.app 共用上海 formward_primary。2026年11月9日19:25:25（上海时间）开放写入，Neon旧服务凭据已失效并保持停写。开发与演练副本不参与正式写入。

应用提交3d57f4b762881c7a92ba2cb28bc0cdc3ee0942d9，发布dual-entry-static-20261109，BUILD_ID hg_j1Z9SuUZbEVNJlHYvQ。上海standalone与国际Build Output来自同一干净提交。国际READY部署dpl_FFBeba8ftG5Wdx8qnhSF44EGtJC9，运行区域cle1；原Vercel域与global.formward.top的实际别名API均指向此部署。未合入或推送main。

## 数据与授权

| 检查 | 实际结果 |
|---|---|
| 最终源归档 | PostgreSQL18.6、54表、2624行、33条migration；原生归档完整恢复通过 |
| 原生恢复对照 | 行摘要、列、约束、索引、序列及数据库编码逐项零差异 |
| 0034 | 只增加图片存储提供方／位置及迁移账本一行；54表、34条migration，原业务与授权摘要零差异 |
| 密钥 | 原Better Auth secret、JWKS私钥、Garmin主密钥保持；既有密文解密通过 |
| 旧GPT连接 | 切换及最终发布后get_profile均成功，同一账号，无重新授权 |
| 旧网页会话 | 原国际站已登录页面刷新后可读；国服独立Cookie，首次用原账号登录 |
| Garmin | 原连接保持active；上海换令牌、每日和活动API成功，正式同步service实际成功 |
| 数据库权限 | 仅回环5432，APP角色仅日常DML，迁移与APP角色分离；应用零行写入事务回滚验证通过 |

长时间跨境导出的收尾连接失败后，完成的原生归档保持不变。源库隔离期间重新用只读事务生成全量摘要，恢复库严格核对通过后才执行0034和正式开放。源端摘要采用与逐行UTF-8长度前缀SHA-256相同的SQL计算，并独立验证算法等价；0034后的本机逐行校验再次零差异。未通过改写健康数据消除差异。

## 网页与图片

两入口版本API均200并返回dual-entry-3d57f4b7-dual-entry-static-20261109；原OAuth issuer及端点保持。实际国服登录封面、进入表单和原国际网页可用。Next图片优化器内部读取公开构建资源时不带Host，已允许 /_next/static/ 在清除外来身份头后正常读取；业务、OAuth和健康接口的来源检查保持。实际优化图响应200、123359字节，三张封面图片解码正常。

最终国际部署的私有Blob旧照片读取600911字节，SHA与原附件相同；上海COS虚构68字节PNG写／读／删成功。GPT原图下载仍在海外工作节点执行，上海只登记归属、摘要和附件引用；国内新上传使用私有COS。没有迁移或公开旧照片原件，没有新增永久Blob静态密钥。

## 备份与运维

每日03:20（上海时间）的正式库备份和06:00 Garmin同步timer均已启用，对应service实际执行成功。日备份生成原生归档、目录校验和AES-256-GCM副本，随后自动上传到既有私有上海COS的database-backups/formward-primary/v1/目录；完整回读、密文SHA一致后才报告成功。网络失败保留本机文件，每5分钟重试，1小时最多3次。匹配命名的本机日备份保留14天，远端对象暂不自动删除。

备份使用原服务器存储子账号，用户明确批准后只为专用备份目录增加PutObject／GetObject／HeadObject。桶的私有ACL和照片目录权限保持，没有授予备份删除权限或上传密钥、明文。实际同名重试复用成功，匿名下载真实备份返回403。

实际systemd日任务生成的formward-primary-20261109T122918474144Z.dump.aesgcm为997366字节。2026年11月9日20:34:52（上海时间）从COS重新下载、认证解密及原生归档SHA核对通过，并完整恢复到独立formward_rehearsal_cos_backup_20261109：54表、34条migration，未验证约束和无效索引均0；正式主库未改动。首次恢复因postgres不能读取root私有文件而失败，已改为root读取pg_restore并将SQL流送入隔离库，不放宽归档权限；失败证据仍保留。每日作业只自动校验归档及云端完整回读，不宣称每天自动完整恢复。

服务器原生与加密文件在/var/backups/formward-primary（root 0700），密钥独立保存在root 0600文件，并有用户电脑受限目录中的独立密钥副本。先前997186字节的电脑离线副本也已认证解密并核对SHA。数据库备份不包含Blob／COS图片原件。授权保存后再次验证旧Blob600911字节SHA一致及虚构COS图片68字节写／读／删通过。

IP证书续期timer每6小时检查并处于active，续期间隔配置3天；已核对下一次计划早于证书到期。自然到期续证、14天保留清理及跨境运营商长期性能尚未经过完整周期；这与已通过的本次异机恢复演练分开记录。CPU、内存、网络与只读表结构入口见[服务器查看指南](server-operations.md)。

## 技术检查与边界

608项单元／集成、lint、typecheck和同源production build通过。原生HTTP传输4项、旧Cookie／JWT／refresh／CIMD及并发隔离7项真实HTTP验证通过，原生数据库恢复工具7项及加密篡改／覆盖保护验证通过。新静态资源回归同时验证无Host读取、外来身份头清理、业务来源拒绝及维护状态。

备份运维代码20e4ab3b0dd39cd63960a05d6595c6d829d9d684已独立安装到服务器，不改变上述应用构建。新增COS备份工具8项测试、lint、typecheck与Python语法检查通过；上传包摘要、systemd配置及实际服务成功均已核对，无新增依赖、数据库表或migration。

本轮线上检查不向真实饮食、身体或训练写入虚构记录；业务写入及账号隔离使用已有隔离测试，线上实际写入为正常Garmin同步与认证使用元数据。本轮未重做全套Chromium／WebKit界面矩阵，真实手机和系统键盘未测，不以桌面截图冒充真机验收。

私有证据：服务器/var/lib/formward/dual-cutover/final-data、final-status.json、activation-status.json、static-installed.json、postcutover-final-20261109，以及backup-closeout-v1中的installed.json、restore-status.json、closeout-status.json、photo-regression；本工作区.codex/dual-cutover及.codex/regional-releases/dual-entry-static-20261109。公开首屏与监控截图位于用户Windows临时目录formward-ip-preview，健康截图、备份、凭据和临时图片地址不放入public、Git或部署包。
