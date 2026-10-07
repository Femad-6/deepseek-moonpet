#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""MoonPet 语音包生成器 —— 用开源语音克隆模型重录台词。

背景：发布包里的中英文语音来自 Windows 本地系统语音合成（Microsoft Huihui /
Zira），是拼接式 SAPI 语音，听感生硬。这个脚本改成调用**开源**的神经语音引擎，
用你自己的参考音色（角色的"本音"）重新合成 script.csv 里的每一句，直接产出
MoonPet 能识别的语音包目录。

不引入任何 Python 依赖：只用标准库，通过 HTTP 调用引擎自带的服务端，所以
MoonPet 仓库本身仍然保持"运行时零依赖"。

支持的引擎
----------
cosyvoice   CosyVoice 2 / 3（阿里 FunAudioLLM，Apache-2.0）
            服务端：runtime/python/fastapi/server.py --port 50000
            模式：zero_shot（参考音频 + 参考文本）／cross_lingual（只要参考音频）
            音色克隆只需 5~15 秒参考音频。

gpt-sovits  GPT-SoVITS（RVC-Boss，MIT）
            服务端：api_v2.py -a 127.0.0.1 -p 9880
            音色克隆建议 1~5 分钟参考音频，跨语种支持较好。

典型用法
--------
1) 先起服务端（在引擎自己的仓库/conda 环境里），例如：

   python runtime/python/fastapi/server.py --port 50000 --model_dir iic/CosyVoice2-0.5B

2) 用 12 句励志台词 + 角色参考音，一次生成中英两个包：

   python scripts/make-voice-pack.py \
     --engine cosyvoice \
     --ref-audio D:\\voice\\moon-ref.wav \
     --prompt-text "参考音频里说的那句话" \
     --lang zh --out D:\\packs-preview

3) 把生成的 ``chinese-boost`` / ``english-boost`` 目录复制到
   ``~/.dsh/dsh-moonpet/packs/``，刷新页面，在「字幕与资源 → 语音包」选择。

只生成英文（或只生成中文）时加 ``--lang en`` / ``--lang zh``；两次都生成加
``--lang both``（默认）。已有 wav 默认跳过，``--force`` 重录。
"""

from __future__ import annotations

import argparse
import json
import re
import struct
import sys
import time
import unicodedata
import urllib.error
import urllib.request
import uuid
from pathlib import Path

# ---------------------------------------------------------------------------
# 引擎契约（已按上游源码核对，别凭记忆改）
# ---------------------------------------------------------------------------

# CosyVoice: runtime/python/fastapi/server.py
#   POST /inference_zero_shot   form: tts_text, prompt_text, prompt_wav(File)
#   POST /inference_cross_lingual form: tts_text, prompt_wav(File)
#   POST /inference_sft         form: tts_text, spk_id
#   -> 200 直接返回 wav 音频流；400 返回 {"message": ...}
COSYVOICE_PATH = {
    'zero_shot': '/inference_zero_shot',
    'cross_lingual': '/inference_cross_lingual',
    'sft': '/inference_sft',
}

# CosyVoice 预训练说话人。不同版本的模型内置音色不同，缺失时服务端会报错，
# 这时改用 --ref-audio 克隆即可。常见值：
COSYVOICE_SPEAKERS = (
    '中文女', '中文男', '日语男', '粤语女', '英文女', '英文男', '韩语女',
)

# GPT-SoVITS: api_v2.py  POST /tts  (JSON) -> 200 wav，400 {"message": ...}
GPTSOVITS_LANG = {'zh': 'zh', 'en': 'en', 'ja': 'ja'}

# MoonPet 只扫描这些扩展名（lib/packs.js 的 AUDIO_EXT）。本脚本统一产出 wav，
# 因为无损、无需额外编码依赖，浏览器也能直接播放。
AUDIO_EXT = ('.wav', '.mp3', '.ogg', '.oga', '.m4a', '.aac', '.flac')
OUTPUT_EXT = '.wav'

DEFAULT_CSV = Path(__file__).resolve().parent.parent / 'docs' / 'motivational-subtitles.csv'

# 输出包名沿用已发布的 moonpet-multilingual-voices.zip，用户在设置面板里看到的
# 名字不变，方便直接替换。
PACK_NAMES = {'zh': 'chinese-boost', 'en': 'english-boost'}

PACK_DISPLAY = {
    'zh': '中文励志语音（开源模型重录）',
    'en': 'English Boost（开源模型重录）',
}

# 每句台词对应 script.csv 里的哪一列。
TEXT_COLUMN = {'zh': 'chinese', 'en': 'english', 'ja': 'japanese'}

# 引擎擅长/支持的目标语言白名单。
ENGINE_LANGS = {
    'cosyvoice': ('zh', 'en', 'ja'),
    'gpt-sovits': ('zh', 'en', 'ja'),
}


class GenError(RuntimeError):
    """A failure worth showing the user verbatim (with a hint)."""


# ---------------------------------------------------------------------------
# CSV
# ---------------------------------------------------------------------------

def read_lines(csv_path: Path, column: str) -> list[dict]:
    """Read the clip/text table. Mirrors the plugin's own expectations."""
    import csv as _csv

    if not csv_path.is_file():
        raise GenError(f'找不到台词表: {csv_path}')
    # utf-8-sig 顺手吃掉 Excel 存的 BOM。
    with csv_path.open('r', encoding='utf-8-sig', newline='') as fh:
        rows = list(_csv.DictReader(fh))
    if not rows:
        raise GenError(f'台词表是空的: {csv_path}')
    if 'clip' not in (rows[0].keys() if rows else ()):
        raise GenError(f'台词表缺少 clip 列: {csv_path}')

    out: list[dict] = []
    for i, row in enumerate(rows, start=2):  # 2 = 第一个数据行（含表头）
        clip = (row.get('clip') or '').strip()
        if not clip:
            continue
        text = (row.get(column) or '').strip()
        if not text:
            print(f'  ! 第 {i} 行 {clip}: {column} 列为空，跳过', file=sys.stderr)
            continue
        out.append({
            'clip': clip,
            'text': text,
            'sec': _float_or_none(row.get('sec')),
            'ja': (row.get('japanese') or '').strip(),
            'zh': (row.get('chinese') or '').strip(),
            'en': (row.get('english') or '').strip(),
        })
    if not out:
        raise GenError(f'台词表里没有任何一行填了 {column} 列: {csv_path}')
    return out


