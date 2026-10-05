# 隐私与网络请求

状态联动不发送模型请求，不上传会话内容，不读取或改变审批决定。只观察 Host 的 session/event，并通过本地 `/dsh-moonpet/api/turn` 向挂件提供状态和图片元数据。页面隐藏时暂停轮询。

启用插件后，原有可选账务展示会尝试通过 Harness credentials 服务获取已有 DeepSeek 凭据。没有凭据时显示不可用，宠物仍正常运行。

- 使用 `DEEPSEEK_API_KEY` 时，余额查询发送到 `https://api.deepseek.com/user/balance`。
- 配置有 `DEEPSEEK_PLATFORM_TOKEN` 时，usage 查询发送到 `https://platform.deepseek.com/api/v0/usage/by_api_key/amount`。
- 不会把上述凭据写进插件配置、打包产物或 Git 仓库。
- 本地 token／估算金额汇总保存在 `.dsh-moonpet-usage.json`。它不是供应商账单。

默认包没有角色语音、外链图片或遥测服务。安装插件或检查更新时，Harness 的包管理功能可能访问安装源，这不是 MoonPet 的状态轮询。
