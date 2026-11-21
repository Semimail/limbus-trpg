"""SD(Spine) 정지 이미지 렌더용 로컬 서버.

extract.py 로 뽑은 `extracted/cache/sd/` (text: json+.atlas, tex: 페이지 png) 를 브라우저에 서빙하고,
브라우저(index.html, spine-webgl 4.0)가 렌더해 보낸 PNG 를 --out 에 저장한다.

    python sd-render/server.py --root extracted/cache/sd --out extracted/cache/sd-render --port 8765

--root 는 여러 번 줄 수 있다(인격·E.G.O / 적 / 환상체 / 시즌 폴더를 따로 뽑았을 때). 각 root 의
text/Resources_moved/Prefab/SD/ 아래를 깊이 제한 없이 훑어 .json 이 있는 폴더마다 항목을 만든다
(id = 그 폴더의 상대 경로, 예 Personality/10401_Ryoshu_BaseAppearance, SEASON7/P1/xxx, 10113_YiSang_DerSchutzeAppearance).

그 뒤 브라우저에서 http://127.0.0.1:8765/ 를 열면 자동으로 전부 렌더한다.
  ?only=Personality/10401_Ryoshu_BaseAppearance   하나만
  ?skip=1                                         이미 저장된 것은 건너뜀(기본)
  ?scale=0.5                                      스켈레톤 단위당 픽셀(기본 0.5)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))


def atlas_pages(path: str) -> list[str]:
    lines = open(path, encoding="utf-8").read().split("\n")
    return [lines[i].strip() for i in range(len(lines) - 1) if lines[i + 1].startswith("size:")]


SD_REL = os.path.join("Resources_moved", "Prefab", "SD")


def dirs_for(root: str, pid: str) -> tuple[str, str]:
    """항목 id → (text 폴더, tex 폴더)."""
    rel = pid.replace("/", os.sep)
    return os.path.join(root, "text", SD_REL, rel), os.path.join(root, "tex", SD_REL, rel)


def build_list(roots: list[str]) -> list[dict]:
    """.json 이 있는 폴더(깊이 무관)마다 (json, atlas) 쌍을 만든다. 이름이 같으면 짝, 아니면 남은 것끼리."""
    out: list[dict] = []
    for root in roots:
        text_root = os.path.join(root, "text", SD_REL)
        if not os.path.isdir(text_root):
            print(f"! {text_root} 없음", flush=True)
            continue
        for pdir, _dirs, files in sorted(os.walk(text_root)):
            jsons = sorted(f for f in files if f.endswith(".json"))
            if not jsons:
                continue
            pid = os.path.relpath(pdir, text_root).replace(os.sep, "/")
            atlases = sorted(f for f in files if f.endswith(".atlas"))
            texdir = dirs_for(root, pid)[1]
            texs = set(os.listdir(texdir)) if os.path.isdir(texdir) else set()
            pairs: list[tuple[str, str]] = []
            rest = list(atlases)
            for j in jsons:
                stem = j[:-5]
                same = [a for a in rest if a[:-6] == stem]
                if same:
                    pairs.append((j, same[0]))
                    rest.remove(same[0])
                else:
                    pairs.append((j, ""))
            unpaired = [i for i, (_, a) in enumerate(pairs) if not a]
            for i in unpaired:
                if rest:
                    pairs[i] = (pairs[i][0], rest.pop(0))
            for j, a in pairs:
                if not a:
                    out.append({"id": pid, "root": root, "json": j, "atlas": None, "error": "atlas 없음"})
                    continue
                pages = atlas_pages(os.path.join(pdir, a))
                missing = [p for p in pages if p not in texs and not resolve_page(texdir, p)]
                entry = {"id": pid, "root": root, "json": j, "atlas": a, "pages": pages, "stem": j[:-5]}
                if missing:
                    entry["error"] = f"페이지 없음: {missing}"
                out.append(entry)
    return out


def png_size(path: str) -> tuple[int, int] | None:
    """PNG IHDR 에서 크기만 읽는다(PIL 불필요)."""
    with open(path, "rb") as fh:
        head = fh.read(24)
    if head[:8] != b"\x89PNG\r\n\x1a\n" or head[12:16] != b"IHDR":
        return None
    return int.from_bytes(head[16:20], "big"), int.from_bytes(head[20:24], "big")


def fix_atlas(text: str, texdir: str) -> str:
    """아틀라스 페이지 `size` 가 실제 PNG 크기와 다르면(Unity 가 2의 거듭제곱으로 늘려 저장) size·bounds·offsets 를
    실제 크기 비율로 바꾼다. spine-ts 는 메시 UV 를 실제 텍스처 크기로 계산해서, 안 맞으면 메시 부위가 사라진다.
    rotate:90 리전은 bounds 의 w,h 가 회전 전 크기라 페이지 축이 바뀌어 있으므로 반대 비율로 곱한다."""
    lines = text.split("\n")
    out: list[str] = []
    sx = sy = 1.0
    i = 0
    while i < len(lines):
        line = lines[i]
        if i + 1 < len(lines) and lines[i + 1].startswith("size:"):
            dw, dh = (int(v) for v in lines[i + 1][5:].split(","))
            real = resolve_page(texdir, line.strip())
            actual = png_size(real) if real else None
            sx, sy = (actual[0] / dw, actual[1] / dh) if actual and (dw, dh) != actual else (1.0, 1.0)
            out.append(line)
            out.append(f"size:{round(dw * sx)},{round(dh * sy)}")
            i += 2
            # 페이지 헤더(filter/pma/scale…)는 그대로
            while i < len(lines) and ":" in lines[i]:
                out.append(lines[i])
                i += 1
            continue
        if ":" not in line:
            # 리전 이름 → 뒤따르는 key:value 묶음
            j = i + 1
            fields = []
            while j < len(lines) and ":" in lines[j]:
                fields.append(lines[j])
                j += 1
            rotated = any(f.startswith("rotate:") and f[7:].strip() in ("90", "true") for f in fields)
            fx, fy = (sy, sx) if rotated else (sx, sy)  # 회전 전 공간의 x/y 축 비율
            out.append(line)
            for f in fields:
                if f.startswith("bounds:"):
                    x, y, w, h = (int(v) for v in f[7:].split(","))
                    f = f"bounds:{round(x * sx)},{round(y * sy)},{round(w * fx)},{round(h * fy)}"
                elif f.startswith("offsets:"):
                    ox, oy, ow, oh = (int(v) for v in f[8:].split(","))
                    f = f"offsets:{round(ox * fx)},{round(oy * fy)},{round(ow * fx)},{round(oh * fy)}"
                out.append(f)
            i = j
            continue
        out.append(line)
        i += 1
    return "\n".join(out)


def resolve_page(texdir: str, name: str) -> str | None:
    """아틀라스 페이지 이름 → 실제 파일. 정확히 없으면 `<stem>_N.png` 같은 변형을 찾는다."""
    if not os.path.isdir(texdir):
        return None
    exact = os.path.join(texdir, name)
    if os.path.isfile(exact):
        return exact
    stem, ext = os.path.splitext(name)
    cands = sorted(
        f for f in os.listdir(texdir)
        if f.lower().endswith(ext.lower()) and re.fullmatch(re.escape(stem) + r"(_\d+)?", f[: -len(ext)], re.I)
    )
    return os.path.join(texdir, cands[0]) if cands else None


class Server(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 64


class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"  # keep-alive: 브라우저가 연결을 재사용(연결 폭주로 타임아웃 나던 것 완화)
    roots: list[str] = []
    out = ""
    listing: list[dict] = []
    root_of: dict[str, str] = {}  # id → root

    def log_message(self, fmt, *args):  # 조용히
        if "/save" in (args[0] if args else ""):
            sys.stderr.write("%s\n" % (fmt % args))

    def _send(self, code: int, body: bytes, ctype: str):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        path = unquote(u.path)
        if path in ("/", "/index.html"):
            return self._send(200, open(os.path.join(HERE, "index.html"), "rb").read(), "text/html; charset=utf-8")
        if path == "/list":
            done = set(os.listdir(self.out)) if os.path.isdir(self.out) else set()
            for e in self.listing:
                e["done"] = (out_name(e) in done)
            return self._send(200, json.dumps(self.listing, ensure_ascii=False).encode("utf-8"), "application/json")
        if path.startswith("/sd/"):
            rel = path[4:]
            parts = rel.split("/")
            if len(parts) < 2 or ".." in parts or "" in parts:
                return self._send(404, b"bad", "text/plain")
            pid, name = "/".join(parts[:-1]), parts[-1]
            root = self.root_of.get(pid)
            if not root:
                return self._send(404, b"unknown id", "text/plain")
            textdir, texdir = dirs_for(root, pid)
            f = os.path.join(textdir, name) if os.path.isfile(os.path.join(textdir, name)) else resolve_page(texdir, name)
            if not f:
                return self._send(404, b"not found", "text/plain")
            if f.lower().endswith(".atlas"):
                fixed = fix_atlas(open(f, encoding="utf-8").read(), texdir)
                return self._send(200, fixed.encode("utf-8"), "text/plain; charset=utf-8")
            ctype = "image/png" if f.lower().endswith(".png") else "text/plain; charset=utf-8"
            return self._send(200, open(f, "rb").read(), ctype)
        return self._send(404, b"not found", "text/plain")

    def do_POST(self):
        u = urlparse(self.path)
        if u.path != "/save":
            return self._send(404, b"not found", "text/plain")
        q = parse_qs(u.query)
        name = q.get("name", [""])[0]
        if not name or "/" in name or "\\" in name or ".." in name:
            return self._send(400, b"bad name", "text/plain")
        n = int(self.headers.get("Content-Length", "0"))
        data = self.rfile.read(n)
        os.makedirs(self.out, exist_ok=True)
        with open(os.path.join(self.out, name), "wb") as fh:
            fh.write(data)
        return self._send(200, b"ok", "text/plain")


def out_name(e: dict) -> str:
    base = e["id"].replace("/", "__")
    return f"{base}__{e['stem']}.png" if e.get("stem") else f"{base}.png"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True, action="append", help="추출 폴더(text/·tex/ 가 있는 곳). 여러 번 가능")
    ap.add_argument("--out", required=True)
    ap.add_argument("--port", type=int, default=8765)
    a = ap.parse_args()
    Handler.roots = [os.path.abspath(r) for r in a.root]
    Handler.out = os.path.abspath(a.out)
    Handler.listing = build_list(Handler.roots)
    Handler.root_of = {e["id"]: e["root"] for e in Handler.listing}
    bad = [e for e in Handler.listing if e.get("error")]
    print(f"항목 {len(Handler.listing)}개, 문제 {len(bad)}개", flush=True)
    for e in bad:
        print("  !", e["id"], e["json"], e["error"], flush=True)
    srv = Server(("127.0.0.1", a.port), Handler)
    print(f"http://127.0.0.1:{a.port}/  (저장: {Handler.out})", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
