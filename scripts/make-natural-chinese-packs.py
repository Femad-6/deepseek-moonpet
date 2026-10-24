#!/usr/bin/env python3
"""Regenerate four Chinese MoonPet packs with Qwen3-TTS style instructions.

Only the existing pack IDs are retained for configuration compatibility.
Audio is generated locally; English packs and installed files are not changed.
"""
import argparse
import csv
import hashlib
import json
import os
import time
from pathlib import Path

os.environ['USE_TF'] = '0'
os.environ['USE_FLAX'] = '0'
ROOT = Path(__file__).resolve().parents[1]
MODEL = 'Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice'
REVISION = '0c0e3051f131929182e2c023b9537f8b1c68adfe'
PACKS = [
    ('kokoro-zh-female-001', '清柔女声 · 中文鼓励', 'Serena', '声音温柔亲切、松弛，像贴心朋友坐在身边轻声鼓励。'),
    ('kokoro-zh-female-017', '明亮女声 · 中文鼓励', 'Vivian', '声音明亮而柔和，带着轻轻的微笑，亲切地轻声鼓励。'),
    ('kokoro-zh-male-010', '沉稳男声 · 中文鼓励', 'Uncle_Fu', '声音低沉温暖、耐心，像可靠的朋友轻声安慰。'),
    ('kokoro-zh-male-037', '清朗男声 · 中文鼓励', 'Dylan', '声音清朗、亲切、放松，像年轻朋友温柔地轻声鼓励。'),
]
COMMON = '用轻柔自然的标准普通话，像在安静房间里陪伴朋友。音量偏轻，语速舒缓而清晰，有自然呼吸和语气起伏，短句之间从容停顿，句尾轻轻收住。'


