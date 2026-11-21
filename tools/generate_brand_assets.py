#!/usr/bin/env python3
"""
PKPilot0015 · Mynda Ljósa — HD2Lab brand asset generator (Soft Iris)
====================================================================
Produces the official HD2Lab asset set for Mynda Ljósa out of the same
dual-skew mark the app header draws:

    favicon.svg, favicon.ico (16/32/48), favicon-32x32.png,
    apple-touch-icon.png (180), icon-192.png, icon-512.png,
    manifest.json,
    og-image.png / social-preview.png (1200×630)

    python3 tools/generate_brand_assets.py [--font PATH] [--out DIR]
"""

from __future__ import annotations

import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public")

BG = "#F7F4FD"
CARD = "#FFFFFF"
GRID = "#ECE6F8"
INK = "#241C35"
MUTED = "#6F6584"
ACCENT = "#7C5CD6"
ACCENT_2 = "#C9A6E8"
PLUM = "#8D6C80"

FONT_CANDIDATES = [
    os.environ.get("PICKLE_BRAND_FONT", ""),
    "/workspace/tmp-fonts/NotoSansKR-VF.ttf",
    os.path.join(ROOT, "..", "..", "tmp-fonts", "NotoSansKR-VF.ttf"),
    "/usr/share/fonts/truetype/noto/NotoSansKR-VF.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansKR-Regular.otf",
    "/usr/share/fonts/pickle-hwp/NotoSansCJKkr-Regular.otf",
]
MONO_CANDIDATES = [
    "/usr/share/fonts/pickle-hwp/NotoSansMonoCJKkr-Regular.otf",
    "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
]

_font_cache: dict = {}
FONT_PATH = next((p for p in FONT_CANDIDATES if p and os.path.exists(p)), None)
MONO_PATH = next((p for p in MONO_CANDIDATES if p and os.path.exists(p)), None)


def font(size: int):
    key = ("sans", size)
    if key not in _font_cache:
        if not FONT_PATH:
            raise SystemExit("한글 폰트를 찾지 못했습니다. --font 로 지정해 주세요.")
        _font_cache[key] = ImageFont.truetype(FONT_PATH, size)
    return _font_cache[key]


def mono(size: int):
    key = ("mono", size)
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(MONO_PATH or FONT_PATH, size)
    return _font_cache[key]


def spaced(d: ImageDraw.ImageDraw, xy, text: str, f, fill, spacing: float = 0.0, anchor: str | None = None):
    if anchor:
        width = sum(d.textlength(ch, font=f) for ch in text) + spacing * max(0, len(text) - 1)
        x, y = xy
        if anchor.endswith("s"):
            y = y - 0
        if anchor.startswith("m"):
            x = x - width / 2
        elif anchor.startswith("r"):
            x = x - width
        xy = (x, y)
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=f, fill=fill)
        x += d.textlength(ch, font=f) + spacing


def gradient(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    top = (124, 92, 214)
    bottom = (201, 166, 232)
    for y in range(size):
        t = y / max(1, size - 1)
        color = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        ImageDraw.Draw(img).line([(0, y), (size, y)], fill=color + (255,))
    return img


def mark(size: int) -> Image.Image:
    """Rounded gradient tile with the two skewed bars of the HD2Lab mark."""
    scale = 4
    big = size * scale
    tile = gradient(big)
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, big - 1, big - 1], radius=int(big * 0.28), fill=255)
    tile.putalpha(mask)
    d = ImageDraw.Draw(tile)
    w = int(big * 0.085)
    for x0, alpha in ((0.34, 255), (0.525, 150)):
        x = big * x0
        d.line(
            [(x + big * 0.075, big * 0.27), (x - big * 0.035, big * 0.73)],
            fill=(255, 255, 255, alpha), width=w,
        )
    return tile.resize((size, size), Image.LANCZOS)


def write_icon(path: str, size: int):
    mark(size).save(path)


def build_favicon_svg(path: str):
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="HD2Lab Mynda Ljósa">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7C5CD6"/>
      <stop offset="1" stop-color="#C9A6E8"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="18" fill="url(#g)"/>
  <path d="M26 46 L34 18" stroke="#ffffff" stroke-width="5.4" stroke-linecap="round"/>
  <path d="M38 46 L46 18" stroke="#ffffff" stroke-width="5.4" stroke-linecap="round" opacity="0.6"/>
