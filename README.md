# MoonPet（月伴）

**跟着 DeepSeek Harness 一起思考、工作和休息的状态宠物。**

MoonPet is a local companion plugin for DeepSeek Harness. It reacts to real session events with character sprites, subtle motion, and short status labels. It makes no model calls and never approves tools for you.

| 待机 | 思考 | 招手提醒 |
|---|---|---|
| ![待机](assets/packs/moon/sprites/idle.png) | ![思考](assets/packs/moon/sprites/thinking.png) | ![招手](assets/packs/moon/sprites/wave.png) |

## 功能

- 回合开始 → 思考立绘；工具执行 → 轻微摆动；等待审批 → 招手提醒。
- 完成 → 短暂跳动；失败或中断 → 降低饱和度；约六秒后恢复待机。
- 多个聊天或子代理同时工作时聚合状态，等待审批优先；同时显示任务数量。
- 拖动定位、立绘缩放、状态宠物开关，尊重系统减少动态效果设置。
- 番茄钟：默认工作 25／休息 5 分钟，开始、暂停、继续、结束，记录今日与累计工作时间；到期弹出提醒并响铃，可选三种已下载的提醒音。
- 可添加自己的角色包、台词和语音；默认包只有三张立绘，不附带角色语音。
- 可选余额、token 和花费展示。花费依据内置历史费率估算，可自行覆盖；不替代供应商账单。

状态变化静音。点击角色仍可播放你自己的语音；没有语音时显示余额页。动作是 CSS 呼吸、摆动和跳动，图片是静态立绘。

番茄钟单独提醒，默认不自动开始或自动循环。Windows 提醒音由后端调用隐藏的 PowerShell 音频助手播放，窗口隐藏时仍可响铃；试听约 3 秒、正式提醒最长 20 秒，可随时停止，不改变系统音量。正常退出应用会暂停；异常退出最多丢失最后 30 秒未落盘的计时，不把关闭应用后的时间算作工作。详见 [番茄钟](docs/focus.md)。

## 安装

需要已安装且支持组合包插件的 DeepSeek Harness Desktop 或 Web。状态宠物不要求 API key；余额功能可使用 Harness 中已有的 DeepSeek 凭据。

1. 从 [最新 Release](https://github.com/Femad-6/deepseek-moonpet/releases/latest) 下载 `dsh-moonpet-0.1.0.tgz`。
2. 在 Harness 的 **插件 → 添加插件** 中输入下载文件的绝对路径，完成安装并启用。
3. 完全退出再打开 Harness。Windows 需要从系统托盘退出；关闭窗口通常只是隐藏。

也可以在支持此命令的 Harness CLI 中按本地文件安装：

```powershell
dsh plugin --profile desktop add C:\Downloads\dsh-moonpet-0.1.0.tgz
```

Web 用户使用 `--profile web`。**尚未发布 npm；不要用裸包名从 npm 安装。** 安装成功后，在宠物右上角的月亮按钮里可以调整位置、缩放和「状态宠物」开关。

也可以在插件安装输入框中填写安装包链接：

```text
https://github.com/Femad-6/deepseek-moonpet/releases/latest/download/dsh-moonpet-0.1.0.tgz
```

### 可选的中文／英文励志语音

Release 另提供 [moonpet-multilingual-voices.zip](https://github.com/Femad-6/deepseek-moonpet/releases/latest/download/moonpet-multilingual-voices.zip)。解压后，将 `english-boost` 和 `chinese-boost` 两个目录复制到 `~/.dsh/dsh-moonpet/packs/`，刷新页面，在「字幕与资源 → 语音包」选择。

每个包有 12 句短语和完整中／英／日三语字幕。英文为 Microsoft Zira 美式女声，中文为 Microsoft Huihui 普通话女声，均为本地系统语音合成；不附带日文音频。字幕语言与发音可以独立选择。

旧版 `dsh-gal` 与 MoonPet 是两个独立插件；建议使用 MoonPet 时关闭旧插件，避免两个挂件同时出现。新插件不会自动读取或改写旧插件配置。

## 自定义角色

把自己的角色包放入：

```text
~/.dsh/dsh-moonpet/packs/my-character/
├── sprites/         # PNG、WebP、GIF 等立绘
├── voices/          # 可选，你拥有使用权的音频
├── pack.json        # 名称和默认立绘
└── pet.json         # 状态 → 文件名
```

`pet.json` 示例：

```json
{
  "sprites": {
    "idle": "idle.png",
    "thinking": "thinking.png",
    "working": "thinking.png",
    "waiting": "wave.png",
    "done": "wave.png",
    "error": "thinking.png",
    "stopped": "idle.png",
    "offline": "idle.png"
  }
}
```

同名用户包会整体覆盖内置包；希望保留内置角色时，使用不同目录名。缺失的状态图片回退到待机／默认立绘。详见 [自定义与状态事件](docs/customize.md)。

## 隐私与边界

宠物联动只在本机观察 Harness 已加载聊天的事件，不上传聊天，不新增模型调用，不修改审批结果。状态不是“当前页面专属”，而是聚合已加载会话。通用等待输入、任意后台程序状态不在本版本范围内。

配置和本地 usage 账本分别保存在 `~/.dsh/.dsh-moonpet.json` 与 `~/.dsh/.dsh-moonpet-usage.json`。余额功能会向 DeepSeek API 请求账户余额；配置有 Platform 凭据时，还会查询 Platform usage。详情见 [隐私说明](docs/privacy.md)。

## 开发与验证

Node.js `^22.19.0 || >=24.0.0`，运行时无第三方依赖、无构建步骤。

```powershell
npm test
npm run check
New-Item -ItemType Directory dist -Force
npm run pack:release
```

自动化测试使用模拟会话与凭据，不调用模型或 DeepSeek API。Node 22 与 24 的离线检查由 GitHub Actions 运行。浏览器渲染检查在 Edge 上验证；真实 Harness 完整回合仍需使用者测试。

## 来源与许可

MoonPet 基于 [strawberry0321/dsh-gal](https://github.com/strawberry0321/dsh-gal) 的 MIT 代码开发，保留原作者版权声明。新增状态联动、独立命名空间、默认角色与发布验证。它是社区插件，不是 DeepSeek 或 OpenAI 官方产品。

原仓库的示例角色、语音和 UI 素材未包含在本仓库或安装包内。当前三张角色图由 AI 工具根据使用者提供的视觉参考生成，UI 与点击音由程序生成。来源与许可记录见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。代码采用 [MIT](LICENSE)；素材的说明见 [素材记录](assets/NOTICE.md)。
