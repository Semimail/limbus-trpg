# 림버스 컴퍼니 에셋 추출 일괄 실행 (Windows PowerShell)
# 1) 전체 목록(index.json) → 요약 출력  2) UI·아이콘 / 배경 / 음악을 골라 추출
#
#   cd scripts\limbus-extract
#   powershell -ExecutionPolicy Bypass -File .\run-windows.ps1
#   powershell -ExecutionPolicy Bypass -File .\run-windows.ps1 -Game "D:\Steam\steamapps\common\Limbus Company" -Out "D:\limbus-extracted"
#   powershell -ExecutionPolicy Bypass -File .\run-windows.ps1 -ListOnly      # 목록만
#   powershell -ExecutionPolicy Bypass -File .\run-windows.ps1 -All -SkipList # 필터 없이 전부(이미지·텍스트·폰트) + FMOD .bank 음악
#
# 필터 정규식은 아래 Filters 목록에서 고친다. 목록(index.json)의 container 경로를 보고 맞추면 된다.
param(
  [string]$Game = "C:\Program Files (x86)\Steam\steamapps\common\Limbus Company",
  [string[]]$Cache = @(),   # 비우면 LocalLow 아래 후보를 자동으로 찾는다
  [string]$Out = "$PSScriptRoot\extracted",
  [string]$UnityVersion = "",   # 비우면 LimbusCompany.exe 의 제품 버전(예: 6000.3.12f1)을 읽는다. 캐시 번들은 버전 머리말이 비어 있어 꼭 필요하다
  [switch]$ListOnly,
  [switch]$SkipList,
  [switch]$All
)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path $Game)) { throw "게임 폴더가 없습니다: $Game  (-Game 로 지정)" }
if ($Cache.Count -eq 0) {
  # Unity 기본 캐시(LocalLow\Unity\<회사>_<제품>)에 Addressables 번들(__data)이 쌓인다. 그 외 후보도 함께.
  $low = "$env:USERPROFILE\AppData\LocalLow"
  $Cache = @(
    "$low\Unity\ProjectMoon_LimbusCompany",
    "$low\ProjectMoon\LimbusCompany"
  ) | Where-Object { Test-Path $_ }
  # 그래도 __data 가 하나도 없으면 LocalLow 전체에서 __data 가 있는 최상위 폴더를 찾는다
  $hasData = $Cache | Where-Object { Get-ChildItem $_ -Recurse -Filter __data -ErrorAction SilentlyContinue | Select-Object -First 1 }
  if (-not $hasData) {
    $found = Get-ChildItem $low -Recurse -Filter __data -ErrorAction SilentlyContinue | Where-Object { $_.FullName -match "(?i)limbus" } | Select-Object -First 1
    if ($found) { $Cache += $found.Directory.Parent.FullName }
  }
}
$Cache = @($Cache | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique)
if ($Cache.Count -eq 0) { Write-Warning "캐시 폴더를 못 찾았습니다. 게임 폴더만으로 진행합니다. (-Cache 로 지정 가능)" }
else { Write-Host "캐시 폴더: $($Cache -join ' ; ')" }

# 가상환경 + UnityPy
if (-not (Test-Path ".venv\Scripts\python.exe")) {
  Write-Host "== 가상환경 만들기"
  python -m venv .venv
}
$py = ".\.venv\Scripts\python.exe"
& $py -m pip install -q -r requirements.txt

# Unity 버전: 다운로드 캐시(__data)의 번들은 머리말에 버전이 없어 UnityPy 가 "No valid Unity version" 으로 전부 실패한다 → exe 에서 읽어 넘긴다
if (-not $UnityVersion) {
  $exe = Join-Path $Game "LimbusCompany.exe"
  if (Test-Path $exe) {
    $pv = (Get-Item $exe).VersionInfo.ProductVersion   # "6000.3.12f1 (fca03ac9b0d5)"
    if ($pv -match "^\s*(\d+\.\d+\.\d+[a-z]\d+)") { $UnityVersion = $Matches[1] }
  }
}
if ($UnityVersion) { Write-Host "Unity 버전: $UnityVersion" } else { Write-Warning "Unity 버전을 못 읽었습니다. 캐시 번들이 전부 실패하면 -UnityVersion 6000.3.12f1 처럼 지정하세요." }

$common = @("--game", $Game)
foreach ($c in $Cache) { $common += @("--cache", $c) }
if ($UnityVersion) { $common += @("--unity-version", $UnityVersion) }

New-Item -ItemType Directory -Force -Path $Out | Out-Null
Start-Transcript -Path (Join-Path $Out "run.log") -Append | Out-Null