def _float_or_none(value):
    try:
        return round(float(str(value).strip()), 3)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# HTTP multipart，不依赖 requests
# ---------------------------------------------------------------------------

def _multipart(fields: dict, files: dict) -> tuple[bytes, str]:
    boundary = f'----moonpet{uuid.uuid4().hex}'
    body = bytearray()

    def write(text: str) -> None:
        body.extend(text.encode('utf-8'))

    for name, value in fields.items():
        write(f'--{boundary}\r\n')
        write(f'Content-Disposition: form-data; name="{name}"\r\n\r\n')
        write(f'{value}\r\n')
    for name, path in files.items():
        data = Path(path).read_bytes()
        write(f'--{boundary}\r\n')
        write(f'Content-Disposition: form-data; name="{name}"; filename="{Path(path).name}"\r\n')
        write('Content-Type: application/octet-stream\r\n\r\n')
        body.extend(data)
        write('\r\n')
    write(f'--{boundary}--\r\n')
    return bytes(body), f'multipart/form-data; boundary={boundary}'


def _post(url: str, data: bytes, content_type: str, timeout: float) -> bytes:
    req = urllib.request.Request(url, data=data, method='POST')
    req.add_header('Content-Type', content_type)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except urllib.error.HTTPError as err:
        detail = err.read().decode('utf-8', 'replace')[:400]
        raise GenError(f'引擎返回 HTTP {err.code}: {detail}') from None
    except urllib.error.URLError as err:
        # socket.timeout 会被包进 URLError，所以两种超时都在这里区分。
        if isinstance(err.reason, TimeoutError):
            raise GenError(f'{url} 超时（{timeout:.0f}s）。长句可以调大 --timeout。') from None
        raise GenError(
            f'连不上 {url}（{err.reason}）。服务端起了吗？'
            '先按 docs/voices.md 启动引擎服务再重试。'
        ) from None
    except TimeoutError:
        raise GenError(f'{url} 超时（{timeout:.0f}s）。长句可以调大 --timeout。') from None


def _post_json(url: str, payload: dict, timeout: float) -> bytes:
    data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    return _post(url, data, 'application/json', timeout)


