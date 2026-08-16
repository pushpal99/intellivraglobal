#!/usr/bin/env python
"""Render the raster brand assets for intellivraglobal.com.

Outputs (all into ../assets/img):
  og-image.png        1200x630 Open Graph / Twitter card
  apple-touch-icon.png  180x180 iOS home-screen icon
  favicon-32.png         32x32 legacy favicon fallback

The SVG sources are og-image.svg and favicon.svg; this script is the raster
step. Re-run it after changing the brand colours or the OG headline:

    python tools/make-images.py

Requires Pillow (pip install pillow). No other dependency.
"""

import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "assets", "img"))

BG = (7, 11, 20)
LINE = (27, 36, 56)
TEXT = (232, 237, 249)
MUTED = (166, 177, 203)
DIM = (124, 136, 164)
ACCENT = (108, 140, 255)
ACCENT_TEXT = (157, 178, 255)
CYAN = (103, 232, 249)
INK = (5, 7, 14)

HEADLINE_1 = "IT staffing and consulting"
HEADLINE_2 = "for teams that ship."
SUBLINE = "Pre-vetted engineering talent, delivered in days."
PILLS = ["Staff augmentation", "AI & data engineering", "Cloud & DevOps"]
DOMAIN = "intellivraglobal.com"

FONT_DIRS = [
    r"C:\Windows\Fonts",
    "/usr/share/fonts/truetype/dejavu",
    "/Library/Fonts",
]
BOLD_CANDIDATES = ["Inter-Bold.ttf", "segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"]
REGULAR_CANDIDATES = ["Inter-Regular.ttf", "segoeui.ttf", "arial.ttf", "DejaVuSans.ttf"]
SEMI_CANDIDATES = ["Inter-SemiBold.ttf", "seguisb.ttf", "segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"]


def find_font(candidates, size):
    for directory in FONT_DIRS:
        for name in candidates:
            path = os.path.join(directory, name)
            if os.path.exists(path):
                return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def radial_glow(size, center, radius, colour, max_alpha):
    """A soft radial wash, drawn as concentric circles on an alpha mask."""
    w, h = size
    layer = Image.new("RGBA", size, colour + (0,))
    draw = ImageDraw.Draw(layer)
    steps = 90
    for i in range(steps, 0, -1):
        r = radius * i / steps
        alpha = int(max_alpha * (1 - i / steps) ** 2)
        draw.ellipse(
            [center[0] - r, center[1] - r, center[0] + r, center[1] + r],
            fill=colour + (alpha,),
        )
    return layer


def rounded_gradient(size, radius, start, end):
    """A rounded rectangle filled with a diagonal two-stop gradient."""
    w, h = size
    grad = Image.new("RGB", size)
    px = grad.load()
    for y in range(h):
        for x in range(w):
            t = (x / max(w - 1, 1) + y / max(h - 1, 1)) / 2
            px[x, y] = tuple(int(start[i] + (end[i] - start[i]) * t) for i in range(3))
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=255)
    grad.putalpha(mask)
    return grad


def draw_mark(img, x, y, box, radius, bar_width):
    """The Intellivra bar-graph monogram."""
    mark = rounded_gradient((box, box), radius, ACCENT, (34, 211, 238))
    img.alpha_composite(mark, (x, y))
    draw = ImageDraw.Draw(img)
    u = box / 64.0
    bars = [(20, 22, 42), (29, 30, 42), (38, 18, 42), (46, 27, 42)]
    for cx, top, bottom in bars:
        draw.line(
            [(x + cx * u, y + top * u), (x + cx * u, y + bottom * u)],
            fill=INK + (225,),
            width=max(2, int(bar_width * u)),
        )


def build_og():
    W, H = 1200, 630
    img = Image.new("RGBA", (W, H), BG + (255,))

    img.alpha_composite(radial_glow((W, H), (985, 30), 620, ACCENT, 108))
    img.alpha_composite(radial_glow((W, H), (60, 600), 520, (34, 211, 238), 58))

    draw = ImageDraw.Draw(img)
    for y in (158, 315, 472):
        draw.line([(0, y), (W, y)], fill=LINE + (170,), width=1)
    for x in (300, 600, 900):
        draw.line([(x, 0), (x, H)], fill=LINE + (170,), width=1)

    # Concentric talent-network graphic on the right.
    cx, cy = 950, 296
    for r, colour in ((140, (27, 36, 56)), (98, (34, 49, 79)), (56, (42, 53, 80))):
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=colour, width=2)
    nodes = [(0, -140, 7, ACCENT_TEXT), (121, 70, 7, ACCENT_TEXT), (-121, 70, 7, ACCENT_TEXT),
             (69, -69, 5, CYAN), (-88, -42, 5, CYAN), (28, 98, 5, CYAN)]
    for dx, dy, r, colour in nodes:
        draw.line([(cx, cy), (cx + dx, cy + dy)], fill=(51, 65, 92), width=1)
    for dx, dy, r, colour in nodes:
        draw.ellipse([cx + dx - r, cy + dy - r, cx + dx + r, cy + dy + r], fill=colour)
    draw.ellipse([cx - 15, cy - 15, cx + 15, cy + 15], fill=ACCENT)

    # Lockup.
    draw_mark(img, 80, 78, 64, 18, 5)
    f_brand_b = find_font(BOLD_CANDIDATES, 32)
    f_brand_r = find_font(REGULAR_CANDIDATES, 32)
    draw.text((166, 90), "Intellivra ", font=f_brand_b, fill=TEXT)
    draw.text((166 + draw.textlength("Intellivra ", font=f_brand_b), 90), "Global", font=f_brand_r, fill=ACCENT_TEXT)

    # Headline.
    f_head = find_font(BOLD_CANDIDATES, 60)
    draw.text((80, 242), HEADLINE_1, font=f_head, fill=TEXT)
    draw.text((80, 318), HEADLINE_2, font=f_head, fill=ACCENT_TEXT)

    f_sub = find_font(REGULAR_CANDIDATES, 27)
    draw.text((80, 420), SUBLINE, font=f_sub, fill=MUTED)

    # Service pills.
    f_pill = find_font(REGULAR_CANDIDATES, 20)
    x = 80
    for label in PILLS:
        draw.ellipse([x, 506, x + 10, 516], fill=ACCENT)
        draw.text((x + 22, 500), label, font=f_pill, fill=DIM)
        x += int(draw.textlength(label, font=f_pill)) + 62

    f_domain = find_font(SEMI_CANDIDATES, 22)
    draw.text((80, 562), DOMAIN, font=f_domain, fill=ACCENT_TEXT)

    path = os.path.join(OUT, "og-image.png")
    img.convert("RGB").save(path, "PNG", optimize=True)
    print("wrote", path, os.path.getsize(path), "bytes")


def build_icon(size, filename, pad_ratio, radius_ratio):
    img = Image.new("RGBA", (size, size), BG + (255,))
    pad = int(size * pad_ratio)
    box = size - pad * 2
    draw_mark(img, pad, pad, box, int(box * radius_ratio), 5)
    path = os.path.join(OUT, filename)
    img.convert("RGB").save(path, "PNG", optimize=True)
    print("wrote", path, os.path.getsize(path), "bytes")


if __name__ == "__main__":
    build_og()
    build_icon(180, "apple-touch-icon.png", 0.10, 0.27)
    build_icon(32, "favicon-32.png", 0.06, 0.27)
