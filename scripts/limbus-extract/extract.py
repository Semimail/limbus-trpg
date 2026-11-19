#!/usr/bin/env python3
"""림버스 컴퍼니 클라이언트(Unity) 에셋 추출기.

사용자 PC에서 실행한다(클라우드에는 클라이언트가 없음). 비공개·비영리 팬 프로젝트 내부 용도 전제.

    python extract.py --game "C:/Program Files (x86)/Steam/steamapps/common/Limbus Company" --out ./extracted
    python extract.py --game <게임 폴더> --cache <Addressables 캐시 폴더> --out ./extracted --types tex,sprite,audio,text,font
    python extract.py --game <게임 폴더> --out ./extracted --match "(?i)ui|icon|bgm" --list   # 꺼내지 않고 목록만

꺼내는 것
  tex    Texture2D  → PNG (아틀라스 원본, 배경, UI 텍스처)
  sprite Sprite     → PNG (아틀라스에서 잘라낸 개별 조각; UI 아이콘은 보통 이쪽이 쓸만함)
  audio  AudioClip  → wav/ogg/m4a (FSB 디코드 실패 시 .fsb 원본을 떨어뜨림 → vgmstream 으로 변환)
  text   TextAsset  → 원본 바이트 (Spine .skel/.atlas, json, 로컬라이즈 텍스트 등)
  font   Font       → ttf/otf

출력 구조: <out>/<타입>/<컨테이너 경로 또는 이름>.<ext>, 그리고 <out>/index.json (출처 파일·path_id·크기).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

try:
    import UnityPy
    from UnityPy.export import AudioClipConverter
except ImportError:  # pragma: no cover
    sys.exit("UnityPy 가 없습니다: pip install -r requirements.txt")

BUNDLE_EXTS = {".bundle", ".assets", ".resource", ".ress", ".unity3d", ""}
SKIP_NAMES = {"catalog.json", "settings.json", "link.xml"}
TYPE_DIR = {
    "Texture2D": "tex",
    "Sprite": "sprite",
    "AudioClip": "audio",
    "TextAsset": "text",
    "Font": "font",
}


def iter_input_files(roots: list[Path]) -> list[Path]:
    seen: set[Path] = set()
    out: list[Path] = []
    for root in roots:
        if root.is_file():
            out.append(root)
            continue
        for p in root.rglob("*"):
            if not p.is_file() or p.name in SKIP_NAMES:
                continue
            name = p.name
            # Addressables 번들(.bundle), 기본 에셋(sharedassets0.assets, resources.assets,
            # globalgamemanagers*), Addressables 캐시(확장자 없는 해시 파일 + __data)
            if (
                p.suffix.lower() in BUNDLE_EXTS
                or name.startswith(("sharedassets", "globalgamemanagers", "level"))
                or name == "__data"
            ):
                rp = p.resolve()
                if rp not in seen:
                    seen.add(rp)
                    out.append(p)
    return out


def safe_rel(container: str | None, name: str, fallback_id: int, source: str = "") -> str:
    if container:
        base = container
    else:
        # Addressables 번들은 컨테이너 경로가 없는 경우가 많다 → 번들 파일명 폴더 아래에 이름으로
        base = f"{Path(source).stem}/{name or f'obj_{fallback_id}'}" if source else (name or f"obj_{fallback_id}")
    base = base.replace("\\", "/")
    base = re.sub(r"^assets/", "", base, flags=re.I)
    base = re.sub(r"[<>:\"|?*\x00-\x1f]", "_", base)
    base = re.sub(r"/+", "/", base).strip("/")
    # 컨테이너 경로에 이미 확장자(.png/.asset 등)가 있으면 떼고 우리가 붙인다
    base = re.sub(r"\.(png|jpg|jpeg|tga|psd|asset|bytes|txt|json|ttf|otf|wav|ogg|mp3|skel|atlas)$", "", base, flags=re.I)
    return base


def unique(path: Path) -> Path:
    if not path.exists():
        return path
    stem, suf, parent = path.stem, path.suffix, path.parent
    i = 2
    while True:
        cand = parent / f"{stem}__{i}{suf}"
        if not cand.exists():
            return cand
        i += 1


def export_obj(obj, out: Path, want: set[str], matcher, index: list[dict], list_only: bool) -> None:
    tname = obj.type.name
    if tname not in TYPE_DIR or TYPE_DIR[tname] not in want:
        return
    try:
        name = obj.peek_name() or ""
    except Exception:
        name = ""
    container = obj.container
    key = container or name
    if matcher and not matcher.search(key or ""):
        return
    source = str(getattr(obj.assets_file, "name", "") or "")
    rel = safe_rel(container, name, obj.path_id, source)
    entry = {
        "type": tname,
        "name": name,
        "container": container,
        "path_id": obj.path_id,
        "source": source,
    }
    if list_only:
        index.append(entry)
        return

    dest_dir = out / TYPE_DIR[tname]
    try:
        data = obj.read()
        files: list[Path] = []
        if tname in ("Texture2D", "Sprite"):
            img = data.image
            if img is None:
                return
            if tname == "Texture2D" and (data.m_Width <= 4 or data.m_Height <= 4):
                return  # 1x1 더미 텍스처
            p = unique(dest_dir / f"{rel}.png")
            p.parent.mkdir(parents=True, exist_ok=True)
            img.save(p)
            files.append(p)
            entry["size"] = [img.width, img.height]
        elif tname == "AudioClip":
            try:
                samples = AudioClipConverter.extract_audioclip_samples(data)
                for fname, blob in samples.items():
                    ext = Path(fname).suffix or ".wav"
                    p = unique(dest_dir / f"{rel}{ext}")
                    p.parent.mkdir(parents=True, exist_ok=True)
                    p.write_bytes(blob)
                    files.append(p)
            except Exception as e:  # FMOD 디코드 실패 → 원본 FSB 덤프
                raw = bytes(data.m_AudioData) if data.m_AudioData else None
                if raw is None and data.m_Resource:
                    r = data.m_Resource
                    raw = AudioClipConverter.get_resource_data(
                        r.m_Source, data.object_reader.assets_file, r.m_Offset, r.m_Size
                    )
                if not raw:
                    raise
                p = unique(dest_dir / f"{rel}.fsb")
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_bytes(raw)
                files.append(p)
                entry["note"] = f"raw FSB (decode failed: {e}); convert with vgmstream"
            entry["seconds"] = round(float(data.m_Length or 0), 2)
        elif tname == "TextAsset":
            blob = data.m_Script
            if isinstance(blob, str):
                blob = blob.encode("utf-8", "surrogateescape")
            ext = ".bytes"
            head = blob[:64].lstrip()
            if head.startswith((b"{", b"[")):
                ext = ".json"
            elif re.search(r"\.(skel|atlas|json)", (container or name), re.I):
                ext = "." + re.search(r"\.(skel|atlas|json)", (container or name), re.I).group(1).lower()
            elif b"\x00" not in blob[:512]:
                ext = ".txt"
            p = unique(dest_dir / f"{rel}{ext}")
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(bytes(blob))
            files.append(p)
        elif tname == "Font":
            blob = data.m_FontData
            if not blob:
                return
            blob = bytes(blob)
            ext = ".otf" if blob[:4] == b"OTTO" else ".ttf"
            p = unique(dest_dir / f"{rel}{ext}")
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(blob)
            files.append(p)
        entry["files"] = [str(f.relative_to(out)) for f in files]
        index.append(entry)
    except Exception as e:
        entry["error"] = repr(e)
        index.append(entry)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--game", type=Path, action="append", default=[], help="게임 설치 폴더(LimbusCompany_Data 포함). 여러 번 가능")
    ap.add_argument("--cache", type=Path, action="append", default=[], help="Addressables 런타임 캐시 폴더(보통 %%USERPROFILE%%/AppData/LocalLow/ProjectMoon/LimbusCompany). 여러 번 가능")
    ap.add_argument("--file", type=Path, action="append", default=[], help="개별 번들/에셋 파일")
    ap.add_argument("--out", type=Path, default=Path("extracted"))
    ap.add_argument("--types", default="tex,sprite,audio,text,font", help="쉼표 구분: tex,sprite,audio,text,font")
    ap.add_argument("--match", help="컨테이너 경로/이름 정규식 필터 (예: '(?i)bgm|ui/')")
    ap.add_argument("--list", action="store_true", help="추출하지 않고 index.json 목록만 만든다")
    ap.add_argument("--unity-version", help="버전 추정 실패 시 강제 지정 (예: 2022.3.20f1)")
    args = ap.parse_args()

    roots = [*args.game, *args.cache, *args.file]
    if not roots:
        ap.error("--game / --cache / --file 중 하나는 필요합니다")
    want = {t.strip() for t in args.types.split(",") if t.strip()}
    matcher = re.compile(args.match) if args.match else None
    stats: dict = {"roots": [], "banks": [], "files": []}
    for r in roots:
        n = len(iter_input_files([r])) if r.exists() else None
        stats["roots"].append({"path": str(r), "exists": r.exists(), "files": n})
        print(f"입력 루트 {r}: {'없음!' if not r.exists() else f'{n}개 파일'}", file=sys.stderr)
        if r.is_dir():
            for b in r.rglob("*.bank"):
                stats["banks"].append({"path": str(b), "bytes": b.stat().st_size})
    if stats["banks"]:
        print(f"FMOD .bank 파일 {len(stats['banks'])}개 발견 → 음악은 vgmstream-cli 로 .bank 에서 꺼낸다 (README 참고)", file=sys.stderr)
    files = iter_input_files(roots)
    print(f"입력 파일 {len(files)}개", file=sys.stderr)
    args.out.mkdir(parents=True, exist_ok=True)
    index: list[dict] = []
    if args.unity_version:
        UnityPy.config.FALLBACK_UNITY_VERSION = args.unity_version

    for i, f in enumerate(files, 1):
        rec = {"path": str(f), "bytes": f.stat().st_size}
        stats["files"].append(rec)
        try:
            with open(f, "rb") as fh:
                rec["magic"] = fh.read(8).decode("latin-1")
            env = UnityPy.load(str(f))
        except Exception as e:
            rec["status"] = "load_error"
            rec["error"] = repr(e)[:300]
            print(f"[{i}/{len(files)}] 건너뜀 {f}: {e}", file=sys.stderr)
            continue
        before = len(index)
        total = 0
        types: dict[str, int] = {}
        try:
            for obj in env.objects:
                total += 1
                types[obj.type.name] = types.get(obj.type.name, 0) + 1
                export_obj(obj, args.out, want, matcher, index, args.list)
            rec["status"] = "ok"
        except Exception as e:
            rec["status"] = "iter_error"
            rec["error"] = repr(e)[:300]
            print(f"[{i}/{len(files)}] 오류 {f}: {e}", file=sys.stderr)
        got = len(index) - before
        rec["objects"] = total
        rec["picked"] = got
        rec["types"] = dict(sorted(types.items(), key=lambda kv: -kv[1])[:8])
        if got:
            print(f"[{i}/{len(files)}] {f.name}: {got}개", file=sys.stderr)

    (args.out / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), "utf-8")
    (args.out / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=1), "utf-8")
    errs = sum(1 for e in index if "error" in e)
    print(f"완료: {len(index)}개 항목 (오류 {errs}) → {args.out}/index.json", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
