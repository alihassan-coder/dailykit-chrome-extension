"""Render the shared vector artwork to extension PNGs and a review sheet.

Run: python3 scripts/render-icons.py
Requires the system librsvg and Cairo libraries (available with GTK on Linux).
Toolbelt uses its generated PNG master; tool vectors live in packages/ui/src/brand-marks.json.
"""
import ctypes as c
import ctypes.util
import base64
import html
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
MARKS = json.loads((ROOT / 'packages/ui/src/brand-marks.json').read_text())
SIZES = (16, 24, 32, 48, 128)
GENERATED = ROOT / 'packages/ui/src/assets/toolbelt-generated-v1.png'


def generated_defs():
    data = base64.b64encode(GENERATED.read_bytes()).decode()
    return f'<defs><symbol id="generated-toolbelt" viewBox="0 0 20 20"><image width="20" height="20" href="data:image/png;base64,{data}"/></symbol></defs>'


def shapes(mark):
    parts = []
    for path in MARKS[mark]['paths']:
        attrs = {'fill': 'none', **path}
        attrs = {('stroke-width' if k == 'strokeWidth' else k): v for k, v in attrs.items()}
        parts.append('<path ' + ' '.join(f'{k}="{html.escape(str(v), quote=True)}"' for k, v in attrs.items()) + '/>')
    return ''.join(parts)


def tile(mark, prefix):
    if mark == 'toolbelt':
        return '<use href="#generated-toolbelt" width="20" height="20"/>'
    art = MARKS[mark]
    return f'''<defs><linearGradient id="{prefix}" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="{art['from']}"/><stop offset="1" stop-color="{art['to']}"/>
    </linearGradient></defs>
    <rect width="20" height="20" rx="5" fill="url(#{prefix})"/>
    <rect x=".4" y=".4" width="19.2" height="19.2" rx="4.6" fill="none" stroke="white" stroke-opacity=".12" stroke-width=".6"/>
    <g stroke-linecap="round" stroke-linejoin="round">{shapes(mark)}</g>'''


def svg(mark, size=128):
    defs = generated_defs() if mark == 'toolbelt' else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 20 20"><title>{html.escape(MARKS[mark]["name"])}</title>{defs}{tile(mark, mark)}</svg>'


class Rectangle(c.Structure):
    _fields_ = [('x', c.c_double), ('y', c.c_double), ('width', c.c_double), ('height', c.c_double)]


def library(name):
    path = ctypes.util.find_library(name)
    if not path:
        raise SystemExit(f'Missing system library: {name}. Install librsvg and Cairo to render icons.')
    return c.CDLL(path)


rsvg, cairo, gobject = library('rsvg-2'), library('cairo'), library('gobject-2.0')
rsvg.rsvg_handle_new_from_data.argtypes = [c.c_char_p, c.c_size_t, c.c_void_p]
rsvg.rsvg_handle_new_from_data.restype = c.c_void_p
rsvg.rsvg_handle_render_document.argtypes = [c.c_void_p, c.c_void_p, c.POINTER(Rectangle), c.c_void_p]
rsvg.rsvg_handle_render_document.restype = c.c_int
cairo.cairo_image_surface_create.argtypes = [c.c_int, c.c_int, c.c_int]
cairo.cairo_image_surface_create.restype = c.c_void_p
cairo.cairo_create.argtypes = [c.c_void_p]
cairo.cairo_create.restype = c.c_void_p
cairo.cairo_surface_write_to_png.argtypes = [c.c_void_p, c.c_char_p]
cairo.cairo_surface_write_to_png.restype = c.c_int
cairo.cairo_destroy.argtypes = [c.c_void_p]
cairo.cairo_surface_destroy.argtypes = [c.c_void_p]
gobject.g_object_unref.argtypes = [c.c_void_p]


def render(source, width, height, path):
    data = source.encode()
    handle = rsvg.rsvg_handle_new_from_data(data, len(data), None)
    if not handle:
        raise RuntimeError(f'Invalid SVG: {path}')
    surface = cairo.cairo_image_surface_create(0, width, height)
    context = cairo.cairo_create(surface)
    try:
        if not rsvg.rsvg_handle_render_document(handle, context, c.byref(Rectangle(0, 0, width, height)), None):
            raise RuntimeError(f'Could not render {path}')
        path.parent.mkdir(parents=True, exist_ok=True)
        if cairo.cairo_surface_write_to_png(surface, str(path).encode()):
            raise RuntimeError(f'Could not write {path}')
    finally:
        cairo.cairo_destroy(context)
        cairo.cairo_surface_destroy(surface)
        gobject.g_object_unref(handle)


