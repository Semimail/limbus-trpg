# BattleUI 조각을 아틀라스 가족별로 큰 격자 시트로 만든다 (이름표 포함). 어떤 조각이 무엇인지 눈으로 고르기 위함.
import os, re, sys, collections
from PIL import Image, ImageDraw, ImageFont

src = sys.argv[1]; out = sys.argv[2]; os.makedirs(out, exist_ok=True)
CELL, COLS = 200, 7
try: font = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 11)
except Exception: font = ImageFont.load_default()
fam = collections.defaultdict(list)
for f in sorted(os.listdir(src)):
    if not f.endswith(".png"): continue
    stem = re.sub(r"^[a-z0-9]+__", "", f)[:-4]
    m = re.match(r"((?:BattleUI|MainUI)_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)?)", stem)
    key = m.group(1) if m else "etc"
    fam[key].append(f)
for key, files in fam.items():
    rows = (len(files) + COLS - 1) // COLS
    sheet = Image.new("RGBA", (COLS * CELL, rows * (CELL + 16)), (40, 36, 36, 255))
    d = ImageDraw.Draw(sheet)
    for i, f in enumerate(files):
        im = Image.open(os.path.join(src, f)).convert("RGBA")
        w, h = im.size; s = min(1.0, (CELL - 8) / max(w, h)); im = im.resize((max(1, int(w * s)), max(1, int(h * s))), Image.LANCZOS)
        x = (i % COLS) * CELL; y = (i // COLS) * (CELL + 16)
        # 체커 배경으로 알파 구분
        for cy in range(0, CELL, 16):
            for cx in range(0, CELL, 16):
                if ((cx // 16) + (cy // 16)) % 2 == 0: d.rectangle([x + cx, y + cy, x + cx + 15, y + cy + 15], fill=(58, 52, 52, 255))
        sheet.alpha_composite(im, (x + (CELL - im.width) // 2, y + (CELL - im.height) // 2))
        label = re.sub(r"^[a-z0-9]+__BattleUI_", "", f)[:-4] + f" {w}x{h}"
        d.text((x + 2, y + CELL + 1), label[:34], fill=(230, 220, 200, 255), font=font)
    sheet.save(os.path.join(out, key + ".png"))
    print(key, len(files))
