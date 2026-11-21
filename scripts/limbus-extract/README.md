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
- 런타임 다운로드 캐시(캐릭터·배경 대부분): Unity 기본 캐시 `%USERPROFILE%\AppData\LocalLow\Unity\ProjectMoon_LimbusCompany\` 아래 해시 이름 폴더의 `__data`. (`LocalLow\ProjectMoon\LimbusCompany`는 저장 데이터뿐이라 번들이 없다.) `run-windows.ps1`은 `-Cache`를 비우면 이 후보들을 자동으로 찾고, 없으면 LocalLow 전체에서 `__data`를 검색한다.
- 실측(2026-11-19): 설치 폴더 기본 에셋(resources/sharedassets)에 UI·아이콘이 대부분 있다(mainui 2.5천, battleui 677, icon 257, skill 356 스프라이트). 음악·효과음은 `StreamingAssets\Assets\Sound\FMODBuilds\Desktop\*.bank`(BGM_Default*.bank 등 761개).
- 실측(2026-11-21): **인격·E.G.O 그림은 전부 다운로드 캐시**(`LocalLow\Unity\ProjectMoon_LimbusCompany`, 번들 1,595개·16.7GB, 오브젝트 27만)에 있다. 캐시 번들은 머리말에 Unity 버전이 없어 `--unity-version`(exe 제품 버전, 지금 6000.3.12f1) 없이는 **전부 load_error** 로 떨어진다 — `run-windows.ps1` 이 exe 에서 자동으로 읽는다. 컨테이너 경로:
  - `Assets/Resources_moved/Sprite/Unit/CG/<인격id>_normal.png`, `_gacksung.png` — 인격 일러스트(각성 전·후), 379장
  - `Sprite/Unit/EgoCG/<egoid>_cg.png`(`_e_cg` = 침식) — E.G.O 일러스트 222장 · `Unit/Profile/Ego`, `Unit/Info/Ego`, `Unit/Profile/EgoBanner` — E.G.O 초상·배너
  - `Sprite/Unit/Profile/Normal`, `Unit/Info/Normal`, `Unit/Portrait` — 인격 초상(원형·사각·스토리), `Unit/PassiveBanner*` — 패시브 띠
  - SD 스프라이트(Spine 아틀라스)는 `Assets/Resources_moved/Prefab/SD/Personality/<id>_<이름>Appearance.prefab`(171), `Prefab/SD/EGO/ErosionAppearance_<id>.prefab`(91), `Prefab/SD/Enemy`(236), `Prefab/SD/Abnormality`(103)
  - 인격 id: 1AAnn (AA=수감자 01~12, nn=인격 번호), E.G.O id: 2AAnn. 예 10805 = 이스마엘 5번 인격.

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
- **음악·효과음은 Unity AudioClip이 아니라 FMOD `.bank`**(`LimbusCompany_Data\StreamingAssets\...\*.bank`)에 들어 있다. `run-windows.ps1`이 `.bank` 목록을 `extracted\music\bank\banks.txt`에 쓰고, [vgmstream](https://vgmstream.org) Windows CLI(`vgmstream-cli.exe`)가 PATH나 이 폴더에 있으면 뱅크마다 폴더를 만들어 전 트랙을 wav로 푼다. 수동: `vgmstream-cli -S 0 -o "out\?n.wav" Master.bank`.
- Addressables 번들은 컨테이너 경로가 비어 있는 경우가 많다. 그때는 `<번들 파일명>/<에셋 이름>.png`로 떨어지고, `summarize.py`는 출처 번들별·이름 앞 단어별로 센다. 필터는 이름에도 적용되니 `--match "(?i)icon"` 같은 식으로 쓴다.
- 필터 없이 전부 꺼내려면 `run-windows.ps1 -All -SkipList` (이미지·텍스트·폰트 전부 + .bank).
- 오디오가 `.fsb`로 떨어지면 [vgmstream](https://vgmstream.org) CLI로 변환: `vgmstream-cli -o out.wav in.fsb`.
- Unity 버전 추정 실패 오류("No valid Unity version found")가 나면 `--unity-version 6000.3.12f1`(설치 폴더 `LimbusCompany.exe` 속성의 제품 버전). 캐시 번들은 항상 필요하다.
- 인격·E.G.O 만 다시 뽑기: `python extract.py --cache "%USERPROFILE%\AppData\LocalLow\Unity\ProjectMoon_LimbusCompany" --out extracted\cache\unit --types tex --match "Resources_moved/Sprite/Unit/" --unity-version 6000.3.12f1` (약 2,600장).
- SD 스프라이트만 다시 뽑기(2026-11-21): `python extract.py --cache "%USERPROFILE%\AppData\LocalLow\Unity\ProjectMoon_LimbusCompany" --out extracted\cache\sd --types tex,text --match "Resources_moved/Prefab/SD/(Personality|EGO)/" --unity-version 6000.3.12f1`. 프리팹 262개(인격 171·E.G.O 91), 오브젝트 4,288개.
  - 림버스 SD 는 **Spine 4.0** 이다. 출력은 프리팹 폴더 아래 오브젝트 이름 그대로(`extract.py` 가 `.prefab` 컨테이너는 `<프리팹>/<이름>` 으로 저장): `tex/…/Personality/10805_Ishmeal_FairyAppearance/fairy_ism.png`(Spine 페이지) + `sactx-N-…png`(Unity 스프라이트 아틀라스 페이지, 조각 묶음) + `dead.png` 등, `text/…/10805_…/fairy_ism.json`(스켈레톤 JSON, spine 4.0.64) + `fairy_ism.atlas`(페이지 이름 `fairy_ism.png` 참조). 한 장짜리 "정지 SD"는 없고 포즈·모션은 스켈레톤 애니메이션이라 **그대로는 못 쓴다** — 정지 1장은 Spine 런타임(spine-ts/spine-player 4.0)으로 json+atlas+png 를 렌더해 찍거나, 아틀라스에서 조각을 골라 쓴다. 스켈레톤 json 안의 `audio` 경로 같은 제작사 내부 경로는 신경 쓰지 않는다.
  - 적·환상체·시즌 폴더(`Prefab/SD/Enemy` 1,881 · `Abnormality` 1,015 · `SEASON7/8/*`)는 필터에 넣지 않았다. 필요하면 `--match` 를 넓힌다.
- **SD 정지 이미지 렌더(2026-11-21)**: `sd-render/` — `python sd-render\server.py --root extracted\cache\sd --out extracted\cache\sd-render --port 8765` 를 띄우고 브라우저(WebGL 되는 크롬 계열)로 `http://127.0.0.1:8765/` 를 열면 `index.html`(spine-webgl 4.0.31, unpkg)이 프리팹마다 json+atlas+png 를 불러 idle(없으면 animation) 0초 포즈를 투명 PNG 로 찍어 서버에 POST → `extracted/cache/sd-render/<그룹>__<프리팹>__<스켈레톤>.png` (265장, 약 206MB). `?only=Personality/10401_Ryoshu_BaseAppearance` 하나만, `?skip=0` 이미 있는 것도 다시, `?scale=0.5` 단위당 픽셀, `?anim=none|이름&t=초`.
  - **아틀라스 보정이 핵심**: Unity 가 Spine 페이지 PNG 를 2의 거듭제곱 크기로 늘려 저장해(예 764×1068 → 512×1024, 311페이지 중 224가 불일치) 그대로 주면 spine-ts 가 메시 UV 를 실제 텍스처 크기로 계산해 메시 부위(몸통 등)가 사라진다. `server.py` 의 `fix_atlas()` 가 `.atlas` 를 줄 때 `size`·`bounds`·`offsets` 를 실제 PNG 비율로 고쳐 준다(rotate:90 리전은 w/h 축이 바뀌어 있어 반대 비율). 페이지 이름이 `<이름>_N.png` 로 바뀐 것도 찾는다.
  - 텍스처는 PMA(premultiplied) 라 `drawSkeleton(skeleton, true)`. 프리팹마다 root 본 스케일이 달라(0.3~1) 결과 크기가 제각각 — 같은 크기로 쓰려면 `.venv\Scripts\python.exe sd-renderit.py --src extracted\cache\sd-render --out extracted\cache\sd-512 --size 512` (투명 여백 트리밍 + 512 상자 맞춤).
  - 서버는 HTTP/1.1 keep-alive(HTTP/1.0 이면 브라우저 연결이 폭주해 `ERR_CONNECTION_TIMED_OUT`), 페이지는 3회 재시도. 265장 한 번에 약 40초.
- 캐릭터 스탠딩은 Spine(TextAsset `.skel`/`.atlas` + Texture2D)으로 들어 있을 수 있다. 정지 이미지로 쓰려면 아틀라스 PNG를 잘라 쓰고, 애니메이션 재생은 spine-ts 런타임(별도 라이선스 조건)이 필요하므로 일단 정지 이미지 권장.

## 4. 프로젝트에 넣기
- 소량(아이콘·UI 조각·배경 몇 장)은 기존처럼 `apps/web/public/assets/limbus/<종류>/`에 PNG로.
- 음악·대량 배경처럼 큰 파일은 깃에 넣지 말고 Supabase Storage(비공개 버킷 + 서명 URL)에 올리는 쪽을 권장. 필요하면 업로드 스크립트를 추가한다.
