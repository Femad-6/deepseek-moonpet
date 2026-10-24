# 语音包与开源语音引擎

MoonPet 的语音只是 `voices/` 目录里的音频文件加一张 `script.csv`，插件不关心音频是谁生成的。
所以「换更好的声音」= 用更好的引擎重录一遍台词，**不需要改插件代码**。

## 六套 25 句语音包

2026-10-24 新增六套独立可选包。根据用户试听反馈，四套中文进一步使用 Qwen3-TTS 1.7B 重录为轻柔陪伴版，英文两套保持原样。每套有 25 段音频以及中／英／日三语字幕；日文仅为字幕，不是日文发音。

| 包目录 | 名称 | 模型原生音色 | 发音 |
|---|---|---|---|
| `kokoro-zh-female-001` | 清柔女声 · 中文鼓励 | Qwen3-TTS `Serena` | 普通话 |
| `kokoro-zh-female-017` | 明亮女声 · 中文鼓励 | Qwen3-TTS `Vivian` | 普通话 |
| `kokoro-zh-male-010` | 沉稳男声 · 中文鼓励 | Qwen3-TTS `Uncle_Fu` | 普通话 |
| `kokoro-zh-male-037` | 清朗男声 · 中文鼓励 | Qwen3-TTS `Dylan` | 普通话 |
| `kokoro-en-maple` | Maple · 美式英文鼓励 | `af_maple` | 美式英语女声 |
| `kokoro-en-vale` | Vale · 英式英文鼓励 | `bf_vale` | 英式英语女声 |

中文名称是方便选择的音色标签，中文重录使用对应角色的轻柔语气指令。台词保留原有 12 句，新增 13 句，覆盖开始行动、保持专注、遇到困难、肯定进步与休息关怀。中文包保留原 ID，方便已保存设置继续使用；实际引擎与音色以 `voiceProvider` 和 `generation.json` 为准。

中文重录使用官方 [Qwen3-TTS-12Hz-1.7B-CustomVoice](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice)（Apache-2.0），固定 revision `0c0e3051f131929182e2c023b9537f8b1c68adfe`。风格为标准普通话、轻柔交流、舒缓清晰、自然换气和柔和句尾，具体指令保存在每包 `generation.json` 中。自然度与偏好需试听判断，音频格式和播放测试不代表主观听感通过。

英文保留官方 [Kokoro-82M-v1.1-zh](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh) 模型（Apache-2.0），固定 revision `01e7505bd6a7a2ac4975463114c3a7650a9f7218`。模型 SHA-256 为 `b1d8410fa44dfb5c15471fd6c4225ea6b4e9ac7fa03c98e8bea47a9928476e2b`。全部使用模型原生音色，不克隆角色或真人声音。

音频为 24kHz、16 位 PCM、单声道 WAV，每句结尾补 0.45 秒静音。每包附 `SOURCE.md` 与 `generation.json`，记录模型、音色、参数、时长和音频哈希。安装后刷新页面，在「设置 → 字幕与资源 → 语音包」中选择；语音与立绘可独立搭配。插件不运行 TTS 模型。

