# Renders Toolbelt's toolbar icons (16/32/48/128 px PNGs) with the standard library only.
# Mirrors Logo + ToolTile in packages/ui/src (20-unit grid): diagonal gradient tile, top sheen, hairline,
# raised white T. Run: python3 scripts/render-icons.py apps/toolbelt/public/icon
import struct
import sys
import zlib

FROM, TO = (0x6D, 0x8B, 0xFF), (0x2A, 0x45, 0xD6)
WHITE = (255, 255, 255)


def rr(x, y, x0, y0, w, h, r):
    """Is (x, y) inside the rounded rectangle?"""
    if not (x0 <= x < x0 + w and y0 <= y < y0 + h):
        return False
    cx = min(max(x, x0 + r), x0 + w - r)
    cy = min(max(y, y0 + r), y0 + h - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def glyph(x, y):
    if rr(x, y, 3.6, 5, 12.8, 3.8, 1.9) or rr(x, y, 8.1, 5, 3.8, 10.6, 1.9):
        return WHITE
    return None


def blend(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


# The drop shadow under the glyph: offset 0.45 down, softened by sampling a small disc.
SHADOW_TAPS = [(dx * 0.35, dy * 0.35) for dx in (-1, 0, 1) for dy in (-1, 0, 1)]


def color_at(x, y):
    if not rr(x, y, 0, 0, 20, 20, 5.5):
        return None
    g = glyph(x, y)
    if g:
        return g
    c = blend(FROM, TO, (x + y) / 40)
    if y < 9:  # sheen
        c = blend(c, WHITE, 0.28 * (1 - y / 9))
    if not rr(x, y, 0.7, 0.7, 18.6, 18.6, 4.8):  # hairline
        c = blend(c, WHITE, 0.22)
    shade = sum(1 for dx, dy in SHADOW_TAPS if glyph(x + dx, y - 0.45 + dy)) / len(SHADOW_TAPS)
    return blend(c, TO, shade * 0.9)


def render(n, ss=8):
    rows = []
    for py in range(n):
        row = bytearray([0])
        for px in range(n):
            acc = [0.0] * 4
            for sy in range(ss):
                for sx in range(ss):
                    c = color_at((px + (sx + 0.5) / ss) * 20 / n, (py + (sy + 0.5) / ss) * 20 / n)
                    if c:
                        for i in range(3):
                            acc[i] += c[i]
                        acc[3] += 1
            rgb = [round(acc[i] / acc[3]) if acc[3] else 0 for i in range(3)]
            row += bytes(rgb + [round(acc[3] / (ss * ss) * 255)])
        rows.append(bytes(row))
    return rows


def png(rows, n):
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    head = struct.pack('>IIBBBBB', n, n, 8, 6, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', head) + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b'')


for size in (128, 48, 32, 16):
    with open(f'{sys.argv[1]}/{size}.png', 'wb') as f:
        f.write(png(render(size), size))
