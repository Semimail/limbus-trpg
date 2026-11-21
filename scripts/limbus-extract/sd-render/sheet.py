"""확인용 컨택트 시트. 폴더 안 PNG(또는 --recursive 로 하위 폴더 전부)를 라벨 붙은 격자 한 장으로.

    .venv\\Scripts\\python.exe sd-render\\sheet.py <폴더> <out.png> [--cell 160] [--cols 8] [--recursive] [--only idle]
"""
import argparse
import os

from PIL import Image, ImageDraw


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--cell", type=int, default=160)
    ap.add_argument("--cols", type=int, default=8)
    ap.add_argument("--recursive", action="store_true")
    ap.add_argument("--only", help="이 이름(확장자 제외)의 파일만, 쉼표 구분")
    a = ap.parse_args()
    only = set(a.only.split(",")) if a.only else None
    items: list[tuple[str, str]] = []
    if a.recursive:
        for dirpath, _d, files in os.walk(a.src):
            for f in sorted(files):
                if f.lower().endswith(".png") and (not only or f[:-4] in only):
                    items.append((os.path.join(dirpath, f), os.path.relpath(dirpath, a.src).replace("\\", "/") + "/" + f[:-4]))
    else:
        items = [(os.path.join(a.src, f), f[:-4]) for f in sorted(os.listdir(a.src)) if f.lower().endswith(".png") and (not only or f[:-4] in only)]
    cell, cols = a.cell, a.cols
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cell, max(1, rows) * (cell + 16)), (40, 40, 40, 255))
    d = ImageDraw.Draw(sheet)
    for i, (path, label) in enumerate(items):
        im = Image.open(path).convert("RGBA")
        im.thumbnail((cell - 4, cell - 4))
        x, y = (i % cols) * cell, (i // cols) * (cell + 16)
        sheet.alpha_composite(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2))
        d.text((x + 2, y + cell), label[-(cell // 6):], fill=(230, 230, 230, 255))
    sheet.save(a.out)
    print(len(items), a.out)


if __name__ == "__main__":
    main()
