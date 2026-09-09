"""Measure native exported fixtures in document pixels. Requires Pillow; does not modify PNGs."""
import json
from collections import Counter
from pathlib import Path

from PIL import Image


def main():
    """Save painted bounds and visible component counts; overlapping stamps merge into one component."""
    root = Path(__file__).resolve().parents[1] / 'fixtures/photoshop-wet-blender'
    cases = {}
    for name in ['tip', 'scatter100', 'scatter208', 'smudge']:
        image = Image.open(root / f'{name}.png').convert('RGB')
        source = (Image.open(root / 'source.png').convert('RGB') if name == 'smudge'
                  else Image.new('RGB', image.size, 'white'))
        points = [(i % image.width, i // image.width)
                  for i, (a, b) in enumerate(zip(image.get_flattened_data(), source.get_flattened_data()))
                  if max(abs(x - y) for x, y in zip(a, b)) > 4]
        bounds = [min(p[0] for p in points), min(p[1] for p in points),
                  max(p[0] for p in points) + 1, max(p[1] for p in points) + 1]
        cases[name] = {'bounds': bounds, 'width': bounds[2] - bounds[0]}
    counts = {}
    for name in ['count-jitter1', 'count-jitter50', 'count-jitter100']:
        image = Image.open(root / f'{name}.png').convert('L')
        components, areas = [], []
        for x in range(128, 16129, 100):
            rows = [any(image.getpixel((cx, y)) < 128 for cx in range(x - 8, x + 8)) for y in range(256)]
            components.append(sum(value and (i == 0 or not rows[i - 1]) for i, value in enumerate(rows)))
            areas.append(sum(image.getpixel((cx, y)) < 128 for cx in range(x - 8, x + 8) for y in range(256)))
        counts[name] = {'visibleComponents': dict(sorted(Counter(components).items())),
                        'meanBlackPixelArea': sum(areas) / len(areas)}
    result = {'photoshop': '2025 26.0.0', 'size': [768, 1024], 'path': [[384, 128], [384, 896]],
              'simulatePressure': False, 'threshold': 'max absolute RGB difference > 4', 'cases': cases,
              'countProbes': {'size': [16384, 256], 'path': [[128, 128], [16128, 128]],
                              'note': 'Connected components undercount stamps when circles overlap.', 'cases': counts}}
    (root / 'measurements.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