def digest(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model-dir', type=Path, required=True)
    parser.add_argument('--out', type=Path, default=ROOT / 'voice-packs/qwen-soft-20261024')
    parser.add_argument('--limit', type=int, default=25, choices=range(1, 26))
    parser.add_argument('--batch-size', type=int, default=4, choices=(1, 2, 4))
    args = parser.parse_args()
    catalogue = ROOT / 'docs/motivational-subtitles.csv'
    with catalogue.open(encoding='utf-8-sig', newline='') as file:
        reader = csv.DictReader(file)
        fields, lines = reader.fieldnames, list(reader)
    assert len(lines) == 25
    import numpy as np
    import soundfile as sf
    import torch
    from qwen_tts import Qwen3TTSModel
    torch.set_num_threads(4)
    if not torch.cuda.is_available():
        raise RuntimeError('This generation run requires the verified local GPU')
    started = time.monotonic()
    model = Qwen3TTSModel.from_pretrained(str(args.model_dir.resolve()),
        device_map='cuda:0', dtype=torch.bfloat16, attn_implementation='sdpa')
    print(f'Model ready in {time.monotonic()-started:.1f}s; speakers={model.get_supported_speakers()}', flush=True)
    weights_sha = digest(args.model_dir / 'model.safetensors')
    for pack_id, display, speaker, style in PACKS:
        pack = args.out / pack_id
        (pack / 'voices').mkdir(parents=True, exist_ok=True)
        instruction = style + COMMON
        manifest_path = pack / 'generation.json'
        manifest = {'model': MODEL, 'revision': REVISION, 'modelSha256': weights_sha,
            'voice': speaker, 'instruct': instruction, 'device': 'cuda',
            'catalogueSha256': digest(catalogue), 'sampleRate': 24000,
            'tailPadSeconds': 0.45, 'temperature': 0.7, 'topP': 0.9,
            'repetitionPenalty': 1.1, 'clips': []}
        clip_parameters = {}
        if manifest_path.exists():
            previous = json.loads(manifest_path.read_text(encoding='utf-8'))
            for key in ('modelSha256', 'voice', 'instruct', 'catalogueSha256'):
                assert previous[key] == manifest[key], f'Existing output differs: {pack_id}'
            clip_parameters = {clip['file']: {key:clip[key] for key in ('seed','batchSize')}
                               for clip in previous['clips']}
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
        for start in range(0, args.limit, args.batch_size):
            batch = [(offset + 1, source) for offset, source in enumerate(lines[start:start+args.batch_size], start)
                     if offset < args.limit and not (pack/'voices'/f"{source['clip']}.wav").exists()]
            if not batch:
                continue
            torch.manual_seed(20261024 + start)
            clip_start = time.monotonic()
            with torch.inference_mode():
                wavs, rate = model.generate_custom_voice(text=[source['chinese'] for _, source in batch],
                    language=['Chinese']*len(batch), speaker=[speaker]*len(batch),
                    instruct=[instruction]*len(batch), max_new_tokens=512, do_sample=True,
                    temperature=0.7, top_p=0.9, repetition_penalty=1.1)
            assert rate == 24000 and len(wavs) == len(batch)
            for (_, source), wav in zip(batch, wavs):
                samples = np.asarray(wav, dtype='float32')
                assert samples.ndim == 1 and np.isfinite(samples).all()
                assert 0.8 < len(samples)/rate < 25, f'Unexpected audio length: {pack_id}/{source["clip"]}'
                peak = float(np.abs(samples).max())
                if peak > 0.98:
                    samples = samples*(0.98/peak)
                samples = np.concatenate([samples, np.zeros(10800,dtype='float32')])
                sf.write(pack/'voices'/f"{source['clip']}.wav",samples,rate,subtype='PCM_16')
                clip_parameters[f"{source['clip']}.wav"] = {'seed':20261024+start,'batchSize':len(batch)}
            print(f'{pack_id} batch {start+1}-{start+len(batch)} generated in {time.monotonic()-clip_start:.1f}s',flush=True)
        rows = []
        for index, source in enumerate(lines[:args.limit], 1):
            row = dict(source)
            target = pack / 'voices' / f"{row['clip']}.wav"
            clip_start = time.monotonic()
            samples, rate = sf.read(target, dtype='float32')
            assert rate == 24000 and samples.ndim == 1
            assert 1 < len(samples)/rate < 30
            assert float(np.sqrt(np.mean(samples**2))) > 0.001
            assert not np.any(samples[-10800:])
            row['sec'] = f'{len(samples)/rate:.3f}'
            rows.append(row)
            manifest['clips'].append({'file':target.name, 'sha256':digest(target),
                'seconds':float(row['sec']), **clip_parameters[target.name]})
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
            print(f'{pack_id} {index}/{args.limit} audio={row["sec"]}s elapsed={time.monotonic()-clip_start:.1f}s', flush=True)
        with (pack/'script.csv').open('w',encoding='utf-8',newline='') as file:
            writer=csv.DictWriter(file,fieldnames=fields)
            writer.writeheader();writer.writerows(rows)
        (pack/'pack.json').write_text(json.dumps({'id':pack_id,'displayName':display,
            'description':f'{len(rows)} 句自然陪伴版；Qwen3-TTS 1.7B 原生音色 {speaker}；完整中英日字幕。',
            'audioLanguage':'zh-CN','voiceProvider':f'{MODEL}/{speaker}'},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        (pack/'SOURCE.md').write_text(f'# Natural Chinese voice revision\n\n'
            f'Model: https://huggingface.co/{MODEL}/tree/{REVISION}\n\n'
            f'Model license: Apache-2.0. Built-in speaker: {speaker}. No voice cloning.\n'
            f'Instruction: {instruction}\n\n'
            'The legacy kokoro-prefixed pack ID is retained only for saved-setting compatibility.\n'
            'Chinese audio was regenerated; the original 25 texts and trilingual subtitles are preserved.\n'
            'See generation.json for parameters and audio hashes.\n',encoding='utf-8')
    print(f'COMPLETE {4*args.limit} Chinese clips in {time.monotonic()-started:.1f}s',flush=True)


if __name__=='__main__':
    main()
