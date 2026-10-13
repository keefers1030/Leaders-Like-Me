"""Build logo.svg, logo-dark.svg and favicon.svg with text converted to outlines.

    pip install fonttools
    python3 data/source/make_logo.py

Fonts (both SIL Open Font License) are in data/source/fonts.
"""
import os
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")
OUT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

montserrat = instantiateVariableFont(TTFont(os.path.join(HERE, "Montserrat.ttf")), {"wght": 300})
delius = TTFont(os.path.join(HERE, "Delius.ttf"))

PETAL = "M10 0C18 14 20 26 14 36c-4 5-10 4-12-2C0 26 4 12 10 0z"
COLORS = {"peach": "#f2a77d", "plum": "#c77bb4", "coral": "#e05a4c", "brown": "#c8845f"}


def text_path(font, text, size, tracking_em=0.02):
    """Return (svg path data at origin baseline, advance width)."""
    upm = font["head"].unitsPerEm
    cmap = font.getBestCmap()
    gs = font.getGlyphSet()
    hmtx = font["hmtx"]
    scale = size / upm
    pen = SVGPathPen(gs)
    x = 0.0
    for ch in text:
        name = cmap[ord(ch)]
        tpen = TransformPen(pen, (scale, 0, 0, -scale, x, 0))
        gs[name].draw(tpen)
        x += hmtx[name][0] * scale + tracking_em * size
    return pen.getCommands(), x - tracking_em * size


def baseline(font, top, size):
    """Baseline of a line box with line-height 1 (as the browser lays it out)."""
    hhea = font["hhea"]
    upm = font["head"].unitsPerEm
    asc, desc = hhea.ascent / upm, -hhea.descent / upm
    return top + size * ((1 - (asc + desc)) / 2 + asc)


def wordmark(fill):
    # Mirrors the CSS logo: a 220 x 170 box, words rotated -12deg about their block's center.
    lines = [
        (montserrat, "Leaders", 38, 22, 110),
        (montserrat, "Like", 38, 66, 110),
        (delius, "Me", 50, 110, 130),
    ]
    parts = []
    for font, text, size, top, cx in lines:
        d, w = text_path(font, text, size)
        parts.append(f'<path transform="translate({cx - w / 2:.2f} {baseline(font, top, size):.2f})" d="{d}"/>')
    words = f'<g fill="{fill}" transform="rotate(-12 110 80)">{"".join(parts)}</g>'

    def petal(color, left, top, width_pct, rot):
        w = 220 * width_pct
        s = w / 20
        x, y = 220 * left, 170 * top
        return (f'<path fill="{COLORS[color]}" d="{PETAL}" '
                f'transform="translate({x:.2f} {y:.2f}) rotate({rot} {w / 2:.2f} {w:.2f}) scale({s:.3f})"/>')

    petals = "".join([
        petal("peach", 0.13, -0.01, 0.07, -8),
        petal("plum", 0.01, 0.10, 0.075, -62),
        petal("coral", 0.86, 0.52, 0.07, 72),
        petal("brown", 0.86, 0.66, 0.07, 108),
    ])
    return words + petals


def write(name, body, viewbox, title):
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" role="img" aria-labelledby="t">'
           f'<title id="t">{title}</title>{body}</svg>\n')
    with open(os.path.join(OUT, name), "w") as f:
        f.write(svg)


VIEW = "-6 -12 236 196"
write("logo.svg", wordmark("#ffffff"), VIEW, "Leaders Like Me")
write("logo-dark.svg", wordmark("#2e3a56"), VIEW, "Leaders Like Me")

# Favicon: the four petals as a flower on the app's navy-to-rose background.
fav_petals = []
for color, angle in [("peach", 135), ("coral", 225), ("brown", 315), ("plum", 45)]:
    # Petal tip (10,0) sits at the center; the round end points outward.
    fav_petals.append(f'<path fill="{COLORS[color]}" d="{PETAL}" '
                      f'transform="translate(32 32) rotate({angle}) scale(0.74) translate(-10 2)"/>')
fav = ('<defs><linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1">'
       '<stop offset="0" stop-color="#2e3a56"/><stop offset="0.55" stop-color="#252a38"/>'
       '<stop offset="1" stop-color="#a85a6c"/></linearGradient></defs>'
       '<rect width="64" height="64" rx="14" fill="url(#g)"/>' + "".join(fav_petals))
write("favicon.svg", fav, "0 0 64 64", "Leaders Like Me")
print("done")
