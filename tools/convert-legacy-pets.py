#!/usr/bin/env python3
"""旧原型宠物 GIF → 网页用动画 WebP（B 素材管线，2026-10-16）。

做什么
  只读 legacy/prototype/动物基础动作GIF/ 下 4 只宠物 × 7 个动作的 GIF，
  转成 apps/web/assets/pet-ui/pet-<kind>-<action>.webp：
  512×512 画布、透明底、最多 12 帧均匀抽样、83 ms/帧、无限循环、单文件 ≤300 KB。

为什么
  契约白名单只有 idle/happy/think/sleep/eat/roll/sad 七个动作，旧原型素材的动作名与之一一对应，
  所以直接复用旧素材、不重新找图（见 apps/web/DECISIONS.md 第 12/25 条）。
  源 GIF 单文件 0.8–4.7 MB，原样引用会拖垮首屏，必须转码。

运行
  python tools/convert-legacy-pets.py                # 默认只补另外 3 只（不动已验收的小狗）
  python tools/convert-legacy-pets.py --kinds dog    # 需要时才重跑小狗
  python tools/convert-legacy-pets.py --check --kinds dog,turtle,cat,sheep   # 只体检，不写盘
  python tools/convert-legacy-pets.py --favicon      # 顺手用贴图首帧生成 apps/web/favicon.png
依赖：Python 3.12 + Pillow（本机实测 Pillow 12.3.0，WebP 支持 ANIM 与 mux）。
只写 apps/web/assets/pet-ui/ 下的 pet-*.webp 与 apps/web/favicon.png，不碰 legacy/（只读）。
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parent.parent
SOURCE_ROOT = ROOT / 'legacy' / 'prototype' / '动物基础动作GIF'
OUT_DIR = ROOT / 'apps' / 'web' / 'assets' / 'pet-ui'
FAVICON_PATH = ROOT / 'apps' / 'web' / 'favicon.png'

# 宠物形象 → 源目录（目录名保持旧原型的原样，便于回溯）
KIND_SOURCE = {
    'dog': SOURCE_ROOT / '小狗和小龟GIF' / '小狗GIF',
    'turtle': SOURCE_ROOT / '小狗和小龟GIF' / '小龟GIF',
    'cat': SOURCE_ROOT / '小猫和小羊GIF' / '猫咪',
    'sheep': SOURCE_ROOT / '小猫和小羊GIF' / '小羊',
}
# 源 GIF 文件名（中文）→ 契约白名单动作名
ACTION_SOURCE = {
    'idle': '待机.GIF',
    'happy': '开心.GIF',
    'think': '思考.GIF',
    'sleep': '睡觉.GIF',
    'eat': '吃饭.GIF',
    'roll': '打滚.GIF',
    'sad': '伤心流泪.GIF',
}

# 已验收的小狗成品口径：512×512、12 帧、83 ms、底边基线 y=500
CANVAS = 512
BASELINE_Y = 500
FIT_WIDTH = 504
FRAME_MS = 83
SIZE_BUDGET = 300 * 1024
# 预算超了就沿这条梯度降：帧数、质量
LADDER = ((12, 70), (10, 65), (8, 60), (8, 52))
ALPHA_FLOOR = 8  # alpha 低于该值视为全透明（GIF 边缘常见 1–8 的噪声）


def load_frames(path: Path) -> list[Image.Image]:
    """读一个 GIF 的所有帧为 RGBA（Pillow 会按 disposal 处理帧叠加）。"""
    with Image.open(path) as image:
        return [frame.convert('RGBA') for frame in ImageSequence.Iterator(image)]


def alpha_mask(frame: Image.Image):
    return frame.getchannel('A').point(lambda value: 255 if value > ALPHA_FLOOR else 0)


def is_transparent(frames: list[Image.Image]) -> bool:
    """四角在每一帧都是透明的才算真透明底（与小狗素材的验收口径一致）。"""
    for frame in frames:
        alpha = frame.getchannel('A')
        width, height = frame.size
        for point in ((0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)):
            if alpha.getpixel(point) > 32:
                return False
    return True


def key_out_background(frames: list[Image.Image]) -> list[Image.Image]:
    """源图是不透明背景（少数动作）时，用四角颜色做色键抠底，容差 32。"""
    width, height = frames[0].size
    corners = [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)]
    keys = [frames[0].getpixel(point)[:3] for point in corners]
    key = max(set(keys), key=keys.count)
    tolerance = 32
    out = []
    for frame in frames:
        pixels = frame.load()
        for y in range(height):
            for x in range(width):
                red, green, blue, alpha = pixels[x, y]
                if alpha and abs(red - key[0]) + abs(green - key[1]) + abs(blue - key[2]) <= tolerance * 3:
                    pixels[x, y] = (red, green, blue, 0)
        out.append(frame)
    return out


def sample(frame_count: int, wanted: int) -> list[int]:
    """均匀抽样帧号（含首末帧），避免直接截断导致动画只播一半。"""
    if frame_count <= wanted:
        return list(range(frame_count))
    return sorted({round(index * (frame_count - 1) / (wanted - 1)) for index in range(wanted)})


def fit_frames(frames: list[Image.Image], canvas: int = CANVAS):
    """按全部抽样帧的并集包围盒缩放，再底边居中贴到固定基线：保留动作幅度（跳起/打滚）。"""
    box = None
    for frame in frames:
        current = alpha_mask(frame).getbbox()
        if current is None:
            continue
        box = current if box is None else (
            min(box[0], current[0]), min(box[1], current[1]),
            max(box[2], current[2]), max(box[3], current[3]),
        )
    if box is None:
        raise ValueError('整段都是透明像素，无法定位内容')
    cropped = [frame.crop(box) for frame in frames]
    content_w = box[2] - box[0]
    content_h = box[3] - box[1]
    scale = min(FIT_WIDTH / content_w, BASELINE_Y / content_h, canvas / max(content_w, content_h))
    target = (max(1, round(content_w * scale)), max(1, round(content_h * scale)))

    placed = []
    bottoms = []
    for frame in cropped:
        resized = frame.resize(target, Image.LANCZOS)
        tile = Image.new('RGBA', (canvas, canvas), (0, 0, 0, 0))
        left = (canvas - target[0]) // 2
        top = BASELINE_Y - target[1]
        tile.paste(resized, (left, top), resized)
        placed.append(tile)
        bottoms.append(min(BASELINE_Y, top + target[1]))
    return placed, box, target, bottoms


def encode(frames: list[Image.Image], path: Path, quality: int) -> int:
    """写动画 WebP：透明背景 + 无限循环 + method=6（压缩更慢但更小）。"""
    frames[0].save(
        path,
        format='WEBP',
        save_all=True,
        append_images=frames[1:],
        duration=FRAME_MS,
        loop=0,
        quality=quality,
        method=6,
        background=(0, 0, 0, 0),
    )
    return path.stat().st_size


def convert_one(kind: str, action: str) -> dict:
    """转一个动作；超预算就沿 LADDER 降帧数/质量，返回最后一次结果。"""
    source = KIND_SOURCE[kind] / ACTION_SOURCE[action]
    if not source.exists():
        raise FileNotFoundError(f'源 GIF 不存在：{source}')
    raw = load_frames(source)
    frames = raw if is_transparent(raw[:6]) else key_out_background(raw)

    result = None
    path = OUT_DIR / f'pet-{kind}-{action}.webp'
    for wanted, quality in LADDER:
        picked = [frames[index] for index in sample(len(frames), wanted)]
        placed, box, target, bottoms = fit_frames(picked)
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        size = encode(placed, path, quality)
        result = {
            'kind': kind, 'action': action, 'file': path.name,
            'source': source.relative_to(ROOT).as_posix(),
            'source_bytes': source.stat().st_size,
            'source_size': f'{raw[0].width}×{raw[0].height}',
            'source_frames': len(raw),
            'used_frames': len(picked),
            'quality': quality,
            'bytes': size,
            'box': box,
            'content': f'{target[0]}×{target[1]}',
            'baseline': f'{min(bottoms)}–{max(bottoms)}',
        }
        if size <= SIZE_BUDGET:
            break
    return result


def make_favicon(kind: str = 'dog', action: str = 'idle') -> dict:
    """从已转码的贴图首帧裁一张正方透明 PNG 作 favicon（浏览器标签页图标）。

    需求单里 favicon 的预算是 ≤50 KB，所以从大到小挑第一个达标的边长；
    源素材是同一张贴图，不算新素材，也不引入任何外部文件。
    """
    src = OUT_DIR / f'pet-{kind}-{action}.webp'
    with Image.open(src) as image:
        frame = image.convert('RGBA')
    box = alpha_mask(frame).getbbox() or (0, 0, frame.width, frame.height)
    cropped = frame.crop(box)
    side = max(cropped.size)
    square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    square.paste(cropped, ((side - cropped.width) // 2, (side - cropped.height) // 2), cropped)

    budget = 50 * 1024
    chosen = None
    for size in (512, 384, 256, 192, 128, 64, 32):
        icon = square.resize((size, size), Image.LANCZOS)
        icon.save(FAVICON_PATH, format='PNG', optimize=True)
        chosen = size
        if FAVICON_PATH.stat().st_size <= budget:
            break
        # 直存 RGBA 超预算时改用调色板量化（255 色 + 透明），通常能省一半以上，不必再降边长。
        try:
            icon.quantize(colors=255, method=Image.FASTOCTREE).save(FAVICON_PATH, format='PNG', optimize=True)
        except (ValueError, OSError):
            continue
        if FAVICON_PATH.stat().st_size <= budget:
            break
    return {'file': FAVICON_PATH.relative_to(ROOT).as_posix(), 'side': chosen,
            'bytes': FAVICON_PATH.stat().st_size}


def check_one(kind: str, action: str) -> dict:
    """体检已产出文件：画布、帧数、时长、单文件体积、四角是否真透明。"""
    path = OUT_DIR / f'pet-{kind}-{action}.webp'
    with Image.open(path) as image:
        rgba = image.convert('RGBA')
        info = {
            'file': path.name,
            'bytes': path.stat().st_size,
            'size': f'{image.width}×{image.height}',
            'animated': bool(getattr(image, 'is_animated', False)),
            'frames': getattr(image, 'n_frames', 1),
            'duration': image.info.get('duration'),
            'loop': image.info.get('loop'),
        }
        corners = ((0, 0), (image.width - 1, 0), (0, image.height - 1), (image.width - 1, image.height - 1))
        info['corner_alpha'] = [rgba.getpixel(point)[3] for point in corners]
        info['animated_block'] = b'ANIM' in path.read_bytes()[:4096]
    return info


def main() -> int:
    parser = argparse.ArgumentParser(description='旧原型宠物 GIF → 512×512 动画 WebP')
    parser.add_argument('--kinds', default='turtle,cat,sheep',
                        help='要转换的形象，逗号分隔（dog/turtle/cat/sheep），默认不重跑已验收的小狗')
    parser.add_argument('--check', action='store_true', help='只体检已产出文件，不写盘')
    parser.add_argument('--favicon', action='store_true', help='顺便用贴图首帧生成 apps/web/favicon.png')
    args = parser.parse_args()

    kinds = [kind.strip() for kind in args.kinds.split(',') if kind.strip()]
    for kind in kinds:
        if kind not in KIND_SOURCE:
            print(f'未知形象：{kind}', file=sys.stderr)
            return 2

    bad = 0
    for kind in kinds:
        for action in ACTION_SOURCE:
            if args.check:
                info = check_one(kind, action)
                ok = (info['bytes'] <= SIZE_BUDGET and info['size'] == f'{CANVAS}×{CANVAS}'
                      and info['animated'] and info['animated_block'] and set(info['corner_alpha']) == {0})
                bad += 0 if ok else 1
                print(f"[{'ok' if ok else 'BAD'}] {info}")
                continue
            report = convert_one(kind, action)
            within = report['bytes'] <= SIZE_BUDGET
            bad += 0 if within else 1
            print(f"[{'ok' if within else 'OVER'}] {report['file']}｜源 {report['source_size']} "
                  f"{report['source_frames']} 帧 {report['source_bytes'] / 1024 / 1024:.2f} MB → "
                  f"{report['bytes'] / 1024:.1f} KB（{report['used_frames']} 帧 q{report['quality']}，"
                  f"内容 {report['content']}，底边 {report['baseline']}）")
    print(f'共{len(kinds) * len(ACTION_SOURCE)} 个文件，不合规范 {bad} 个；输出目录 {OUT_DIR.relative_to(ROOT)}')
    if args.favicon:
        icon = make_favicon()
        print(f"[ok] {icon['file']}｜{icon['side']}×{icon['side']} {icon['bytes'] / 1024:.1f} KB（预算 50 KB）")
    return 0 if bad == 0 else 1


if __name__ == '__main__':
    raise SystemExit(main())
