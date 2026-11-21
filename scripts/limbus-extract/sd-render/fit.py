"""SD PNG 를 투명 여백 트리밍 + 크기 맞춤한 사본으로 만든다.

1) Spine 렌더본(평평한 폴더, 한 장씩 따로):
    .venv\\Scripts\\python.exe sd-render\\fit.py --src extracted\\cache\\sd-render --out extracted\\cache\\sd-512 --size 512
   → 각 장을 size×size 상자에 맞춰 축소. 프리팹마다 root 본 스케일이 달라(0.3~1) 원본 크기가 제각각이라 필요.

2) 자세 스프라이트(프리팹 폴더 아래 idle/mov/gud/dmg/dead/skillN_M/…, extract.py --types sprite 결과):
    .venv\\Scripts\\python.exe sd-render\\fit.py --src extracted\\cache\\sd-pose\\sprite\\Resources_moved\\Prefab\\SD --out extracted\\cache\\sd-pose-512 --size 512 --recursive --anchor idle
   → 폴더 구조 유지. 한 프리팹 안에서는 **같은 배율**을 쓴다(기준 `--anchor` 자세가 size 상자에 맞는 배율, 없으면 가장 큰 기본 자세).
     자세마다 따로 맞추면 웅크린 자세가 서 있는 자세보다 커져 버리므로. 큰 스킬 컷은 상자를 넘을 수 있다(--max 로 상한).
"""
import argparse
import os
import re
import sys

from PIL import Image

BASE_POSES = ("idle", "idel", "default", "standing", "idle (1)", "mov", "move", "gud", "dmg", "damaged", "dead", "miss", "evade")


def trim(im: Image.Image) -> Image.Image:
    bb = im.getchannel("A").getbbox()
    return im.crop(bb) if bb else im


def resize(im: Image.Image, factor: float) -> Image.Image:
    if factor >= 1:
        return im
    w, h = max(1, round(im.width * factor)), max(1, round(im.height * factor))
    return im.resize((w, h), Image.LANCZOS)


def fit_flat(src: str, out: str, size: int) -> int:
    os.makedirs(out, exist_ok=True)
    n = 0
    for name in sorted(os.listdir(src)):
        if not name.lower().endswith(".png"):
            continue
        im = trim(Image.open(os.path.join(src, name)).convert("RGBA"))
        im.thumbnail((size, size), Image.LANCZOS)
        im.save(os.path.join(out, name), optimize=True)
        n += 1
    return n


def fit_folder(src: str, out: str, size: int, anchor: str, maxpx: int) -> int:
    """한 프리팹 폴더: 공통 배율로 전부 축소."""
    names = sorted(f for f in os.listdir(src) if f.lower().endswith(".png"))
    if not names:
        return 0
    imgs = {n: trim(Image.open(os.path.join(src, n)).convert("RGBA")) for n in names}
    stem = lambda n: re.sub(r"(__\d+)?\.png$", "", n, flags=re.I).lower()
    anchors = [a.strip().lower() for a in anchor.split(",") if a.strip()]
    ref = next((n for a in anchors for n in names if stem(n) == a), None)
    if ref is None:
        base = [n for n in names if stem(n) in BASE_POSES] or names
        ref = max(base, key=lambda n: max(imgs[n].size))
    factor = min(1.0, size / max(imgs[ref].size))
    os.makedirs(out, exist_ok=True)
    for n in names:
        im = resize(imgs[n], factor)
        if max(im.size) > maxpx:
            im = resize(im, maxpx / max(im.size))
        im.save(os.path.join(out, n), optimize=True)
    return len(names)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--size", type=int, default=512)
    ap.add_argument("--recursive", action="store_true", help="하위 폴더(프리팹)마다 공통 배율로 맞춤, 구조 유지")
    ap.add_argument("--anchor", default="idle,default,idel,standing", help="--recursive 때 배율 기준 자세 이름(쉼표로 우선순위, 대소문자 무시)")
    ap.add_argument("--max", type=int, default=2048, help="--recursive 때 한 변 상한 픽셀")
    a = ap.parse_args()
    n = 0
    if not a.recursive:
        n = fit_flat(a.src, a.out, a.size)
    else:
        for dirpath, _dirs, files in os.walk(a.src):
            if not any(f.lower().endswith(".png") for f in files):
                continue
            rel = os.path.relpath(dirpath, a.src)
            n += fit_folder(dirpath, os.path.join(a.out, rel), a.size, a.anchor, a.max)
    print(f"{n}장 → {a.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
