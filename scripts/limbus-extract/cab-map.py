"""Addressables 캐시의 모든 번들을 열어 CAB 이름 → `__data` 경로 맵(json)을 만든다. 오브젝트는 읽지 않아 10분 안팎.

    .venv\\Scripts\\python.exe cab-map.py --cache "%USERPROFILE%\\AppData\\LocalLow\\Unity\\ProjectMoon_LimbusCompany" --out extracted\\cab_map.json

extract.py 의 index.json 에 적힌 `source`(CAB 이름)로 번들을 바로 찾을 때 쓴다(standing-compose.py --cab-map).
"""
import argparse
import json
import os
import sys

import UnityPy

UnityPy.config.FALLBACK_UNITY_VERSION = "6000.3.12f1"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    files = [os.path.join(dp, f) for dp, _, fs in os.walk(a.cache) for f in fs if f == "__data"]
    out: dict[str, str] = {}
    for i, p in enumerate(files):
        try:
            env = UnityPy.load(p)
            for name in getattr(env, "cabs", {}) or {}:
                out[str(name).lower()] = p
        except Exception as e:
            print("ERR", p, e, file=sys.stderr)
        if i % 200 == 0:
            print(f"{i}/{len(files)} ({len(out)})", flush=True)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    json.dump(out, open(a.out, "w"), indent=0)
    print(f"완료 {len(out)} → {a.out}", flush=True)


if __name__ == "__main__":
    main()
