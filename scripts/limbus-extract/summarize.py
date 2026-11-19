#!/usr/bin/env python3
"""extract.py --list 로 만든 index.json 을 읽어 어떤 에셋이 있는지 요약한다.

    python summarize.py <out>/index.json            # 타입별 수 + 컨테이너 상위 폴더별 수
    python summarize.py <out>/index.json --depth 3  # 폴더 깊이 조절
    python summarize.py <out>/index.json --grep "(?i)bgm"   # 정규식으로 항목 나열
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("index", type=Path)
    ap.add_argument("--depth", type=int, default=2, help="컨테이너 경로를 몇 단계까지 묶을지 (기본 2)")
    ap.add_argument("--top", type=int, default=60, help="폴더 표를 몇 줄까지 보여줄지")
    ap.add_argument("--grep", help="정규식에 맞는 항목을 전부 나열")
    args = ap.parse_args()

    items = json.loads(args.index.read_text("utf-8"))
    print(f"총 {len(items)}개")
    by_type = Counter(e["type"] for e in items)
    for t, n in by_type.most_common():
        print(f"  {t:<10} {n}")

    if args.grep:
        rx = re.compile(args.grep)
        print(f"\n--grep {args.grep!r}")
        for e in items:
            key = e.get("container") or e.get("name") or ""
            if rx.search(key):
                print(f"  [{e['type']}] {key}  ({e.get('source','')})")
        return 0

    folders: Counter[tuple[str, str]] = Counter()
    noname = 0
    for e in items:
        c = (e.get("container") or "").replace("\\", "/")
        if not c:
            noname += 1
            continue
        parts = [p for p in c.split("/") if p][: args.depth]
        folders[("/".join(parts), e["type"])] += 1
    print(f"\n컨테이너 상위 {args.depth}단계 폴더별 (컨테이너 없는 항목 {noname}개는 제외)")
    for (folder, t), n in folders.most_common(args.top):
        print(f"  {n:>6}  {t:<10} {folder}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
