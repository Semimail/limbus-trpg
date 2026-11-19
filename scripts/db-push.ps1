# Supabase 관리 API로 마이그레이션 SQL을 실행한다 (Windows PowerShell 5.1 이상).
# 사용: .\scripts\db-push.ps1 -Path supabase\migrations\0010_sprite_jobs.sql
#   토큰은 환경 변수 SUPABASE_ACCESS_TOKEN 이 있으면 그걸 쓰고, 없으면 화면에 안 보이게 입력받는다 (채팅·파일에 적지 않는다).
#   프로젝트 ref 는 SUPABASE_PROJECT_REF (기본 zbfznstcqejwtssfzttf).
param(
  [Parameter(Mandatory = $true)][string]$Path,
  [string]$Verify = ""   # 적용 뒤 확인용 SQL (선택). 결과 JSON을 그대로 출력
)
$ErrorActionPreference = "Stop"
$ref = if ($env:SUPABASE_PROJECT_REF) { $env:SUPABASE_PROJECT_REF } else { "zbfznstcqejwtssfzttf" }
$token = $env:SUPABASE_ACCESS_TOKEN
if (-not $token) {
  $sec = Read-Host -AsSecureString "Supabase 관리 토큰 (sbp_..., 입력은 표시되지 않음)"
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
if (-not $token) { throw "토큰이 비어 있습니다" }
if (-not (Test-Path $Path)) { throw "SQL 파일 없음: $Path" }

function Invoke-SupabaseQuery([string]$sql) {
  $body = @{ query = $sql } | ConvertTo-Json -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($body)
  return Invoke-RestMethod -Method Post -Uri "https://api.supabase.com/v1/projects/$ref/database/query" `
    -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json; charset=utf-8" -Body $bytes
}

$sql = [IO.File]::ReadAllText((Resolve-Path $Path), [Text.Encoding]::UTF8)
try {
  $r = Invoke-SupabaseQuery $sql
  Write-Host "OK 적용됨: $Path"
  if ($r) { $r | ConvertTo-Json -Depth 5 -Compress | ForEach-Object { if ($_.Length -gt 300) { $_.Substring(0, 300) } else { $_ } } }
} catch {
  Write-Host "FAIL $($_.Exception.Message)"
  if ($_.ErrorDetails) { Write-Host $_.ErrorDetails.Message }
  exit 1
}
if ($Verify) {
  $v = Invoke-SupabaseQuery $Verify
  Write-Host "확인:"
  $v | ConvertTo-Json -Depth 5
}
