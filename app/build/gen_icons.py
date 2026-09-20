import os
from PIL import Image

SOURCE = os.path.join(os.path.dirname(__file__), "..", "..", "ChatGPT Image Sep 9, 2026, 07_26_03 PM.png")

src = Image.open(SOURCE).convert("RGBA")

sizes = [16, 24, 32, 48, 64, 128, 256]
imgs = {s: src.resize((s, s), Image.LANCZOS) for s in sizes}

imgs[256].save(os.path.join(os.path.dirname(__file__), "icon.png"))
imgs[256].save(
    os.path.join(os.path.dirname(__file__), "icon.ico"),
    format="ICO",
    sizes=[(s, s) for s in sizes],
)

imgs[32].save(os.path.join(os.path.dirname(__file__), "tray.png"))
imgs[16].save(os.path.join(os.path.dirname(__file__), "tray16.png"))

print("done")