# ---------------------------------------------------------------------------
# 引擎客户端
# ---------------------------------------------------------------------------

class BaseEngine:
    name = ''

    def __init__(self, base_url: str, timeout: float):
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout

    def synth(self, line: dict, lang: str) -> bytes:  # pragma: no cover - 接口
        raise NotImplementedError

    def describe(self) -> str:  # pragma: no cover - 接口
        raise NotImplementedError


class CosyVoiceEngine(BaseEngine):
    name = 'cosyvoice'

    def __init__(self, base_url, timeout, mode, ref_audio=None, prompt_text=None, spk_id=None):
        super().__init__(base_url, timeout)
        self.mode = mode
        self.ref_audio = Path(ref_audio).resolve() if ref_audio else None
        self.prompt_text = (prompt_text or '').strip()
        self.spk_id = spk_id or '中文女'

        if mode in ('zero_shot', 'cross_lingual'):
            if not self.ref_audio:
                raise GenError(f'{mode} 模式必须提供 --ref-audio 参考音频')
            if not self.ref_audio.is_file():
                raise GenError(f'参考音频不存在: {self.ref_audio}')
        if mode == 'zero_shot' and not self.prompt_text:
            raise GenError(
                'zero_shot 模式需要 --prompt-text：参考音频里说的那句话，'
                '逐字对应。只想给音色不给文本时改用 --mode cross-lingual。'
            )

    def describe(self) -> str:
        if self.mode == 'sft':
            return f'CosyVoice 预训练音色 spk_id={self.spk_id}'
        detail = f'CosyVoice {self.mode} 克隆自 {self.ref_audio.name}'
        if self.mode == 'zero_shot':
            detail += f'（参考文本 {len(self.prompt_text)} 字）'
        return detail

    def synth(self, line: dict, lang: str) -> bytes:
        url = self.base_url + COSYVOICE_PATH[self.mode]
        fields = {'tts_text': line['text']}
        files = {}
        if self.mode == 'sft':
            fields['spk_id'] = self.spk_id
        else:
            files['prompt_wav'] = str(self.ref_audio)
            if self.mode == 'zero_shot':
                fields['prompt_text'] = self.prompt_text
        data, content_type = _multipart(fields, files)
        return _post(url, data, content_type, self.timeout)


class GptSovitsEngine(BaseEngine):
    name = 'gpt-sovits'

    def __init__(self, base_url, timeout, ref_audio=None, prompt_text=None,
                 prompt_lang='zh', speed=1.0, seed=-1, sample_steps=32, text_split='cut5'):
        super().__init__(base_url, timeout)
        if not ref_audio:
            raise GenError('gpt-sovits 必须提供 --ref-audio 参考音频')
        self.ref_audio = Path(ref_audio).resolve()
        if not self.ref_audio.is_file():
            raise GenError(f'参考音频不存在: {self.ref_audio}')
        self.prompt_text = (prompt_text or '').strip()
        self.prompt_lang = prompt_lang
        self.speed = speed
        self.seed = seed
        self.sample_steps = sample_steps
        self.text_split = text_split

    def describe(self) -> str:
        detail = f'GPT-SoVITS 克隆自 {self.ref_audio.name}'
        if self.prompt_text:
            detail += f'（参考文本 {len(self.prompt_text)} 字 / {self.prompt_lang}）'
        else:
            detail += '（无参考文本，音色相似度会下降）'
        return detail

    def synth(self, line: dict, lang: str) -> bytes:
        payload = {
            'text': line['text'],
            'text_lang': GPTSOVITS_LANG.get(lang, lang),
            'ref_audio_path': str(self.ref_audio),
            'prompt_text': self.prompt_text,
            'prompt_lang': self.prompt_lang,
            'text_split_method': self.text_split,
            'batch_size': 1,
            'media_type': 'wav',
            'streaming_mode': False,
            'speed_factor': self.speed,
            'seed': self.seed,
            'sample_steps': self.sample_steps,
        }
        return _post_json(self.base_url + '/tts', payload, self.timeout)


def build_engine(args) -> BaseEngine:
    if args.engine == 'cosyvoice':
        return CosyVoiceEngine(
            args.server, args.timeout,
            mode=args.mode, ref_audio=args.ref_audio,
            prompt_text=args.prompt_text, spk_id=args.spk,
        )
    return GptSovitsEngine(
        args.server, args.timeout,
        ref_audio=args.ref_audio, prompt_text=args.prompt_text,
        prompt_lang=args.prompt_lang, speed=args.speed, seed=args.seed,
        sample_steps=args.sample_steps, text_split=args.text_split,
    )


