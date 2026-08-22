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
OUT = os.path.abspath(os.path.join(HERE, "..", "src", "assets", "img"))

# Palette mirrors the CSS custom properties in src/assets/css/critical.css.
NAVY = (15, 42, 67)        # --navy-900
NAVY_LINE = (47, 74, 102)  # --line-on-navy
WHITE = (255, 255, 255)
TEXT_ON_NAVY = (255, 255, 255)
MUTED_ON_NAVY = (198, 211, 224)  # --text-on-navy-muted
ACCENT = (31, 95, 139)     # --accent
ACCENT_LIGHT = (137, 178, 209)
INK = (22, 32, 43)         # --gray-900

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


def draw_mark(img, x, y, box, radius, bar_width):
    """The Intellivra bar mark: a white tile with navy bars."""
    tile = Image.new("RGBA", (box, box), (0, 0, 0, 0))
    ImageDraw.Draw(tile).rounded_rectangle([0, 0, box - 1, box - 1], radius=radius, fill=WHITE + (255,))
    img.alpha_composite(tile, (x, y))

    draw = ImageDraw.Draw(img)
    u = box / 32.0
    for cx, top, bottom in ((10, 13, 22), (16, 17, 22), (22, 10, 22)):
        draw.line(
            [(x + cx * u, y + top * u), (x + cx * u, y + bottom * u)],
            fill=NAVY + (255,),
            width=max(2, int(bar_width * u)),
        )


def build_og():
    """Navy card with white type and a single accent rule - no gradients."""
    W, H = 1200, 630
    img = Image.new("RGBA", (W, H), NAVY + (255,))
    draw = ImageDraw.Draw(img)

    # Restrained structure: one hairline grid, no glows.
    for x in (80, 1120):
        draw.line([(x, 0), (x, H)], fill=NAVY_LINE + (110,), width=1)
    draw.line([(0, 132), (W, 132)], fill=NAVY_LINE + (110,), width=1)
    draw.line([(0, 520), (W, 520)], fill=NAVY_LINE + (110,), width=1)

    # Lockup: white rounded mark with navy bars.
    draw_mark(img, 80, 56, 52, 11, 4.5)
    f_brand_b = find_font(BOLD_CANDIDATES, 27)
    f_brand_r = find_font(REGULAR_CANDIDATES, 27)
    draw.text((148, 65), "Intellivra ", font=f_brand_b, fill=TEXT_ON_NAVY)
    draw.text((148 + draw.textlength("Intellivra ", font=f_brand_b), 65), "Global",
              font=f_brand_r, fill=MUTED_ON_NAVY)

    # Headline.
    f_head = find_font(BOLD_CANDIDATES, 60)
    draw.text((80, 214), HEADLINE_1, font=f_head, fill=TEXT_ON_NAVY)
    draw.text((80, 288), HEADLINE_2, font=f_head, fill=TEXT_ON_NAVY)

    # The one accent: a short rule under the headline.
    draw.rectangle([80, 382, 176, 386], fill=ACCENT_LIGHT)

    f_sub = find_font(REGULAR_CANDIDATES, 25)
    draw.text((80, 414), SUBLINE, font=f_sub, fill=MUTED_ON_NAVY)

    # Service pills as plain separated labels.
    f_pill = find_font(REGULAR_CANDIDATES, 19)
    x = 80
    for i, label in enumerate(PILLS):
        if i:
            draw.text((x - 26, 556), "/", font=f_pill, fill=NAVY_LINE)
        draw.text((x, 556), label, font=f_pill, fill=MUTED_ON_NAVY)
        x += int(draw.textlength(label, font=f_pill)) + 52

    f_domain = find_font(SEMI_CANDIDATES, 21)
    draw.text((80, 152), DOMAIN, font=f_domain, fill=ACCENT_LIGHT)

    path = os.path.join(OUT, "og-image.png")
    img.convert("RGB").save(path, "PNG", optimize=True)
    print("wrote", path, os.path.getsize(path), "bytes")


def build_icon(size, filename, pad_ratio, radius_ratio):
    """App icon: navy field, white mark - the inverse of the OG lockup."""
    img = Image.new("RGBA", (size, size), NAVY + (255,))
    pad = int(size * pad_ratio)
    box = size - pad * 2
    draw_mark(img, pad, pad, box, int(box * radius_ratio), 4.5)
    path = os.path.join(OUT, filename)
    img.convert("RGB").save(path, "PNG", optimize=True)
    print("wrote", path, os.path.getsize(path), "bytes")


if __name__ == "__main__":
    build_og()
    build_icon(180, "apple-touch-icon.png", 0.10, 0.27)
    build_icon(32, "favicon-32.png", 0.06, 0.27)
