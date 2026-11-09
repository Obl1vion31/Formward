# 公网 IP 入口与隔离演示库

## 当前入口

[https://43.142.148.58](https://43.142.148.58)是唯一日常网页，正式记录保存在上海formward_primary。Vercel只保留GPT／MCP、OAuth和海外图片后台；普通旧网页自动转国服。原演示服务formward-ip-preview.service已经停止并禁用，formward_ip_preview数据库、虚构账号和备份保留，演示账号不能用于正式站。当前服务、权限、备份与运维见[国服与海外后台](mainland-deployment.md)和[服务器查看指南](server-operations.md)。

## 隔离边界

原演示账号ip-preview@example.test与正式账号独立，初始化夹具与验收记录均为虚构数据；其凭据仍仅存于服务器私有配置和本机被忽略目录，不写入文档或public。原formward_preview私有环境保持，不与正式主库混用。需要重新进行演示时使用私有回环入口，不能替换当前公网正式站点。

## 保留的隔离演示产物

- 发布目录：`/srv/formward-ip-preview/releases/ip-preview-b0155db-20261109/app`，`current` 指向当前发布。
- 服务：`formward-ip-preview.service`，独立系统用户 `formward-ip`，Node.js 24.21.0，仅监听 `127.0.0.1:3100`。
- Nginx：`/etc/nginx/sites-available/formward-ip-preview.conf`，为停用的演示站点配置；当前已被formward-primary.conf替代。
- 配置：`/etc/formward/ip-preview/app.env`，仅根用户可读；认证密钥与数据库口令独立生成。
- 应用角色 `formward_ip_preview_app` 获得测试库日常读写权限；迁移角色 `formward_ip_preview_migrator` 执行既有 Drizzle migrations。专用 HBA 规则拒绝这两个角色连接其他数据库，数据库继续仅监听回环地址。
- 源提交：`b0155db236a636ee45965555eefe9b66f9c8b7e6`；页面版本：`ip-preview-b0155db-20261109`；构建标识：`FwDebefP5Hpfj-uHre695`。
- 发布包 SHA-256：`16baf31bc8d7e9480349397fbd33115202730053e594f2aca20073c53b58c2fd`。归档、安装脚本与临时账号文件收回 `/var/lib/formward/ip-preview/uploads` 根用户私有目录。

仅在构建时设置 `FORMWARD_STANDALONE=1` 才启用 Next.js standalone，默认 Vercel 构建保持。发布包包含 standalone、public、静态构建文件、既有 drizzle 文件与打包后的初始化器；不含环境文件或密码。`scripts/prepare-ip-preview.mts` 仅允许本机指定测试库和虚构邮箱；已有测试账号与记录不重置。不从区域原型库导入迁移账本，不复制正式用户数据。

## 继续使用的公网IP证书

已安装的 acme.sh 通过 Let's Encrypt shortlived profile 签发 IP 证书，SAN 为 43.142.148.58，初次证书有效期至 2026-11-15 11:48:45 UTC。`formward-ip-certificate-renew.timer` 每六小时检查续期，独立使用 `/var/lib/formward/acme-ip-preview`；证书安装回调先检查 Nginx 再重载。原域名证书配置保持。


## 演示库备份

原formward-ip-preview-backup工具仅备份独立演示库到/var/backups/formward-ip-preview，文件仅root可读；不属于当前正式主库备份。正式库使用formward-primary-backup.timer，已完成实际备份及完整恢复验收，结果见[双入口验收](regional-acceptance.md)。保留演示库不代表公网IP仍接收演示数据，也不能用它的恢复结果代替正式库。
