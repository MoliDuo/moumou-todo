"""Regenerate the app and tray icons from icon-source.png (requires Pillow)."""
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "icon-source.png")
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]


def main():
    src = Image.open(SOURCE).convert("RGBA")
    imgs = {s: src.resize((s, s), Image.LANCZOS) for s in ICO_SIZES}

    imgs[256].save(os.path.join(HERE, "icon.png"))
    # Also used as the Windows tray icon, which picks the size matching the DPI.
    imgs[256].save(
        os.path.join(HERE, "icon.ico"),
        format="ICO",
        sizes=[(s, s) for s in ICO_SIZES],
    )

    # macOS/Linux tray: nativeImage pairs tray.png with tray@2x.png automatically.
    imgs[16].save(os.path.join(HERE, "tray.png"))
    imgs[32].save(os.path.join(HERE, "tray@2x.png"))

    print("done")


if __name__ == "__main__":
    main()
