"""Regenerate PWA icons from the brand F mark.

Source: /home/user/workspace/uploaded_attachments/4e6edc8ae5eb44ea9d4e904159102dfa/brandmark-design-2.jpg
The source is already navy (#090b38) with the F mark in white. We:
  - icon-192.png, icon-512.png, apple-touch-icon.png, favicon.png:
    resize the full source as-is (purpose any). These keep the navy background.
  - icon-maskable-512.png: pad the F mark so it stays inside the safe zone
    (80% of the image) used by Android's maskable shape masks.
"""
from PIL import Image
from pathlib import Path

SRC = Path("/home/user/workspace/uploaded_attachments/4e6edc8ae5eb44ea9d4e904159102dfa/brandmark-design-2.jpg")
OUT = Path("/home/user/workspace/fortis-inspector/client/public")
NAVY = (9, 11, 56)  # #090b38

src = Image.open(SRC).convert("RGB")

def square(img, size, bg=NAVY):
    """Center the source on a navy square of `size`x`size`, scaled to fill `size`."""
    s = img.resize((size, size), Image.LANCZOS)
    canvas = Image.new("RGB", (size, size), bg)
    canvas.paste(s, (0, 0))
    return canvas

def maskable(img, size, safe=0.80, bg=NAVY):
    """Center the F mark inside a safe zone (default 80%) on a navy background.
    Required for Android maskable icons so the shape mask does not clip it."""
    inner = int(size * safe)
    s = img.resize((inner, inner), Image.LANCZOS)
    canvas = Image.new("RGB", (size, size), bg)
    off = (size - inner) // 2
    canvas.paste(s, (off, off))
    return canvas

OUT.mkdir(parents=True, exist_ok=True)
square(src, 192).save(OUT / "icon-192.png", "PNG", optimize=True)
square(src, 512).save(OUT / "icon-512.png", "PNG", optimize=True)
square(src, 180).save(OUT / "apple-touch-icon.png", "PNG", optimize=True)
square(src, 64).save(OUT / "favicon.png", "PNG", optimize=True)
maskable(src, 512).save(OUT / "icon-maskable-512.png", "PNG", optimize=True)
print("Wrote 5 icons to", OUT)
