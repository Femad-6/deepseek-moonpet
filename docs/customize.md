# 自定义 MoonPet

用户素材目录：`~/.dsh/dsh-moonpet/packs/<id>`。配置：`~/.dsh/.dsh-moonpet.json`。

```json
{
  "id": "my-character",
  "displayName": "我的角色",
  "defaultSprite": "idle.png"
}
```

把这个文件保存为角色包的 `pack.json`，图片放在 `sprites/`，再添加 README 中示例格式的 `pet.json`。素材与状态映射每次请求读取，刷新可更新图片；直接手改全局配置需要重启，因为运行中配置保存在内存。UI 设置实时生效。

| 状态 | 来源 |
|---|---|
| idle | 没有活动回合，或六秒终态提示结束 |
| thinking | `turn/start`，或所有工具结果已返回 |
| working | 一个或多个 `tool/call` 未匹配 `tool/result` |
| waiting | `approval/asked` 未匹配 `approval/decided` |
| done | `turn/end` 的 reason.kind 是 completed |
| error | reason.kind 是 error |
| stopped | 其他结束原因，包括 aborted / blocked |
| offline | 客户端无法轮询本地插件 |

等待审批优先于工作和思考。活动回合不会被别的会话的完成事件覆盖；tool 结果使用真实 Harness 的 `message.toolCallId` 配对。没有状态映射的普通角色包仍可作为普通挂件使用。

角色包的目录名就是 ID。用户包与内置包重名时整体覆盖，不会合并。图片支持 PNG、JPG、WebP、GIF、AVIF、BMP；动画 WebP/GIF 可作为素材，但本版默认 PNG 通过 CSS 添加轻微动作。

语音是可选功能，音频放在 `voices/`，台词放在 UTF-8 `script.csv`：

```csv
clip,chapter,speaker_jp,japanese,chinese,english,sec
hello,1,,,你好，今天一起完成任务吧。,Let's take one step at a time.,1.5
```

`hello` 对应 `hello.wav` 等文件名主干；台词语言只切换文本，不翻译音频。状态变化不会自动播放语音。内置包没有语音。

字幕选项支持中文、英文、日文；英文文本填写在 `english` 列。实际英语发音需要英语音频文件，修改字幕选项不会改变现有音频。

完整的 12 句三语励志字幕示例见 [motivational-subtitles.csv](motivational-subtitles.csv)。每个语言列应填写对应译文；不要把同一段英文重复填进中／日列，否则切换字幕仍会得到英文。只需日文字幕时，可以使用中文或英文语音包配合日文文本，不需要日文音频。

在 `ui/` 目录可以覆盖 `dialog.png`、`dialog.json`、`settings.png` 和 `click.wav`。设置面板专注常用功能，底图、透明度和对话框位置等细节通过文件配置。

新版面板将状态联动、大小、音量和语音自动播放放在常用区域；字幕语言、字幕大小和角色／语音包放在默认折叠的「字幕与资源」。播放顺序继续使用现有配置，默认洗牌。

`pricingFile` 可指向自定义价格 JSON。内置费率是历史快照，金额仅作为估算；实际扣费以供应商账单为准。