def preview():
    parts = ['''<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1000" viewBox="0 0 1440 1000">
    <rect width="1440" height="1000" fill="#F4F3EF"/>
    <g font-family="DejaVu Sans, sans-serif">
    <text x="64" y="64" font-size="12" letter-spacing="3" fill="#68716E">TOOLBELT / VISUAL IDENTITY</text>
    <text x="64" y="125" font-size="42" font-weight="bold" letter-spacing="-1.5" fill="#172A32">Good tools. A clear identity.</text>
    <text x="65" y="164" font-size="17" fill="#68716E">One family. Six distinct marks. Built for the details of everyday work.</text>
    <text x="1376" y="64" text-anchor="end" font-size="12" fill="#68716E">01 — PRECISION / UTILITY</text>''']
    parts.append(generated_defs())
    for i, (mark, art) in enumerate(MARKS.items()):
        x, y = 64 + (i % 3) * 448, 210 + (i // 3) * 320
        parts.append(f'''<rect x="{x}" y="{y}" width="416" height="286" rx="18" fill="#FFFFFF" stroke="#E1E4DE"/>
        <text x="{x+24}" y="{y+34}" font-size="11" letter-spacing="2" fill="#8B9490">0{i+1}</text>
        <g transform="translate({x+168} {y+45}) scale(4)">{tile(mark, f'hero-{mark}')}</g>
        <text x="{x+208}" y="{y+159}" text-anchor="middle" font-size="20" font-weight="bold" fill="#172A32">{html.escape(art['name'])}</text>
        <text x="{x+208}" y="{y+184}" text-anchor="middle" font-size="12" fill="#68716E">{html.escape(art['meaning'])}</text>
        <path d="M{x+24} {y+207}h368" stroke="#E9ECE6"/>
        <text x="{x+24}" y="{y+252}" font-size="10" fill="#7D8881">ACTUAL SIZE</text>
        <g transform="translate({x+125} {y+232}) scale(.8)">{tile(mark, f'small-{mark}')}</g>
        <g transform="translate({x+166} {y+228}) scale(1.2)">{tile(mark, f'medium-{mark}')}</g>
        <rect x="{x+221}" y="{y+220}" width="171" height="43" rx="10" fill="#17232C"/>
        <g transform="translate({x+240} {y+232}) scale(.8)">{tile(mark, f'dark-{mark}')}</g>
        <g transform="translate({x+279} {y+228}) scale(1.2)">{tile(mark, f'darklarge-{mark}')}</g>
        <text x="{x+320}" y="{y+246}" font-size="10" fill="#AFBBB8">DARK</text>''')
    parts.append('''<path d="M64 892h1312" stroke="#D9DFD7"/>
    <text x="64" y="927" font-size="13" fill="#53635C">A folded ribbon for Toolbelt. Familiar symbols for the work.</text>
    <text x="64" y="953" font-size="12" fill="#7D8881">Generated Toolbelt master · Existing tool artwork · Consistent app and toolbar assets</text>
    <text x="1376" y="940" text-anchor="end" font-size="12" fill="#53635C">16 / 24 / 32 / 48 / 128 PX</text>
    </g></svg>''')
    return ''.join(parts)


def main():
    targets = {'toolbelt': ROOT / 'apps/toolbelt/public/icon', 'cairn': ROOT / 'apps/cairn/public/icon'}
    if len(sys.argv) > 1:
        targets = {'toolbelt': Path(sys.argv[1])}
    render(svg('toolbelt', 256), 256, 256, GENERATED.with_name('toolbelt-generated-v1-ui.png'))
    for mark, folder in targets.items():
        for size in SIZES:
            render(svg(mark, size), size, size, folder / f'{size}.png')
        print(f'Rendered {mark}: {", ".join(map(str, SIZES))} px')
    out = ROOT / 'docs/design/brand-refresh'
    out.mkdir(parents=True, exist_ok=True)
    for mark in MARKS:
        (out / f'{mark}.svg').write_text(svg(mark))
    sheet = preview()
    (out / 'preview.svg').write_text(sheet)
    render(sheet, 1440, 1000, out / 'preview.png')
    (out / 'index.html').write_text('''<!doctype html><html lang="en"><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>Toolbelt — Brand refresh</title>
    <style>body{margin:0;background:#F4F3EF}svg{display:block;width:100%;height:auto;max-width:1440px;margin:auto}</style>''' + sheet + '</html>')
    print(f'Preview: {out / "preview.png"}')


if __name__ == '__main__':
    main()
