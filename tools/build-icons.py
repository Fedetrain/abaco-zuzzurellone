#!/usr/bin/env python3
"""Genera favicon.ico e apple-touch-icon.png dalla stessa geometria di assets/icon.svg.

Rilancialo se cambi l'icona:  python tools/build-icons.py
"""
from PIL import Image, ImageDraw

RED, CREAM = (224, 67, 43, 255), (242, 237, 227, 255)
S = 16  # supersampling: si disegna a 32*S e si riduce, cosi' i bordi restano morbidi


def draw(size):
    img = Image.new("RGBA", (32 * S, 32 * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, 32 * S - 1, 32 * S - 1], radius=7 * S, fill=RED)
    d.polygon([(6 * S, 6 * S), (13.2 * S, 16 * S), (6 * S, 26 * S)], fill=CREAM)
    d.polygon([(26 * S, 6 * S), (18.8 * S, 16 * S), (26 * S, 26 * S)], fill=CREAM)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    # .ico multi-size: Google preferisce >=48px, i browser pescano 16/32 dal tab
    draw(256).save("favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    draw(180).save("apple-touch-icon.png")
    assert draw(48).getpixel((24, 24))[3] == 255, "il centro deve essere opaco"
    assert draw(48).getpixel((0, 0))[3] == 0, "gli angoli devono essere trasparenti"
    print("ok: favicon.ico + apple-touch-icon.png")
