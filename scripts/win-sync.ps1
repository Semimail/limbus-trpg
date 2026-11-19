# D:(exFAT, 심볼릭 링크 불가) 작업 폴더를 C:(NTFS) 미러로 복사한 뒤 거기서 pnpm install / typecheck / lint / build 를 돌린다.
# 사용: .\scripts\win-sync.ps1            (미러 갱신 + 필요 시 install + typecheck·lint·build)
#       .\scripts\win-sync.ps1 -Run none  (미러만 갱신)
#       .\scripts\win-sync.ps1 -Install   (pnpm install 강제)
#       .\scripts\win-sync.ps1 -Run test  (packages/rules vitest)
# Node 는 fnm 으로 받은 24 를 쓴다 (Tailwind 4 빌드가 Node 20 에서 실패). 미러에는 .git 이 없다. 커밋은 D: 에서 한다.
param(
  [string]$Mirror = "C:\dev\limbus-trpg",
  [switch]$Install,
  [ValidateSet('typecheck', 'lint', 'build', 'test', 'all', 'none')][string]$Run = 'all',
  [string]$NodeVersion = '24'
)
$ErrorActionPreference = 'Stop'
$src = Split-Path $PSScriptRoot -Parent

robocopy $src $Mirror /MIR /XD node_modules .next .git assets-src extracted /XF *.log /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy 실패 (코드 $LASTEXITCODE)" }
Write-Host "미러 갱신: $Mirror"

$fnm = (Get-Command fnm -ErrorAction SilentlyContinue).Source
if (-not $fnm) { $fnm = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Schniz.fnm_Microsoft.Winget.Source_8wekyb3d8bbwe\fnm.exe" }
if (-not (Test-Path $fnm)) { throw "fnm 이 없습니다 (winget install Schniz.fnm)" }

function Invoke-Pnpm([string[]]$pnpmArgs) {
  # pnpm 은 .cmd 셰임이라 fnm exec 가 직접 못 띄운다 → cmd 를 거친다 (PATH 에 fnm 의 node 가 앞서 있음)
  # stderr 를 cmd 안에서 합쳐 PowerShell 의 NativeCommandError 래핑(경고가 오류처럼 보임)을 피한다
  & $fnm exec --using $NodeVersion -- cmd /c "pnpm $($pnpmArgs -join ' ') 2>&1"
  if ($LASTEXITCODE) { throw "pnpm $($pnpmArgs -join ' ') 실패 (코드 $LASTEXITCODE)" }
}

Push-Location $Mirror
try {
  if ($Install -or -not (Test-Path (Join-Path $Mirror 'node_modules'))) {
    Invoke-Pnpm @('install', '--frozen-lockfile')
  }
  $steps = switch ($Run) {
    'all'  { @('typecheck', 'lint', 'build') }
    'none' { @() }
    default { @($Run) }
  }
  foreach ($s in $steps) {
    Write-Host "== pnpm $s =="
    Invoke-Pnpm @($s)
  }
  if ($steps.Count) { Write-Host "모두 통과: $($steps -join ', ')" }
} finally { Pop-Location }
