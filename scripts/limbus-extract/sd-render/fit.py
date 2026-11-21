"""렌더한 SD PNG 를 투명 여백 트리밍 + 정사각 상자에 맞춰 축소한 사본을 만든다.

    .venv\\Scripts\\python.exe sd-render\\fit.py --src extracted\\cache\\sd-render --out extracted\\cache\\sd-512 --size 512

프리팹마다 root 본 스케일이 달라(0.3~1) 원본 렌더 크기가 제각각이므로, VTT 토큰처럼 같은 크기로 쓰려면 이걸 쓴다.
"""
import argparse
import os
import sys

from PIL import Image


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--size", type=int, default=512)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    n = 0
    for name in sorted(os.listdir(a.src)):
        if not name.lower().endswith(".png"):
            continue
        im = Image.open(os.path.join(a.src, name)).convert("RGBA")
        bb = im.getchannel("A").getbbox()
        if bb:
            im = im.crop(bb)
        im.thumbnail((a.size, a.size), Image.LANCZOS)
        im.save(os.path.join(a.out, name), optimize=True)
        n += 1
    print(f"{n}장 → {a.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