# 1) 목록
$listDir = Join-Path $Out "list"
if (-not $SkipList) {
  Write-Host "== 1/4 목록만 뽑기 → $listDir\index.json"
  & $py extract.py @common --out $listDir --list
  & $py summarize.py (Join-Path $listDir "index.json") --depth 3 | Tee-Object -FilePath (Join-Path $Out "summary.txt")
}
if ($ListOnly) { Write-Host "목록만 뽑았습니다. $Out\summary.txt 를 보고 필터를 정하세요."; Stop-Transcript | Out-Null; exit 0 }

# FMOD .bank → wav (림버스 음악·효과음은 Unity AudioClip 이 아니라 FMOD 뱅크에 들어 있다)
function Extract-Banks {
  $bankDir = Join-Path $Out "music\bank"
  $banks = @(Get-ChildItem -Path $Game -Recurse -Filter *.bank -ErrorAction SilentlyContinue)
  foreach ($c in $Cache) { $banks += @(Get-ChildItem -Path $c -Recurse -Filter *.bank -ErrorAction SilentlyContinue) }
  if ($banks.Count -eq 0) { Write-Host "FMOD .bank 파일이 없습니다."; return }
  New-Item -ItemType Directory -Force -Path $bankDir | Out-Null
  $banks | ForEach-Object { "$($_.Length)`t$($_.FullName)" } | Set-Content (Join-Path $bankDir "banks.txt")
  Write-Host "FMOD .bank $($banks.Count)개 → 목록 $bankDir\banks.txt"
  $vgm = Get-Command vgmstream-cli -ErrorAction SilentlyContinue
  if (-not $vgm) { $vgm = Get-Command (Join-Path $PSScriptRoot "vgmstream-cli.exe") -ErrorAction SilentlyContinue }
  if (-not $vgm) {
    Write-Warning "vgmstream-cli 가 없어 .bank 를 wav 로 못 풀었습니다. https://vgmstream.org 에서 Windows CLI 를 받아 PATH 나 이 폴더에 두고 다시 돌리세요."
    return
  }
  foreach ($b in $banks) {
    $d = Join-Path $bankDir $b.BaseName
    New-Item -ItemType Directory -Force -Path $d | Out-Null
    Write-Host "  $($b.Name) → $d"
    & $vgm.Source -S 0 -o (Join-Path $d "?n.wav") $b.FullName | Out-Null
  }
}

if ($All) {
  $dir = Join-Path $Out "all"
  Write-Host "== 전부 추출 (types=sprite,tex,text,font, 필터 없음) → $dir"
  & $py extract.py @common --out $dir --types sprite,tex,text,font
  Write-Host "== FMOD .bank 음악"
  Extract-Banks
  Write-Host ""
  Write-Host "완료. $dir\sprite, $dir\tex, $dir\text, $dir\font / $Out\music\bank"
  Stop-Transcript | Out-Null
  exit 0
}

# 2) 골라 추출. 이름|타입|정규식
$Filters = @(
  @{ name = "ui";    types = "sprite,tex"; match = "(?i)\bui\b|/ui/|icon|hud|button|frame|slot|gauge|popup|panel|badge|coin|sin_|status|buff|keyword|cursor" },
  @{ name = "bg";    types = "tex";        match = "(?i)background|\bbg\b|/bg/|bg_|_bg|battle_?bg|stage|scenery|backdrop|sky" },
  @{ name = "music"; types = "audio";      match = "(?i)bgm|music|\bost\b|theme|battle_?(theme|bgm)|title|lobby|ambien" },
  # 인격·E.G.O 그림 (다운로드 캐시에만 있음): Unit/CG 인격 일러스트(_normal/_gacksung), Unit/EgoCG E.G.O 일러스트, Unit/Profile·Info·Portrait 초상, PassiveBanner
  @{ name = "unit";  types = "tex";        match = "Resources_moved/Sprite/Unit/" },
  # SD 스프라이트 (Spine): 인격 Prefab/SD/Personality, E.G.O Prefab/SD/EGO — 아틀라스 페이지(tex) + 스켈레톤·.atlas(text)
  @{ name = "sd";    types = "tex,text";   match = "Resources_moved/Prefab/SD/(Personality|EGO)/" }
)
$step = 2
foreach ($f in $Filters) {
  $dir = Join-Path $Out $f.name
  Write-Host "== $step/6 $($f.name) 추출 (types=$($f.types), match=$($f.match)) → $dir"
  & $py extract.py @common --out $dir --types $f.types --match $f.match
  $step++
}
Write-Host "== FMOD .bank 음악"
Extract-Banks

Write-Host ""
Write-Host "완료. 결과: $Out"
Write-Host "  list\index.json  전체 목록 / summary.txt 요약"
Write-Host "  ui\sprite, ui\tex / bg\tex / music\audio  (.fsb 가 있으면 vgmstream-cli -o out.wav in.fsb)"
Write-Host "필터가 안 맞으면 summary.txt 의 container 경로를 보고 run-windows.ps1 의 `$Filters 를 고쳐 -SkipList 로 다시 돌리세요."
Stop-Transcript | Out-Null
