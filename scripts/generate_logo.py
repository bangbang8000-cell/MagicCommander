import io
import os
import shutil
import struct
from PIL import Image, ImageDraw, ImageFont

BLUE_TOP = (59, 130, 246)
BLUE_BOTTOM = (37, 99, 235)
BLUE_TEXT = (37, 99, 235)
HEX_POINTS = '50,7 87,29 87,71 50,93 13,71 13,29'


def draw_gradient_square(draw, size):
    for y in range(size):
        t = y / max(size - 1, 1)
        r = int(BLUE_TOP[0] * (1 - t) + BLUE_BOTTOM[0] * t)
        g = int(BLUE_TOP[1] * (1 - t) + BLUE_BOTTOM[1] * t)
        b = int(BLUE_TOP[2] * (1 - t) + BLUE_BOTTOM[2] * t)
        draw.line([(0, y), (size, y)], fill=(r, g, b, 255))


def create_logo(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    square = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    square_draw = ImageDraw.Draw(square)
    draw_gradient_square(square_draw, size)

    mask = Image.new('L', (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([0, 0, size, size], radius=int(size * 0.16), fill=255)
    img.alpha_composite(Image.composite(square, Image.new('RGBA', (size, size), (0, 0, 0, 0)), mask))

    scale = size / 100
    hex_points = [
        (50 * scale, 7 * scale),
        (87 * scale, 29 * scale),
        (87 * scale, 71 * scale),
        (50 * scale, 93 * scale),
        (13 * scale, 71 * scale),
        (13 * scale, 29 * scale),
    ]

    draw = ImageDraw.Draw(img)
    draw.polygon(hex_points, fill='white')

    try:
        font = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', int(size * 0.48))
    except Exception:
        font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), 'M', font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (size - text_width) / 2 - bbox[0]
    y = (size - text_height) / 2 - bbox[1] + size * 0.01
    draw.text((x, y), 'M', fill=BLUE_TEXT, font=font)

    return img


def write_svg():
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#2563eb"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="100" height="100" rx="16" ry="16" fill="url(#bg)"/>
  <polygon points="{HEX_POINTS}" fill="white"/>
  <text x="50" y="66" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="48" fill="#2563eb">M</text>
</svg>
'''
    with open('public/icons/icon.svg', 'w', encoding='utf-8') as f:
        f.write(svg)


def write_png_and_ico():
    sizes = [16, 24, 32, 48, 64, 128, 256]
    png_buffers = []

    for size in sizes:
        logo = create_logo(size)
        buf = io.BytesIO()
        logo.save(buf, format='PNG')
        png_buffers.append((size, buf.getvalue()))

    with open('public/icons/icon.png', 'wb') as f:
        f.write(png_buffers[-1][1])

    ico = io.BytesIO()
    ico.write(struct.pack('<HHH', 0, 1, len(png_buffers)))
    offset = 6 + 16 * len(png_buffers)

    for size, data in png_buffers:
        encoded_size = size if size < 256 else 0
        ico.write(struct.pack('<BBBBHHII', encoded_size, encoded_size, 0, 0, 1, 32, len(data), offset))
        offset += len(data)

    for _, data in png_buffers:
        ico.write(data)

    with open('public/icons/icon.ico', 'wb') as f:
        f.write(ico.getvalue())


def sync_dist_icons():
    os.makedirs('dist/icons', exist_ok=True)
    shutil.copy('public/icons/icon.ico', 'dist/icons/icon.ico')
    shutil.copy('public/icons/icon.png', 'dist/icons/icon.png')
    shutil.copy('public/icons/icon.svg', 'dist/icons/icon.svg')


def main():
    os.makedirs('public/icons', exist_ok=True)
    write_svg()
    write_png_and_ico()
    sync_dist_icons()
    print(f'icon.ico: {os.path.getsize("public/icons/icon.ico")} bytes')
    print(f'icon.png: {os.path.getsize("public/icons/icon.png")} bytes')
    print(f'icon.svg: {os.path.getsize("public/icons/icon.svg")} bytes')


if __name__ == '__main__':
    main()
