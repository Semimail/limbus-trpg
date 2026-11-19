# 림버스 컴퍼니 클라이언트 에셋 추출 (사용자 PC에서 실행)

비공개·비영리 팬 프로젝트 내부 용도 전제. 꺼낸 원본은 공개 저장소·공개 URL에 올리지 않는다.

## 1. 준비 (Windows, Python 3.10+)
```
cd scripts/limbus-extract
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
```

## 2. 데이터 위치
- 설치 폴더(스팀 기본): `C:\Program Files (x86)\Steam\steamapps\common\Limbus Company\`
  - `LimbusCompany_Data\sharedassets*.assets`, `resources.assets`, `*.resource`(오디오 원본), `globalgamemanagers`
  - `LimbusCompany_Data\StreamingAssets\aa\...\*.bundle` (Addressables 로컬 번들)
- 런타임 다운로드 캐시(대부분의 캐릭터·배경·UI·음악은 여기): `%USERPROFILE%\AppData\LocalLow\ProjectMoon\LimbusCompany\` 아래 (`com.unity.addressables` 폴더 또는 해시 이름 폴더의 `__data`). 폴더명이 다르면 `LocalLow` 안에서 `__data` 파일을 검색해 찾는다.

## 3. 한 번에 돌리기 (권장)
PowerShell에서 아래 한 줄이면 가상환경 설치 → 전체 목록(`extracted\list\index.json` + `summary.txt`) → UI·아이콘(`ui\`) / 배경(`bg\`) / 음악(`music\`) 추출까지 이어서 한다.
```
cd scripts\limbus-extract
powershell -ExecutionPolicy Bypass -File .\run-windows.ps1
```
- 경로가 다르면 `-Game "..." -Cache "..." -Out "D:\limbus-extracted"`. 목록만 보려면 `-ListOnly`, 목록은 두고 필터만 바꿔 다시 뽑으려면 `-SkipList`.
- `summary.txt`(= `python summarize.py extracted\list\index.json`)에서 container 폴더별 개수를 보고, 안 맞으면 `run-windows.ps1`의 `$Filters` 정규식을 고친다. `python summarize.py ... --grep "(?i)bgm"` 으로 특정 항목만 나열할 수 있다.

## 3-1. 직접 실행
목록만 먼저 뽑아 뭐가 있는지 본다:
```
python extract.py --game "C:\Program Files (x86)\Steam\steamapps\common\Limbus Company" --cache "%USERPROFILE%\AppData\LocalLow\ProjectMoon\LimbusCompany" --out D:\limbus-extracted --list
```
`index.json`의 `container` 경로를 보고 필터를 정해 실제 추출:
```
python extract.py --game "..." --cache "..." --out D:\limbus-extracted --types sprite,tex --match "(?i)ui|icon"
python extract.py --game "..." --cache "..." --out D:\limbus-extracted --types audio --match "(?i)bgm|music"
python extract.py --game "..." --cache "..." --out D:\limbus-extracted --types tex --match "(?i)background|bg_"
```
- 오디오가 `.fsb`로 떨어지면 [vgmstream](https://vgmstream.org) CLI로 변환: `vgmstream-cli -o out.wav in.fsb`.
- Unity 버전 추정 실패 오류가 나면 `--unity-version 2022.3.xxf1`(설치 폴더 exe 속성에서 확인).
- 캐릭터 스탠딩은 Spine(TextAsset `.skel`/`.atlas` + Texture2D)으로 들어 있을 수 있다. 정지 이미지로 쓰려면 아틀라스 PNG를 잘라 쓰고, 애니메이션 재생은 spine-ts 런타임(별도 라이선스 조건)이 필요하므로 일단 정지 이미지 권장.

## 4. 프로젝트에 넣기
- 소량(아이콘·UI 조각·배경 몇 장)은 기존처럼 `apps/web/public/assets/limbus/<종류>/`에 PNG로.
- 음악·대량 배경처럼 큰 파일은 깃에 넣지 말고 Supabase Storage(비공개 버킷 + 서명 URL)에 올리는 쪽을 권장. 필요하면 업로드 스크립트를 추가한다.