# ---------------------------------------------------------------------------
# WAV 处理（标准库）
# ---------------------------------------------------------------------------

def wav_info(data: bytes) -> tuple[int, int, int]:
    """(channels, sample_rate, frames) for a RIFF/WAVE buffer."""
    if len(data) < 44 or data[:4] != b'RIFF' or data[8:12] != b'WAVE':
        raise GenError('引擎返回的不是 WAV 数据；把 --engine/--server 对应关系再核一遍')
    pos, channels, rate, bits, frames = 12, None, None, None, None
    while pos + 8 <= len(data):
        cid = data[pos:pos + 4]
        size = struct.unpack('<I', data[pos + 4:pos + 8])[0]
        body = data[pos + 8:pos + 8 + size]
        if cid == b'fmt ' and len(body) >= 16:
            _, channels, rate, _, _, bits = struct.unpack('<HHIIHH', body[:16])
        elif cid == b'data':
            if bits:
                frames = len(body) // (channels * max(1, bits // 8))
            break
        pos += 8 + size + (size & 1)
    if not channels or not rate or not frames:
        raise GenError('WAV 头部缺少 fmt/data 块')
    return channels, rate, frames


def to_mono(data: bytes) -> bytes:
    """Downmix a 16-bit PCM WAV to mono, preserving chunk order.

    Chunk sizes are preserved verbatim (the pad byte is copied through), so the
    output stays a well-formed RIFF file for the browser and for `wave_info`.
    """
    channels, _, _ = wav_info(data)
    if channels == 1:
        return data

    head = bytearray(data[:12])
    pos = 12
    while pos + 8 <= len(data):
        cid = data[pos:pos + 4]
        size = struct.unpack('<I', data[pos + 4:pos + 8])[0]
        body = data[pos + 8:pos + 8 + size]
        pad = data[pos + 8 + size:pos + 8 + size + (size & 1)]  # the pad byte, if any

        if cid == b'fmt ':
            if len(body) < 16:
                raise GenError('WAV fmt 块不完整')
            _, _, rate, _, _, bits = struct.unpack('<HHIIHH', body[:16])
            if bits != 16:
                raise GenError(f'只处理 16 位 PCM 的 WAV，引擎给的是 {bits} 位')
            fmt = bytearray(body)
            struct.pack_into('<H', fmt, 2, 1)             # channels = mono
            struct.pack_into('<I', fmt, 8, rate * 2)      # byte rate
            struct.pack_into('<H', fmt, 12, 2)            # block align
            head.extend(b'fmt ')
            head.extend(struct.pack('<I', len(fmt)))
            head.extend(fmt)
            head.extend(pad)
        elif cid == b'data':
            count = len(body) // 2
            samples = struct.unpack(f'<{count}h', body[:count * 2])
            mixed = bytearray()
            for i in range(0, count - channels + 1, channels):
                chunk = samples[i:i + channels]
                mixed.extend(struct.pack('<h', int(sum(chunk) / len(chunk))))
            # A trailing partial frame (malformed input) is dropped rather than
            # allowed to shift every following sample by one.
            head.extend(b'data')
            head.extend(struct.pack('<I', len(mixed)))
            head.extend(mixed)
            head.extend(pad)
        else:
            head.extend(cid)
            head.extend(struct.pack('<I', size))
            head.extend(body)
            head.extend(pad)
        pos += 8 + size + (size & 1)

    head[4:8] = struct.pack('<I', max(0, len(head) - 8))  # RIFF size
    return bytes(head)


def append_silence(data: bytes, seconds: float) -> bytes:
    """Pad the tail with silence so the dialog box does not snap shut."""
    if seconds <= 0:
        return data
    channels, rate, _ = wav_info(data)
    frames = int(rate * seconds)
    padding = b'\x00' * (frames * channels * 2)
    result = bytearray(data[:12])
    pos = 12
    while pos + 8 <= len(data):
        cid = data[pos:pos + 4]
        size = struct.unpack('<I', data[pos + 4:pos + 8])[0]
        body = data[pos + 8:pos + 8 + size]
        if cid == b'data':
            body += padding
        result.extend(cid + struct.pack('<I', len(body)) + body)
        if len(body) & 1:
            result.extend(b'\x00')
        pos += 8 + size + (size & 1)
    result[4:8] = struct.pack('<I', len(result) - 8)
    return bytes(result)