本次本地安装目录为 `~/.dsh/dsh-moonpet/packs/`，六个目录均以 `kokoro-` 开头。中文重录前的备份位于 `voice-packs/backups/kokoro-zh-before-qwen-20261024/`。轻柔版完整便携包为 [moonpet-natural-voices-25-lines-20261024.zip](https://github.com/Femad-6/deepseek-moonpet/releases/download/v0.1.5/moonpet-natural-voices-25-lines-20261024.zip)，包含重录的四套中文和未改动的两套英文。GitHub v0.1.5 Release 同时提供 `.zip.sha256` 和 `SHA256SUMS-v0.1.5.txt` 校验文件。最初的 Kokoro 压缩包仅保留在本地供对照。

### 重新生成中文轻柔版

使用独立 Python 3.12 环境安装 `scripts/requirements-qwen-tts.txt`。TorchAudio 必须与 PyTorch 版本匹配；本次环境复用 PyTorch `2.9.1+cu126`，在独立环境安装对应 `torchaudio==2.9.1+cu126`，没有改动全局包。

下载上述固定 revision 的完整 Qwen3-TTS 模型（含 `speech_tokenizer/`）到 `work/qwen-tts-model/`，运行：

```powershell
work/qwen-tts-env/Scripts/python.exe scripts/make-natural-chinese-packs.py --model-dir work/qwen-tts-model
```

输出 `voice-packs/qwen-soft-20261024/`；`--limit 1` 可先生成四个短样本。默认最多四句一批，本次使用本机 CUDA、BF16 和 SDPA 生成。脚本只写项目输出目录，不自动覆盖已安装的语音包；安装前应校验完整的 100 段中文音频和字幕，保留旧包备份。英文不需要重新生成。

### 重现最初的六套 Kokoro 音频

安装仅用于制作的依赖，不加入插件运行时依赖：

```powershell
python -m venv --system-site-packages work/kokoro-env
work/kokoro-env/Scripts/python.exe -m pip install -r scripts/requirements-kokoro.txt
work/kokoro-env/Scripts/python.exe -m pip install https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl
```

将上述固定 revision 的 `config.json`、`kokoro-v1_1-zh.pth` 及表中六个 `voices/<音色>.pt` 下载到 `work/kokoro-model/` 后运行：

```powershell
work/kokoro-env/Scripts/python.exe scripts/make-kokoro-packs.py --model-dir work/kokoro-model
```

输出目录为 `voice-packs/kokoro-20261024/`。加 `--audition --out voice-packs/kokoro-auditions-20261024` 只生成每个音色的第一句样本。脚本校验模型哈希，只做本地推理，失败后停止；同参数重跑可跳过已完成音频。未完成的包不得作为完整 25 句包安装。

已发布的中英文语音包（`moonpet-multilingual-voices.zip`）用的是 Windows 系统语音合成：
英文 Microsoft Zira、中文 Microsoft Huihui。它们是 2010 年代的拼接式 SAPI 语音，
所以听感生硬、断句机械。本页给出用开源神经语音模型重录的方案。

## 快速开始

```powershell
# 0) 先自检脚本自身（不需要引擎、不需要模型）
python scripts/make-voice-pack.py --selftest
```

自检会验一遍 wav 解析、立体声降混、尾部补静音和 `script.csv` 的往返转义，几十毫秒完成，
适合在装引擎之前先确认脚本本身没问题。CI 里也会跑 `python3 -m py_compile` + `--selftest`。

```powershell
# 1) 在引擎自己的环境里启动服务端（见下文）
# 2) 克隆音色并生成中英两个包
python scripts/make-voice-pack.py `
  --engine cosyvoice `
  --ref-audio D:\voice\moon-ref.wav `
  --prompt-text "参考音频里说的那句话" `
  --lang both `
  --out D:\packs-preview

# 3) 复制到插件素材目录，刷新页面后在「字幕与资源 → 语音包」选择
Copy-Item D:\packs-preview\chinese-boost "$env:USERPROFILE\.dsh\dsh-moonpet\packs\" -Recurse
Copy-Item D:\packs-preview\english-boost "$env:USERPROFILE\.dsh\dsh-moonpet\packs\" -Recurse
```

输出包名与已发布的包相同（`chinese-boost` / `english-boost`），所以可以直接覆盖旧包。

## 开源引擎怎么选

| 引擎 | 许可 | 中文 | 英文 | 音色克隆 | 算力 |
|---|---|---|---|---|---|
| **CosyVoice 2 / 3**（阿里 FunAudioLLM） | Apache-2.0 | 很强 | 强 | ✅ 5~15 秒参考音频 | 0.5B，建议 GPU |
| **GPT-SoVITS**（RVC-Boss） | MIT | 很强 | 强 | ✅ 1~5 分钟参考音频 | 需 GPU |
| **MeloTTS**（MyShell / MIT） | MIT | 好（支持中英混读） | 好 | ❌ 仅内置音色 | CPU 实时 |
| **Kokoro-82M v1.1-zh** | Apache-2.0 | 独立中文版本，100 个中文音色 | Maple / Sol / Vale | ❌ | 82M，可用 CPU / GPU |
| **Piper** | 引擎 GPL-3 / 音色仓库 MIT | 一般 | 好 | ❌ | 极快 |
| edge-tts | ❌ 非开源、非官方接口 | 好 | 好 | ❌ | 需联网 |

选择建议：

- **想要"角色本音"** → CosyVoice（参考音频最短）或 GPT-SoVITS（相似度更高）。本页脚本支持这两个。
- **只想要自然但不在意音色** → 中文用 MeloTTS，英文用 Kokoro 的 `af_heart`。零样本克隆不适用，但胜在省事。
- **中文选择 Kokoro v1.1-zh**。旧版 v1.0 的中文音色评分不适用于这个独立中文版本；后者增加了 100 个中文说话人。请以实际生成样本判断个人听感，不把不同版本的音色或质量结论混用。
- **Piper 的 GPL 只覆盖引擎**：[piper-voices 仓库](https://huggingface.co/rhasspy/piper-voices) 是 `license: mit`，
  但中文音色 `zh_CN/huayan` 的音源许可标注为 **Unknown**（来自 [HuaYan_TTS](https://github.com/PlayVoice/HuaYan_TTS)），
  再分发需谨慎。

## 启动引擎服务端

脚本通过 HTTP 调用引擎自带的服务端，因此**不引入任何 Python 依赖**——MoonPet 仓库保持运行时零依赖不变。

### CosyVoice 2

```bash
git clone --recursive https://github.com/FunAudioLLM/CosyVoice.git
cd CosyVoice
# 按上游 README 建好 conda 环境并下载模型（iic/CosyVoice2-0.5B）
python runtime/python/fastapi/server.py --port 50000 --model_dir iic/CosyVoice2-0.5B
```

接口（已按上游源码核对）：

- `POST /inference_zero_shot`：`tts_text` + `prompt_text` + `prompt_wav`
- `POST /inference_cross_lingual`：`tts_text` + `prompt_wav`
- `POST /inference_sft`：`tts_text` + `spk_id`（内置音色，如 `中文女`）

返回值是 wav 音频流；出错时返回 `{"message": ...}`。

### GPT-SoVITS

```bash
git clone https://github.com/RVC-Boss/GPT-SoVITS.git
cd GPT-SoVITS
python api_v2.py -a 127.0.0.1 -p 9880 -c GPT_SoVITS/configs/tts_infer.yaml
```

`POST /tts`（JSON）返回 wav。参考音频建议 1~5 分钟，跨语种效果比 CosyVoice 稍稳。

## 生成脚本用法

```
python scripts/make-voice-pack.py --help
```

常用参数：

| 参数 | 说明 |
|---|---|
| `--engine` | `cosyvoice`（默认）或 `gpt-sovits` |
| `--server` | 服务地址；默认 `:50000` / `:9880` |
| `--ref-audio` | 角色参考音频，克隆音色的关键 |
| `--prompt-text` | 参考音频里说的那句话，逐字对应 |
| `--mode` | CosyVoice 推理模式：`zero_shot`（默认）/ `cross_lingual` / `sft` |
| `--spk` | `sft` 模式的内置音色 id，默认 `中文女` |
| `--lang` | `zh` / `en` / `ja` / `both`（默认中英各一个包） |
| `--csv` | 台词表，默认 `docs/motivational-subtitles.csv` |
| `--tail-pad` | 每句尾部补的静音秒数，默认 0.45，避免对话框闪退 |
| `--force` | 已存在的 wav 也重录 |
| `--dry-run` | 只打印计划，不请求引擎 |
| `--selftest` | 自检脚本自身逻辑，不需要引擎 |

### 关于参考音频

- 5~15 秒、干净、无背景音乐、无混响，单人说话最理想。
- CosyVoice 的 `zero_shot` 需要 `--prompt-text` 与音频**逐字一致**；不想写文本就用 `--mode cross_lingual`，
  只给音色，代价是韵律控制弱一些。
- 参考音频只是"音色样本"。**只用你有权使用的声音**：自己的录音、自己拥有授权的配音，
  或明确允许克隆的素材。克隆真人（尤其是公众人物）的音色可能涉及人格权／声音权，请自行确认。

### 失败与重跑

- 单句失败不会中断整个流程：失败的句子**仍会写进 `script.csv`**（避免重跑时忘了缺哪句），
  但 `voices/` 里没有对应文件，插件只会抽取实际存在的音频。
- 缺哪些句会记录在包目录的 `MISSING.txt` 里。修好参数后重跑同一命令即可补录，已成功的会跳过。

## 产物结构

```
chinese-boost/
├── pack.json         # id / displayName / description
├── script.csv        # clip -> 中／英／日三语字幕
└── voices/
    ├── en0001.wav    # 文件名主干必须等于 script.csv 的 clip
    └── ...
```

脚本统一输出 **16 位 PCM wav，单声道**（立体声会自动降混），并在句尾补静音。
插件对音频扩展名、采样率没有硬性要求，wav 的无损特性也让台词表里的 `sec` 时长保持准确。

## 许可与再分发

- 引擎与权重：CosyVoice Apache-2.0、GPT-SoVITS 代码 MIT、Kokoro Apache-2.0、MeloTTS MIT。
  仍需逐个确认**权重**的许可条款，模型的许可不一定等于代码的许可。
- **生成出来的音频属于"你的素材"，不要提交进 MoonPet 仓库**。
  仓库里的默认包不带任何角色语音，正是为了避开这一层问题；换音色请放在
  `~/.dsh/dsh-moonpet/packs/` 下由自己管理。
- 若要把自己生成的语音包**公开分发**，请在包内注明引擎、模型版本与音色来源，
  并确认参考音频本身允许被用于该用途。

## 相关文件

- 台词表格式与自定义角色包：[customize.md](customize.md)
- 25 句三语励志字幕：[motivational-subtitles.csv](motivational-subtitles.csv)
- 扫描规则（目录名、扩展名、`script.csv` 优先级）：`lib/packs.js`
