# 림버스 컴퍼니 에셋 추출 일괄 실행 (Windows PowerShell)
# 1) 전체 목록(index.json) → 요약 출력  2) UI·아이콘 / 배경 / 음악을 골라 추출
#
#   cd scripts\limbus-extract
#   powershell -ExecutionPolicy Bypass -File .\run-windows.ps1
#   powershell -ExecutionPolicy Bypass -File .\run-windows.ps1 -Game "D:\Steam\steamapps\common\Limbus Company" -Out "D:\limbus-extracted"
#   powershell -ExecutionPolicy Bypass -File .\run-windows.ps1 -ListOnly      # 목록만
#
# 필터 정규식은 아래 Filters 목록에서 고친다. 목록(index.json)의 container 경로를 보고 맞추면 된다.
param(
  [string]$Game = "C:\Program Files (x86)\Steam\steamapps\common\Limbus Company",
  [string]$Cache = "$env:USERPROFILE\AppData\LocalLow\ProjectMoon\LimbusCompany",
  [string]$Out = "$PSScriptRoot\extracted",
  [string]$UnityVersion = "",
  [switch]$ListOnly,
  [switch]$SkipList
)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path $Game)) { throw "게임 폴더가 없습니다: $Game  (-Game 로 지정)" }
if (-not (Test-Path $Cache)) {
  Write-Warning "캐시 폴더가 없습니다: $Cache  — LocalLow 안에서 __data 파일을 찾아보세요. 게임 폴더만으로 진행합니다."
  $Cache = ""
}

# 가상환경 + UnityPy
if (-not (Test-Path ".venv\Scripts\python.exe")) {
  Write-Host "== 가상환경 만들기"
  python -m venv .venv
}
$py = ".\.venv\Scripts\python.exe"
& $py -m pip install -q -r requirements.txt

$common = @("--game", $Game)
if ($Cache) { $common += @("--cache", $Cache) }
if ($UnityVersion) { $common += @("--unity-version", $UnityVersion) }

New-Item -ItemType Directory -Force -Path $Out | Out-Null

# 1) 목록
$listDir = Join-Path $Out "list"
if (-not $SkipList) {
  Write-Host "== 1/4 목록만 뽑기 → $listDir\index.json"
  & $py extract.py @common --out $listDir --list
  & $py summarize.py (Join-Path $listDir "index.json") --depth 3 | Tee-Object -FilePath (Join-Path $Out "summary.txt")
}
if ($ListOnly) { Write-Host "목록만 뽑았습니다. $Out\summary.txt 를 보고 필터를 정하세요."; exit 0 }

# 2) 골라 추출. 이름|타입|정규식
$Filters = @(
  @{ name = "ui";    types = "sprite,tex"; match = "(?i)\bui\b|/ui/|icon|hud|button|frame|slot|gauge|popup|panel|badge|coin|sin_|status|buff|keyword|cursor" },
  @{ name = "bg";    types = "tex";        match = "(?i)background|\bbg\b|/bg/|bg_|_bg|battle_?bg|stage|scenery|backdrop|sky" },
  @{ name = "music"; types = "audio";      match = "(?i)bgm|music|\bost\b|theme|battle_?(theme|bgm)|title|lobby|ambien" }
)
$step = 2
foreach ($f in $Filters) {
  $dir = Join-Path $Out $f.name
  Write-Host "== $step/4 $($f.name) 추출 (types=$($f.types), match=$($f.match)) → $dir"
  & $py extract.py @common --out $dir --types $f.types --match $f.match
  $step++
}

Write-Host ""
Write-Host "완료. 결과: $Out"
Write-Host "  list\index.json  전체 목록 / summary.txt 요약"
Write-Host "  ui\sprite, ui\tex / bg\tex / music\audio  (.fsb 가 있으면 vgmstream-cli -o out.wav in.fsb)"
Write-Host "필터가 안 맞으면 summary.txt 의 container 경로를 보고 run-windows.ps1 의 `$Filters 를 고쳐 -SkipList 로 다시 돌리세요."