# ---------------------------------------------------------------------------
# 生成
# ---------------------------------------------------------------------------

def safe_stem(clip: str) -> str:
    """Keep ASCII, hyphenate the rest — the plugin matches clip by file stem."""
    ascii_ish = unicodedata.normalize('NFKD', clip).encode('ascii', 'ignore').decode('ascii')
    stem = re.sub(r'[^A-Za-z0-9._-]+', '-', ascii_ish).strip('-')
    return stem or 'line'


def write_pack(out_dir: Path, lang: str, lines: list[dict], engine: BaseEngine,
               args) -> tuple[int, int]:
    pack_dir = out_dir / PACK_NAMES[lang]
    voices = pack_dir / 'voices'
    voices.mkdir(parents=True, exist_ok=True)

    # pack.json 的字段名与内置包一致（displayName 才是设置面板显示的名字）。
    (pack_dir / 'pack.json').write_text(json.dumps({
        'id': PACK_NAMES[lang],
        'displayName': PACK_DISPLAY[lang],
        'description': (
            f"由 {engine.name} 开源语音模型合成，{engine.describe()}。"
            '字幕为完整中／英／日三语。'
        ),
    }, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    # script.csv：clip 必须和 voices/ 里的文件名主干一致。
    # 每一行都写进 CSV，即使这次合成失败 —— 否则重跑时就再也想不起来缺了哪句，
    # 而插件本身对"有字幕没音频"是安全的（它只按 voices/ 里的实际文件抽取）。
    rows = ['clip,chapter,speaker_jp,japanese,chinese,english,sec']
    written, failed, missing = 0, 0, []
    for line in lines:
        target = voices / f'{safe_stem(line["clip"])}{OUTPUT_EXT}'
        if target.exists() and not args.force:
            print(f'  = {target.name} 已存在，跳过（--force 可重录）')
            rows.append(_csv_row(line, lang, _duration_of(target)))
            written += 1
            continue

        print(f'  -> {line["clip"]}: {line["text"][:34]}')
        try:
            audio = engine.synth(line, lang)
        except Exception as err:
            # 一句失败不该带走整批。GenError 是预期的（引擎报错 / 连不上），
            # 其他异常也一并降级成"这句没录上"，细节照原样打出来便于排查。
            detail = err if isinstance(err, GenError) else f'{type(err).__name__}: {err}'
            print(f'     x 失败: {detail}', file=sys.stderr)
            rows.append(_csv_row(line, lang, line['sec']))
            failed += 1
            missing.append(line['clip'])
            continue

        audio = append_silence(to_mono(audio), args.tail_pad)
        target.write_bytes(audio)
        _, rate, _ = wav_info(audio)
        if rate not in args.allowed_rates:
            print(f'     ! 采样率 {rate}Hz 不在常用范围，浏览器仍可播放', file=sys.stderr)
        rows.append(_csv_row(line, lang, _duration(audio)))
        written += 1
        if args.delay > 0:
            time.sleep(args.delay)

    (pack_dir / 'script.csv').write_text('\r\n'.join(rows) + '\r\n', encoding='utf-8')
    if missing:
        (pack_dir / 'MISSING.txt').write_text(
            'These clips have no audio yet — rerun the generator to fill them:\n'
            + '\n'.join(missing) + '\n', encoding='utf-8')
    return written, failed


def _csv_row(line: dict, lang: str, sec) -> str:
    cells = [line['clip'], '1', '', line['ja'], line['zh'], line['en'],
             '' if sec is None else f'{sec:.3f}']
    return ','.join(_csv_cell(c) for c in cells)


def _csv_cell(value) -> str:
    text = '' if value is None else str(value)
    if any(ch in text for ch in ',"\r\n'):
        return '"' + text.replace('"', '""') + '"'
    return text


def _duration(data: bytes) -> float:
    _, rate, frames = wav_info(data)
    return frames / rate


def _duration_of(path: Path):
    """Seconds of an existing wav, or None if it is not a wav we understand."""
    try:
        return _duration(path.read_bytes())
    except (GenError, OSError):
        return None


def _synthetic_stereo_wav(frames: int = 1000, rate: int = 24000) -> bytes:
    """A tiny 16-bit stereo WAV, so the audio path can be tested with no engine."""
    left = [((i * 7) % 4000) - 2000 for i in range(frames)]
    right = [((i * 3) % 3000) - 1500 for i in range(frames)]
    pcm = bytearray()
    for i in range(frames):
        pcm.extend(struct.pack('<hh', left[i], right[i]))
    fmt = struct.pack('<HHIIHH', 1, 2, rate, rate * 4, 4, 16)
    body = bytearray(b'RIFF' + struct.pack('<I', 0) + b'WAVE')
    for cid, chunk in ((b'fmt ', fmt), (b'data', bytes(pcm))):
        body.extend(cid)
        body.extend(struct.pack('<I', len(chunk)))
        body.extend(chunk)
        if len(chunk) & 1:
            body.extend(b'\x00')
    body[4:8] = struct.pack('<I', len(body) - 8)
    assert len(body) == 12 + 8 + len(fmt) + 8 + len(pcm)  # ints only, never overflows
    return bytes(body)


def selftest() -> int:
    """Exercise the WAV path and the pack layout with no engine involved."""
    checks = 0

    def check(ok: bool, label: str) -> None:
        nonlocal checks
        checks += 1
        print(('  ok   ' if ok else '  FAIL ') + label)
        if not ok:
            raise AssertionError(label)

    src = _synthetic_stereo_wav()
    check(wav_info(src) == (2, 24000, 1000), 'stereo wav 头解析')

    mono = to_mono(src)
    check(wav_info(mono)[0] == 1, '降混为单声道')
    check(wav_info(mono)[2] == 1000, '降混后帧数不变')
    check(mono[:4] == b'RIFF' and mono[8:12] == b'WAVE', 'RIFF/WAVE 标识保留')
    check(struct.unpack('<I', mono[4:8])[0] == len(mono) - 8, 'RIFF size 字段正确')

    padded = append_silence(mono, 0.5)
    check(wav_info(padded)[2] == 1000 + 12000, '尾部静音补齐帧数')
    check(to_mono(mono) == mono, '已单声道时幂等')

    import csv as _csv
    import io as _io
    line = {'clip': 'en0007', 'text': 'x', 'sec': 4.134, 'ja': 'あ', 'zh': '中',
            'en': 'Focus on the next step, not the whole mountain.'}
    row = _csv_row(line, 'en', 3.5)
    parsed = next(_csv.DictReader(_io.StringIO('clip,chapter,speaker_jp,japanese,chinese,english,sec\r\n' + row + '\r\n')))
    check(parsed['english'] == line['en'], '含逗号的英文台词可往返')
    check(parsed['sec'] == '3.500', 'sec 列格式')
    check(safe_stem('en0007') == 'en0007', 'ASCII clip 名保留')
    check(safe_stem('语音 01') == '01', '非 ASCII 名可安全回退')

    check(wav_info(append_silence(mono, 0))[2] == 1000, 'tail-pad=0 不补静音')

    print(f'\n自检通过（{checks} 项）。')
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args(argv=None):
    p = argparse.ArgumentParser(
        description='用开源语音模型（CosyVoice / GPT-SoVITS）生成 MoonPet 语音包',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument('--engine', choices=('cosyvoice', 'gpt-sovits'), default='cosyvoice')
    p.add_argument('--server', default=None,
                   help='引擎服务地址（默认 cosyvoice=:50000，gpt-sovits=:9880）')
    p.add_argument('--lang', choices=('zh', 'en', 'ja', 'both'), default='both',
                   help='要生成哪个语言的包；both = 中文 + 英文（默认）')
    p.add_argument('--csv', default=str(DEFAULT_CSV), help='台词表路径')
    p.add_argument('--out', default=None, help='输出目录（默认 ./voice-packs）')
    p.add_argument('--ref-audio', default=None, help='角色参考音频（5~15 秒最佳）')
    p.add_argument('--prompt-text', default=None, help='参考音频里说的那句话')
    p.add_argument('--prompt-lang', default='zh', choices=('zh', 'en', 'ja'),
                   help='参考音频的语言（gpt-sovits 用）')
    p.add_argument('--mode', default='zero_shot',
                   choices=('zero_shot', 'cross_lingual', 'sft'),
                   help='cosyvoice 推理模式；cross_lingual 不需要参考文本')
    p.add_argument('--spk', default='中文女', help='cosyvoice sft 模式的内置音色 id')
    p.add_argument('--speed', type=float, default=1.0, help='语速（gpt-sovits）')
    p.add_argument('--seed', type=int, default=-1, help='随机种子，-1 为随机')
    p.add_argument('--sample-steps', type=int, default=32, help='采样步数（gpt-sovits）')
    p.add_argument('--text-split', default='cut5', help='切句方式（gpt-sovits）')
    p.add_argument('--tail-pad', type=float, default=0.45,
                   help='每句尾部补的静音秒数，避免对话框闪退（默认 0.45）')
    p.add_argument('--delay', type=float, default=0.15, help='每句之间的间隔秒数')
    p.add_argument('--timeout', type=float, default=180.0, help='单次请求超时秒数')
    p.add_argument('--force', action='store_true', help='已存在的 wav 也重录')
    p.add_argument('--dry-run', action='store_true', help='只打印计划，不请求引擎')
    p.add_argument('--selftest', action='store_true',
                   help='自检脚本自身的音频处理逻辑（不需要引擎和模型）')
    args = p.parse_args(argv)

    if args.server is None:
        args.server = 'http://127.0.0.1:50000' if args.engine == 'cosyvoice' else 'http://127.0.0.1:9880'
    if args.out is None:
        args.out = str(Path.cwd() / 'voice-packs')
    args.allowed_rates = (16000, 22050, 24000, 32000, 44100, 48000)
    args.langs = ['zh', 'en'] if args.lang == 'both' else [args.lang]
    return args


def main(argv=None) -> int:
    args = parse_args(argv)
    if args.selftest:
        try:
            return selftest()
        except AssertionError as err:
            print(f'x 自检失败: {err}', file=sys.stderr)
            return 1

    bad = [l for l in args.langs if l not in ENGINE_LANGS[args.engine]]
    if bad:
        print(f'x {args.engine} 不支持: {", ".join(bad)}', file=sys.stderr)
        return 2

    out_dir = Path(args.out).expanduser().resolve()
    if out_dir.exists() and not out_dir.is_dir():
        print(f'x --out 不是目录: {out_dir}', file=sys.stderr)
        return 2
    if not args.dry_run:
        out_dir.mkdir(parents=True, exist_ok=True)

    try:
        engine = None if args.dry_run else build_engine(args)
    except GenError as err:
        print(f'x {err}', file=sys.stderr)
        return 2

    print(f'引擎   : {args.engine} @ {args.server}')
    if engine:
        print(f'音色   : {engine.describe()}')
    print(f'输出   : {out_dir}')
    print(f'语言   : {", ".join(args.langs)}')

    exit_code = 0
    for lang in args.langs:
        try:
            lines = read_lines(Path(args.csv).expanduser(), TEXT_COLUMN[lang])
        except GenError as err:
            print(f'x {err}', file=sys.stderr)
            return 2
        print(f'\n[{lang}] {len(lines)} 句 -> {PACK_NAMES[lang]}/voices/')
        if args.dry_run:
            for line in lines:
                sec = line['sec']
                print(f'  - {safe_stem(line["clip"])}{OUTPUT_EXT}  '
                      f'{"?" if sec is None else sec}s  {line["text"][:40]}')
            continue

        try:
            written, failed = write_pack(out_dir, lang, lines, engine, args)
        except GenError as err:
            print(f'x {err}', file=sys.stderr)
            return 2
        print(f'  完成: 成功 {written}，失败 {failed}')
        if failed:
            exit_code = 4
            print('  提示: 失败的句子没有音频，但已保留在 script.csv 里；'
                  '修好引擎参数后重跑本脚本即可补录。', file=sys.stderr)

    if exit_code == 0 and not args.dry_run:
        print('\n下一步:')
        for lang in args.langs:
            print(f'  把 {out_dir / PACK_NAMES[lang]} 复制到 ~/.dsh/dsh-moonpet/packs/')
        print('  然后刷新页面，在「字幕与资源 → 语音包」里选择。')
    return exit_code


if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print('\n已中断。', file=sys.stderr)
        sys.exit(130)
    except GenError as err:
        print(f'x {err}', file=sys.stderr)
        sys.exit(2)
