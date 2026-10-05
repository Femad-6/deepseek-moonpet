# 专注计时与休息提醒

在 MoonPet 设置中展开「专注计时」。默认工作 25 分钟、休息 5 分钟，可在未计时状态调整为 1–180 分钟。

- 开始工作：启动倒计时并记录工作时长。
- 暂停／继续：暂停的时间不计入工作。
- 结束：结束当前计时，保留已经工作的时间。
- 工作到期：记录完整这一轮，响铃并显示休息提示；点击「开始休息」后启动休息计时。休息不计入工作时长。
- 休息到期：提示可以开始下一轮，不自动启动下一轮。
- 试听：播放约 3 秒。停止提醒可立即结束声音并关闭提醒卡片。

今日与累计工作时间保存在 `~/.dsh/.dsh-moonpet-focus.json`，使用 Asia/Shanghai 日期统计。工作记录每 30 秒落盘，暂停、结束、到期和正常退出时也保存。窗口隐藏不暂停，完全退出应用会暂停；异常关闭后恢复为暂停，不补算应用关闭期间的时长。

## 提醒音

三种素材已下载并转换为单声道 PCM WAV，做了短淡入淡出和响度处理。正式提醒最长 20 秒。Windows 后端使用独立、隐藏的音频助手播放，避免 Chromium 隐藏页面计时节流影响响铃。系统静音或音量低时仍需用户调整系统音量；插件不会强行修改系统音量。

| 选项 | 原素材 | 作者 | 许可 |
|---|---|---|---|
| 响亮钟声 | [St. Paul’s bell-ringing practice](https://commons.wikimedia.org/wiki/File:St._Paul%E2%80%99s_bell-ringing_practice.oga)，截取 5–17 秒 | Tom Ackroyd | CC0 1.0 |
| 双音提示 | [Airplane Chime Sound Effect](https://commons.wikimedia.org/wiki/File:Airplane_Chime_Sound_Effect.ogg)，约 3 秒 | Sharelk | CC0 1.0 |
| 旋律风铃 | [Windglockenspiel.Koshi](https://commons.wikimedia.org/wiki/File:Windglockenspiel.Koshi.ogg)，截取 3–15 秒 | Membeth | CC0 1.0 |

详细下载 URL、SHA-256 与修改说明见 `assets/alerts/sources.json`。这些音频保留原有 CC0 身份，代码的 MIT 许可不替代音频的来源记录。

其他平台通过浏览器播放声音，可能受到浏览器自动播放政策限制；Windows 本地后端播放不依赖浏览器自动播放。无需模型调用或运行时联网。

## 验证与启动

计时引擎通过假时钟测试，覆盖到期只结算一次、暂停恢复、休息不计入工作、跨日统计、关闭恢复与损坏记录。浏览器测试验证开始、暂停、到期、开始休息、三秒试听及立即停止。

新增后端需要完全退出并重新打开 Harness 才能加载，仅刷新页面不足以加载后端。不要在正在运行重要任务时强制关闭应用。
