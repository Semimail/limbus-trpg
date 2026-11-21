"""스토리 스탠딩(.psb 레이어 모델) 합성기.

Story/StandingModel/<이름>.psb 는 Unity 2D PSD Importer 가 만든 프리팹이다: 레이어마다 Sprite 하나와
SpriteRenderer 를 단 GameObject 가 있고, 위치는 Transform 에 있다. extract.py 는 Sprite 만 뽑으므로
(이름이 전부 <이름>.psb.png, __2 …) 여기서 번들을 직접 열어 레이어 이름·위치·정렬 순서를 읽고
`default`(몸) 위에 `face_*`(표정) 하나씩을 올린 PNG 를 만든다.

    .venv\\Scripts\\python.exe standing-compose.py --cache "%USERPROFILE%\\AppData\\LocalLow\\Unity\\ProjectMoon_LimbusCompany" --out extracted\\cache\\standing-composed [--only Ishmael] [--cab-map cab_map.json]

출력: <out>/<psb 경로>/<표정>.png (몸만은 default.png). 같은 폴더 layers.json 에 레이어 목록·위치 기록.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

import UnityPy
from PIL import Image

UnityPy.config.FALLBACK_UNITY_VERSION = "6000.3.12f1"


def deref(p):
    try:
        return p.read()
    except Exception:
        return p.deref().read()


def world_pos(tr, cache: dict) -> tuple[float, float, float, float]:
    """Transform → (x, y, sx, sy) 월드(부모 누적). 회전은 무시."""
    rd = getattr(tr, "object_reader", None)
    key = (id(getattr(rd, "assets_file", None)), getattr(rd, "path_id", None)) if rd is not None else None
    if key is not None and key in cache:
        return cache[key]
    x, y = tr.m_LocalPosition.x, tr.m_LocalPosition.y
    sx, sy = tr.m_LocalScale.x, tr.m_LocalScale.y
    father = getattr(tr, "m_Father", None)
    if father and getattr(father, "path_id", 0):
        try:
            px, py, psx, psy = world_pos(deref(father), cache)
            x, y, sx, sy = px + x * psx, py + y * psy, sx * psx, sy * psy
        except Exception:
            pass
    if key is not None:
        cache[key] = (x, y, sx, sy)
    return (x, y, sx, sy)


def collect_layers(env, container_filter: str | None):
    """번들 안 SpriteRenderer 전부 → 레이어 dict 목록(프리팹 컨테이너별)."""
    by_prefab: dict[str, list[dict]] = {}
    tcache: dict = {}
    for obj in env.objects:
        if obj.type.name != "SpriteRenderer":
            continue
        try:
            sr = obj.read()
            go = deref(sr.m_GameObject)
            sprite_p = sr.m_Sprite
            if not sprite_p or not getattr(sprite_p, "path_id", 0):
                continue
            sp = deref(sprite_p)
            tr = None
            for c in go.m_Components:
                comp = c if not hasattr(c, "component") else c.component
                try:
                    o = deref(comp)
                except Exception:
                    continue
                if type(o).__name__ == "Transform":
                    tr = o
                    break
            if tr is None:
                continue
            x, y, sx, sy = world_pos(tr, tcache)
            container = obj.container or ""
            if container_filter and container_filter not in container:
                continue
            img = sp.image
            ppu = float(getattr(sp, "m_PixelsToUnits", 100.0) or 100.0)
            piv = sp.m_Pivot
            by_prefab.setdefault(container, []).append({
                "name": go.m_Name,
                "sprite": sp.m_Name,
                "active": bool(getattr(go, "m_IsActive", True)),
                "order": int(getattr(sr, "m_SortingOrder", 0)),
                "x": x, "y": y, "sx": sx, "sy": sy,
                "ppu": ppu,
                "pivot": [float(piv.x), float(piv.y)],
                "size": [img.width, img.height],
                "_img": img,
            })
        except Exception as e:  # 한 레이어 실패는 건너뜀
            print("  ! layer", e, file=sys.stderr)
    return by_prefab


def compose(layers: list[dict], names: list[str]) -> Image.Image:
    """지정한 레이어들을 월드 좌표대로 겹친다(y 위가 +)."""
    chosen = [l for l in layers if l["name"] in names]
    boxes = []
    for l in chosen:
        w, h = l["size"][0] * l["sx"], l["size"][1] * l["sy"]
        px, py = l["x"] * l["ppu"], l["y"] * l["ppu"]
        left, bottom = px - l["pivot"][0] * w, py - l["pivot"][1] * h
        boxes.append((left, bottom, left + w, bottom + h))
    minx, miny = min(b[0] for b in boxes), min(b[1] for b in boxes)
    maxx, maxy = max(b[2] for b in boxes), max(b[3] for b in boxes)
    W, H = int(round(maxx - minx)) + 1, int(round(maxy - miny)) + 1
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for l, b in sorted(zip(chosen, boxes), key=lambda t: t[0]["order"]):
        img = l["_img"]
        if l["sx"] != 1 or l["sy"] != 1:
            img = img.resize((max(1, round(img.width * l["sx"])), max(1, round(img.height * l["sy"]))), Image.LANCZOS)
        ox = int(round(b[0] - minx))
        oy = int(round(maxy - b[3]))  # 위쪽 y 를 이미지 좌표로
        canvas.alpha_composite(img, (ox, oy))
    return canvas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--only", help="이 문자열이 들어간 psb 만")
    ap.add_argument("--cab-map", help="CAB 이름 → __data 경로 json (없으면 전체 번들을 훑음)")
    ap.add_argument("--index", default=os.path.join("extracted", "cache", "standing", "index.json"), help="extract.py 가 만든 index.json (psb 목록·CAB 이름)")
    a = ap.parse_args()

    idx = json.load(open(a.index, encoding="utf-8"))
    wanted: dict[str, str] = {}  # container → CAB
    for e in idx:
        c = e.get("container") or ""
        if e["type"] == "Sprite" and c.lower().endswith(".psb") and (not a.only or a.only.lower() in c.lower()):
            wanted[c] = (e.get("source") or "").lower()
    print(f"psb {len(wanted)}개", flush=True)

    cab_map = json.load(open(a.cab_map)) if a.cab_map and os.path.isfile(a.cab_map) else None
    bundles: dict[str, set[str]] = {}
    if cab_map:
        for c, cab in wanted.items():
            p = cab_map.get(cab)
            if p:
                bundles.setdefault(p, set()).add(c)
            else:
                print("  ! 번들 못 찾음", c, cab, file=sys.stderr)
    else:
        files = [os.path.join(dp, f) for dp, _, fs in os.walk(a.cache) for f in fs if f == "__data"]
        cabs = {cab: c for c, cab in wanted.items()}
        for p in files:
            try:
                env = UnityPy.load(p)
            except Exception:
                continue
            for name in env.files:
                if name.lower() in cabs:
                    bundles.setdefault(p, set()).add(cabs[name.lower()])

    done = 0
    for p, containers in bundles.items():
        env = UnityPy.load(p)
        by_prefab = collect_layers(env, None)
        for c in containers:
            layers = by_prefab.get(c) or []
            if not layers:
                print("  ! 레이어 없음", c, file=sys.stderr)
                continue
            rel = re.sub(r"^Assets/Resources_moved/Story/StandingModel/", "", c)
            rel = re.sub(r"\.psb$", "", rel)
            outdir = os.path.join(a.out, rel.replace("/", os.sep))
            os.makedirs(outdir, exist_ok=True)
            names = [l["name"] for l in layers]
            base = "default" if "default" in names else None
            faces = [n for n in names if n.lower().startswith("face")]
            others = [n for n in names if n != base and n not in faces and n.lower() != "pivot"]
            if base:
                compose(layers, [base]).save(os.path.join(outdir, "default.png"))
                for f in faces:
                    compose(layers, [base, f]).save(os.path.join(outdir, f"{f}.png"))
            else:
                # 몸 레이어 이름이 다르면 활성 레이어 전부 한 장 + 각 레이어 따로
                act = [l["name"] for l in layers if l["active"]] or names
                compose(layers, act).save(os.path.join(outdir, "all.png"))
            for n in others:
                compose(layers, [n]).save(os.path.join(outdir, f"layer_{n}.png"))
            json.dump([{k: v for k, v in l.items() if k != "_img"} for l in layers],
                      open(os.path.join(outdir, "layers.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            done += 1
            print(f"ok {rel}: 몸={base} 표정 {len(faces)} 기타 {len(others)}", flush=True)
    print(f"완료 {done}/{len(wanted)}", flush=True)


if __name__ == "__main__":
    main()