</svg>
"""
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(svg)


def build_og(path: str):
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    for x in range(0, W, 40):
        d.line([(x, 0), (x, H)], fill=GRID, width=1)
    for y in range(0, H, 40):
        d.line([(0, y), (W, y)], fill=GRID, width=1)

    d.rounded_rectangle([56, 48, W - 56, H - 48], radius=28, fill=CARD, outline="#E7DFF5", width=2)

    # header rail
    tile = mark(46)
    img.paste(tile, (96, 92), tile)
    spaced(d, (158, 126), "HD2LAB", font(20), INK, spacing=4)
    spaced(d, (96, 168), "FRAME STUDIO · SHUTTERFRAME/V1", mono(14), MUTED, spacing=2.6)
    spaced(d, (W - 96, 126), "LOCAL ONLY · 0 B UPLOAD", mono(14), MUTED, spacing=2.2, anchor="r")

    # title
    d.text((96, 250), "Mynda Ljósa", font=font(78), fill=INK)
    d.text((96, 350), "커스텀 4컷 프레임 스튜디오", font=font(36), fill=ACCENT)
    d.text(
        (96, 410),
        "사진 네 장을 한 장으로. 브라우저에서 디자인하고 Shutterplate · Nordlys에서 그대로 인화합니다.",
        font=font(21), fill=MUTED,
    )
    spaced(d, (96, 462), "MYNDA LJÓSA  →  SHUTTERPLATE  ·  NORDLYS", mono(17), PLUM, spacing=2.4)

    # three frame previews on the right
    def preview(x: int, y: int, w: int, h: int, bg: str, cells: list, border: str | None = None, perf: bool = False):
        d.rounded_rectangle([x, y, x + w, y + h], radius=8, fill=bg, outline=border or "#E7DFF5", width=2)
        if perf:
            hole = 5
            for yy in range(y + 8, y + h - 8, 16):
                for xx in (x + 5, x + w - 5):
                    d.rounded_rectangle([xx - hole // 2, yy, xx + hole // 2, yy + hole], radius=2, fill="#F3EEE4")
        for cx, cy, cw, chh, color in cells:
            d.rounded_rectangle([x + cx, y + cy, x + cx + cw, y + cy + chh], radius=3, fill=color)

    dawn = ["#F7D9C4", "#E7B8A3"]
    preview(760, 200, 118, 348, "#F4F1EA", [
        (10, 16, 98, 74, dawn[1]), (10, 98, 98, 74, "#B48A86"),
        (10, 180, 98, 74, "#6D4F55"), (10, 262, 98, 74, "#C9A29B"),
    ])
    preview(898, 176, 200, 268, "#FFFFFF", [
        (14, 14, 82, 112, "#CDDCEC"), (104, 14, 82, 112, "#9FB7CB"),
        (14, 142, 82, 112, "#DCE7F2"), (104, 142, 82, 112, "#7F97A8"),
    ])
    preview(1010, 250, 94, 298, "#121110", [
        (12, 14, 70, 56, "#3B4A66"), (12, 82, 70, 56, "#2C3850"),
        (12, 150, 70, 56, "#4A3F5C"), (12, 218, 70, 56, "#1F2A3C"),
    ], border="#2C2547", perf=True)

    # footer rail
    d.line([(96, 528), (W - 96, 528)], fill="#E7DFF5", width=2)
    spaced(d, (96, 560), "SHUTTERFRAME/V1  ·  LZ-STRING SHARE  ·  INDEXEDDB LIBRARY  ·  HD2LAB.STUDIO", mono(13), MUTED, spacing=1.6)
    spaced(d, (W - 96, 560), "100% IN-BROWSER", mono(13), ACCENT, spacing=2.4, anchor="r")

    img.save(path, optimize=True)


def main():
    global OUT
    args = sys.argv[1:]
    if "--out" in args:
        OUT = args[args.index("--out") + 1]
    if "--font" in args:
        global FONT_PATH
        FONT_PATH = args[args.index("--font") + 1]
    os.makedirs(OUT, exist_ok=True)

    write_icon(os.path.join(OUT, "favicon-32x32.png"), 32)
    write_icon(os.path.join(OUT, "apple-touch-icon.png"), 180)
    write_icon(os.path.join(OUT, "icon-192.png"), 192)
    write_icon(os.path.join(OUT, "icon-512.png"), 512)

    ico = mark(48)
    ico.save(os.path.join(OUT, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])

    build_favicon_svg(os.path.join(OUT, "favicon.svg"))
    build_og(os.path.join(OUT, "og-image.png"))
    build_og(os.path.join(OUT, "social-preview.png"))

    manifest = {
        "name": "Mynda Ljósa — HD2Lab Frame Studio",
        "short_name": "Mynda Ljósa",
        "description": "HD2Lab의 커스텀 4컷 프레임 스튜디오. Shutterplate와 Nordlys가 읽는 .shutterframe.json을 브라우저에서 디자인합니다.",
        "lang": "ko",
        "start_url": "/PKPilot0015/",
        "scope": "/PKPilot0015/",
        "display": "standalone",
        "orientation": "any",
        "background_color": "#F7F4FD",
        "theme_color": "#7C5CD6",
        "categories": ["photo", "design", "productivity"],
        "icons": [
            {"src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
            {"src": "favicon.svg", "sizes": "any", "type": "image/svg+xml"},
        ],
    }
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    for name in sorted(os.listdir(OUT)):
        size = os.path.getsize(os.path.join(OUT, name))
        print(f"{name:24s} {size:>8,d} B")


if __name__ == "__main__":
    main()
