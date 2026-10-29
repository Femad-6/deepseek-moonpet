# MoonPet（月伴）

**跟着 DeepSeek Harness 一起思考、工作和休息的状态宠物。**

[npm](https://www.npmjs.com/package/dsh-moonpet) · [更新说明](docs/release.md) · [问题反馈](https://github.com/Femad-6/deepseek-moonpet/issues)

MoonPet is a local companion plugin for DeepSeek Harness. It reacts to real session events with character sprites, subtle motion, and short status labels. It makes no model calls and never approves tools for you.

| 待机 | 思考 | 招手提醒 |
|---|---|---|
| ![待机](assets/packs/moon/sprites/idle.png) | ![思考](assets/packs/moon/sprites/thinking.png) | ![招手](assets/packs/moon/sprites/wave.png) |

## 功能

- 回合开始 → 思考立绘；工具执行 → 轻微摆动；等待审批 → 招手提醒。
- 完成 → 短暂跳动；失败或中断 → 降低饱和度；约六秒后恢复待机。
- 多个聊天或子代理同时工作时聚合状态，等待审批优先；同时显示任务数量。
- 拖动定位、立绘缩放、状态宠物开关，尊重系统减少动态效果设置。
- 番茄钟：默认工作 25／休息 5 分钟，开始、暂停、继续、结束，记录今日与累计工作时间；到期弹出提醒并响铃，可选十一种已下载的提醒音。
- 内置「月伴 · Moon」三张立绘，以及「鲸蓝 · Whale」「樱铃 · Sakura」「星璃 · Stella」「森柚 · Yuzu」各八种状态表情；可添加自己的角色包、台词和语音，内置角色不附带语音。
- 可选余额、token 和花费展示。花费依据内置历史费率估算，可自行覆盖；不替代供应商账单。
- 同时启用 Our Free Model 时，单独展示已有账号渠道的剩余额度；积分、Token、美元与 Gemini 配额窗口分别显示，查询失败时标注缓存。
- 官方插件列表展示专属月牙小鲸鱼图标。

状态变化静音。点击角色有轻微回弹，空闲时短暂展示开心表情，再恢复真实任务状态；等待审批时保留任务表情。点击仍可播放你自己的语音，没有语音包时显示贴合当前任务或专注进度的陪伴语；点击对话框仍可查看余额。动作是 CSS 呼吸、摆动和跳动，图片是静态立绘。

番茄钟运行期间，可按 1–60 分钟间隔（默认 5 分钟）或 25%／50%／75% 进度，通过角色对话框静音显示已专注时间和情境鼓励语，也可关闭主动陪伴语；设置即时保存，运行中修改不重置计时。暂停、继续和休息切换也有陪伴反馈。暂停与休息不累计专注时间，已有台词、账单或审批等待时跳过自动提示，不补播、不调用模型。详见 [番茄钟](docs/focus.md)。

番茄钟单独提醒，默认不自动开始或自动循环。休息结束后，角色对话框提供「开始专注」按钮，点击即可按已保存时长进入下一轮。Windows 提醒音由后端调用隐藏的 PowerShell 音频助手播放，窗口隐藏时仍可响铃；试听约 3 秒、正式提醒最长 20 秒，均跟随 MoonPet 音量（0% 静音），可随时停止，不改变系统音量。正常退出应用会暂停；异常退出最多丢失最后 30 秒未落盘的计时，不把关闭应用后的时间算作工作。详见 [番茄钟](docs/focus.md)。

## 安装

当前版本：**0.1.6**。本次新增点击回应、情境陪伴语与可配置的专注鼓励（1–60 分钟间隔、25%／50%／75% 进度或关闭），并修复头像超过 256 KiB 的插件元数据错误。保留五套角色、番茄钟、十一种提醒音和独立渠道额度展示。

推荐在 Harness 插件安装输入框填写 `dsh-moonpet@0.1.6`，或使用下方 npm 安装包链接。可选自然语音包继续使用 [v0.1.5 的独立下载](https://github.com/Femad-6/deepseek-moonpet/releases/tag/v0.1.5)。

需要已安装且支持组合包插件的 DeepSeek Harness Desktop 或 Web。状态宠物不要求 API key；余额功能可使用 Harness 中已有的 DeepSeek 凭据。

### 插件市场安装

在支持 npm 插件发现的市场中搜索 `dsh-moonpet`，确认版本为 **0.1.6** 或更新版本，安装并启用。如果没有搜索到，可刷新市场目录，或直接使用下方完整 npm 包名安装。市场索引可能未收录此包，npm 发布、镜像同步与市场目录更新也可能存在延迟。

### 按 npm 包名安装

在 Harness 的 **插件 → 添加插件** 中输入：

```text
dsh-moonpet@0.1.6
```

也可以在支持此命令的 Harness CLI 中安装：

```powershell
dsh plugin --profile desktop add dsh-moonpet@0.1.6
```

Web 用户使用 `--profile web`。插件需要通过 Harness 的插件安装入口加载；普通项目中的 `npm install` 不会自动启用 Harness 插件。

### 按安装包安装

也可以在插件安装输入框中填写 npm 官方安装包链接：

```text
https://registry.npmjs.org/dsh-moonpet/-/dsh-moonpet-0.1.6.tgz
```

或者下载该安装包，在插件输入框中填写文件的绝对路径。本地打包文件名为 `dsh-moonpet-0.1.6.tgz`；[GitHub Releases](https://github.com/Femad-6/deepseek-moonpet/releases) 也是下载入口，请以各 Release 实际提供的版本与文件为准。

以上方式安装并启用后，完全退出再打开 Harness。Windows 需要从系统托盘退出；关闭窗口通常只是隐藏。安装成功后，在宠物右上角的月亮按钮里可以调整位置、缩放和「状态宠物」开关。

### 可选的中文／英文励志语音

本次六套 25 句语音包下载：[moonpet-natural-voices-25-lines-20261024.zip](https://github.com/Femad-6/deepseek-moonpet/releases/download/v0.1.5/moonpet-natural-voices-25-lines-20261024.zip)。解压后，将其中六个 `kokoro-` 开头的目录放入 `~/.dsh/dsh-moonpet/packs/`，刷新页面，在「字幕与资源 → 语音包」中选择。四套中文使用 Qwen3-TTS 轻柔版音频，两套英文保留 Kokoro；目录名沿用旧包 ID，以保持已有选择兼容。

历史 v0.1.0 Release 另提供 [moonpet-multilingual-voices.zip](https://github.com/Femad-6/deepseek-moonpet/releases/download/v0.1.0/moonpet-multilingual-voices.zip)。解压后，将 `english-boost` 和 `chinese-boost` 两个目录复制到 `~/.dsh/dsh-moonpet/packs/`，刷新页面，在「字幕与资源 → 语音包」选择。

历史 Release 的每个包有 12 句短语和完整中／英／日三语字幕。英文为 Microsoft Zira 美式女声，中文为 Microsoft Huihui 普通话女声，均为本地系统语音合成；不附带日文音频。字幕语言与发音可以独立选择。

当前台词表已扩充到 25 句；新增可选语音包提供两种中文女声、两种中文男声、美式与英式英文女声，每套 25 句，共 150 段音频。中文已按试听反馈使用 Qwen3-TTS 重录为轻柔陪伴版，英文保留 Kokoro 音色。它们由开源权重模型本地合成，播放时不需要模型、联网或 API Key，且可与任何角色独立搭配。新包独立于历史 Release 下载，制作、安装与来源见 [语音包](docs/voices.md)。

这两套系统语音是拼接式的 SAPI 语音，听感偏生硬。想换成自然的声音、或干脆克隆角色本音，用仓库里的生成器以开源模型重录即可（不需要改插件代码）：

```powershell
python scripts/make-voice-pack.py --engine cosyvoice --ref-audio D:\voice\moon-ref.wav --prompt-text "参考音频里说的那句话"
```

引擎对比、服务端启动方式、许可注意事项见 [语音包与开源语音引擎](docs/voices.md)。生成器只放在仓库里，不随安装包发布。

旧版 `dsh-gal` 与 MoonPet 是两个独立插件；建议使用 MoonPet 时关闭旧插件，避免两个挂件同时出现。新插件不会自动读取或改写旧插件配置。

## 自定义角色

### 内置鲸蓝角色

安装 0.1.4 后，在角色旁的设置按钮 →「字幕与资源」→「立绘包」中选择 **鲸蓝 · Whale**。原默认角色继续保留，语音包可独立选择。

| 状态 | 表情与动作 |
|---|---|
| 待机 idle | 微笑抱鲸鱼 |
| 思考 thinking | 思索、手指靠近下巴 |
| 工作 working | 专注、认真 |
| 等待审批 waiting | 期待、举手提醒 |
| 完成 done | 开心、胜利手势 |
| 异常 error | 担忧、难过 |
| 中断 stopped | 平静、放松 |
| 离线 offline | 闭眼休息 |

八张透明 PNG 使用一致画布，切换时保持布局稳定。表情为静态立绘，继续使用已有的轻微 CSS 动作。

### 更多内置角色

在设置 →「字幕与资源」→「角色」下拉框中可选择以下角色，每套均有八种独立状态立绘：

| 角色 | 人物形象 |
|---|---|
| 樱铃 · Sakura（8） | 粉色长发、樱花发饰、白粉连衣裙，温柔活泼 |
| 星璃 · Stella（8） | 银紫长发、星饰与星空披肩，安静神秘 |
| 森柚 · Yuzu（8） | 栗色短发、猫耳帽、绿白服装，元气可爱 |

状态覆盖待机、思考、工作、等待审批、完成、异常、中断与离线休息；切换角色后自动沿用现有状态联动，语音包仍可独立选择。新角色使用透明 PNG 和一致画布，保留月伴、鲸蓝及用户自定义角色包。素材制作记录见 [角色素材](docs/characters.md)。

### 添加自己的角色包

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

余额和今日已用始终显示你自己的 DeepSeek 账号数据。同时启用 Our Free Model 时，余额栏另行展示其已有账号渠道的剩余额度，每分钟在窗口可见时刷新。积分、Token、美元按渠道分别展示，Gemini 按配额窗口展示百分比，不跨单位或来源相加。匿名免费通道没有余额接口时显示「未提供额度」。查询失败保留上次结果并标注缓存；多渠道摘要过长时省略，打开宠物余额面板可查看完整内容。累计 Token 仍使用 MoonPet 的本地统计。

额度查询通过宿主同源鉴权的 `/api/our-free-model/summary` 和 `/api/channel-pack` 接口，后者可能向渠道上游查询账号额度。MoonPet 不读取或保存渠道登录凭据，不自动登录、领取积分或发起模型调用。

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

原仓库的示例角色、语音和 UI 素材未包含在本仓库或安装包内。内置角色图由 AI 工具根据使用者提供的视觉参考生成，UI 与点击音由程序生成。来源与许可记录见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。代码采用 [MIT](LICENSE)；素材的说明见 [素材记录](assets/NOTICE.md)。
