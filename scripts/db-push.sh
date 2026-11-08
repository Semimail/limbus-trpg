#!/usr/bin/env bash
# Supabase 관리 API로 마이그레이션 SQL을 실행한다.
# 사용: SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=xxxx scripts/db-push.sh supabase/migrations/0001_init.sql
set -euo pipefail
: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN 필요}"
: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF 필요}"
file="${1:?SQL 파일 경로 필요}"
python3 - "$file" <<'PY'
import json, os, sys, urllib.request
sql = open(sys.argv[1], encoding="utf-8").read()
req = urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{os.environ['SUPABASE_PROJECT_REF']}/database/query",
    data=json.dumps({"query": sql}).encode(),
    headers={"Authorization": f"Bearer {os.environ['SUPABASE_ACCESS_TOKEN']}", "Content-Type": "application/json"},
    method="POST")
try:
    with urllib.request.urlopen(req) as r:
        print("OK", r.status, r.read()[:300].decode())
except urllib.error.HTTPError as e:
    print("FAIL", e.code, e.read().decode()); sys.exit(1)
PY
