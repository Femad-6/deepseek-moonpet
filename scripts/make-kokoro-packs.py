#!/usr/bin/env python3
"""Generate six optional MoonPet voice packs locally with Kokoro v1.1-zh.

Generation dependencies are isolated from the plugin. No online TTS is used.
See docs/voices.md for the model download, environment and license details.
"""
import argparse
import csv
import hashlib
import json
import os
from pathlib import Path

os.environ['USE_TF'] = '0'
os.environ['USE_FLAX'] = '0'

ROOT = Path(__file__).resolve().parents[1]
REPO = 'hexgrad/Kokoro-82M-v1.1-zh'
REVISION = '01e7505bd6a7a2ac4975463114c3a7650a9f7218'
MODEL_SHA256 = 'b1d8410fa44dfb5c15471fd6c4225ea6b4e9ac7fa03c98e8bea47a9928476e2b'
RATE = 24000
PACKS = [
    ('kokoro-zh-female-001', '清柔女声 · 中文鼓励', 'zf_001', 'z', 'chinese', 1.0),
    ('kokoro-zh-female-017', '明亮女声 · 中文鼓励', 'zf_017', 'z', 'chinese', 1.02),
    ('kokoro-zh-male-010', '沉稳男声 · 中文鼓励', 'zm_010', 'z', 'chinese', 1.0),
    ('kokoro-zh-male-037', '清朗男声 · 中文鼓励', 'zm_037', 'z', 'chinese', 1.02),
    ('kokoro-en-maple', 'Maple · 美式英文鼓励', 'af_maple', 'a', 'english', 0.95),
    ('kokoro-en-vale', 'Vale · 英式英文鼓励', 'bf_vale', 'b', 'english', 0.95),
]


def digest(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model-dir', type=Path, required=True)
    parser.add_argument('--out', type=Path, default=ROOT / 'voice-packs/kokoro-20261024')
    parser.add_argument('--audition', action='store_true', help='Generate only the first line of each voice')
    args = parser.parse_args()
    with (ROOT / 'docs/motivational-subtitles.csv').open(encoding='utf-8-sig', newline='') as file:
        reader = csv.DictReader(file)
        fields, lines = reader.fieldnames, list(reader)
    assert len(lines) == 25 and len({row['clip'] for row in lines}) == 25
    assert all(row[key].strip() for row in lines for key in ('japanese', 'chinese', 'english'))
    assert digest(args.model_dir / 'kokoro-v1_1-zh.pth') == MODEL_SHA256, 'Unexpected model weights'

    import numpy as np
    import soundfile as sf
    import torch
    import espeakng_loader
    os.environ['PHONEMIZER_ESPEAK_LIBRARY'] = espeakng_loader.get_library_path()
    os.environ['ESPEAK_DATA_PATH'] = espeakng_loader.get_data_path()
    espeakng_loader.make_library_available()
    from kokoro import KModel, KPipeline

    torch.set_num_threads(4)
    torch.manual_seed(20261024)
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f'Loading pinned model on {device}', flush=True)
    model = KModel(repo_id=REPO, config=str(args.model_dir / 'config.json'),
                   model=str(args.model_dir / 'kokoro-v1_1-zh.pth')).to(device).eval()
    pipelines = {}
    selected = lines[:1] if args.audition else lines
    args.out.mkdir(parents=True, exist_ok=True)
    for pack_id, display, voice, lang, column, speed in PACKS:
        pack = args.out / pack_id
        voices = pack / 'voices'
        voices.mkdir(parents=True, exist_ok=True)
        manifest_path = pack / 'generation.json'
        manifest = {'model': REPO, 'revision': REVISION, 'modelSha256': MODEL_SHA256,
                    'voice': voice, 'speed': speed, 'device': device, 'seed': 20261024,
                    'catalogueSha256': digest(ROOT / 'docs/motivational-subtitles.csv'),
                    'sampleRate': RATE, 'tailPadSeconds': 0.45, 'clips': []}
        if manifest_path.exists():
            previous = json.loads(manifest_path.read_text(encoding='utf-8'))
            for key in ('modelSha256', 'voice', 'speed', 'catalogueSha256'):
                assert previous[key] == manifest[key], f'{pack_id}: existing generation differs'
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        if lang not in pipelines:
            # All Chinese lines contain only Chinese; an English fallback is unnecessary.
            pipelines[lang] = KPipeline(lang_code=lang, repo_id=REPO, model=model)
        pipeline = pipelines[lang]
        voice_tensor = torch.load(args.model_dir / 'voices' / f'{voice}.pt', weights_only=True, map_location='cpu')
        rows = []
        for index, source in enumerate(selected, 1):
            row = dict(source)
            target = voices / f"{row['clip']}.wav"
            if target.exists():
                samples, rate = sf.read(target, dtype='float32')
                assert rate == RATE and samples.ndim == 1
            else:
                with torch.inference_mode():
                    chunks = [result.audio.cpu().numpy() for result in pipeline(
                        row[column], voice=voice_tensor, speed=speed, split_pattern=None)]
                assert chunks, f"No audio: {pack_id}/{row['clip']}"
                samples = np.concatenate(chunks)
                peak = float(np.abs(samples).max())
                if peak > 0.98:
                    samples = samples * (0.98 / peak)
                samples = np.concatenate([samples, np.zeros(round(RATE * 0.45), dtype='float32')])
                sf.write(target, samples, RATE, subtype='PCM_16')
            samples, rate = sf.read(target, dtype='float32')
            assert samples.ndim == 1 and 1 < len(samples) / rate < 30
            assert float(np.sqrt(np.mean(samples ** 2))) > 0.001, 'Audio is silent'
            assert not np.any(samples[-round(RATE * 0.45):]), 'Missing tail silence'
            row['sec'] = f'{len(samples) / rate:.3f}'
            rows.append(row)
            manifest['clips'].append({'file': target.name, 'sha256': digest(target), 'seconds': float(row['sec'])})
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            print(f"{pack_id} {index}/{len(selected)} {row['sec']}s", flush=True)
        with (pack / 'script.csv').open('w', encoding='utf-8', newline='') as file:
            writer = csv.DictWriter(file, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)
        (pack / 'pack.json').write_text(json.dumps({
            'id': pack_id, 'displayName': display,
            'description': f'{len(rows)} 句陪伴与鼓励；Kokoro v1.1-zh 原生音色 {voice}；完整中英日字幕；非角色音色克隆。',
            'audioLanguage': {'z': 'zh-CN', 'a': 'en-US', 'b': 'en-GB'}[lang],
            'voiceProvider': f'{REPO}/{voice}',
        }, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        (pack / 'SOURCE.md').write_text(
            f'# Voice provenance\n\nGenerated locally with Kokoro 0.9.4 and Misaki 0.9.4.\n'
            f'Model: https://huggingface.co/{REPO}/tree/{REVISION}\n\n'
            f'Model license: Apache-2.0. Voice: `{voice}`. No voice cloning.\n'
            'Original MoonPet motivational text, with Chinese, English and Japanese subtitles.\n'
            'Only the listed audio language is spoken. See generation.json for hashes and settings.\n'
            'Audio style names are descriptive labels, not guarantees of acted emotions.\n', encoding='utf-8')
    print(f'COMPLETE: {len(PACKS)} packs, {len(PACKS) * len(selected)} clips: {args.out}', flush=True)


if __name__ == '__main__':
    main()
