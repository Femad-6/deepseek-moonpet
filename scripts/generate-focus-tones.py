"""Generate MoonPet's three original PCM reminder tones (Python standard library)."""
from pathlib import Path
import math
import struct
import wave

ROOT = Path(__file__).resolve().parents[1]
RATE = 22050
TONES = {
    'soft': [(0.0, 1.6, (261.63, 329.63, 392.0)), (1.8, 1.6, (293.66, 369.99, 440.0))],
    'digital': [(i * .32, .18, (660.0 if i % 2 == 0 else 880.0,)) for i in range(6)],
    'triple': [(i * .55, 1.0, (f, f * 2.01)) for i, f in enumerate((523.25, 659.25, 783.99))],
}

def generate():
    for name, notes in TONES.items():
        frames = []
        for n in range(int(4.0 * RATE)):
            t = n / RATE
            value = 0.0
            for start, duration, frequencies in notes:
                x = t - start
                if 0 <= x < duration:
                    envelope = min(1.0, x / .015) * min(1.0, (duration - x) / .08) * math.exp(-2.2 * x / duration)
                    value += envelope * sum(math.sin(2 * math.pi * f * x) for f in frequencies) / len(frequencies)
            frames.append(value)
        peak = max(abs(v) for v in frames) or 1.0
        data = b''.join(struct.pack('<h', round(v / peak * 19000)) for v in frames)
        with wave.open(str(ROOT / 'assets' / 'alerts' / (name + '.wav')), 'wb') as out:
            out.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
            out.writeframes(data)

if __name__ == '__main__':
    generate()
