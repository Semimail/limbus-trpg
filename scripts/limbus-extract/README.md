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
  - 텍스처는 PMA(premultiplied) 라 `drawSkeleton(skeleton, true)`. 프리팹마다 root 본 스케일이 달라(0.3~1) 결과 크기가 제각각 — 같은 크기로 쓰려면 `.venv\Scripts\python.exe sd-render\fit.py --src extracted\cache\sd-render --out extracted\cache\sd-512 --size 512` (투명 여백 트리밍 + 512 상자 맞춤).
  - 서버는 HTTP/1.1 keep-alive(HTTP/1.0 이면 브라우저 연결이 폭주해 `ERR_CONNECTION_TIMED_OUT`), 페이지는 3회 재시도. 265장 한 번에 약 40초.
  - **Spine 에는 idle 애니메이션 하나뿐**(265 스켈레톤 중 268 애니메이션, 이름 `animation`/`idle`). 다른 자세는 아래 자세 스프라이트.
- **SD 자세 스프라이트(2026-11-21, "모든 자세")**: 스킬·피격·방어·회피·사망·이동 자세는 Spine 이 아니라 같은 프리팹 안의 **Unity Sprite**(SpriteAtlas `Base_SDAtlas` 등에서 잘라내는 조각)다. `python extract.py --cache "%USERPROFILE%\AppData\LocalLow\Unity\ProjectMoon_LimbusCompany" --out extracted\cache\sd-pose --types sprite --match "Resources_moved/Prefab/SD/(Personality|EGO)/" --unity-version 6000.3.12f1` (`run-windows.ps1` 의 `sd-pose` 필터, 약 45분) → `extracted/cache/sd-pose/sprite/Resources_moved/Prefab/SD/<그룹>/<프리팹>/<자세>.png`, 프리팹 259개(인격 168·E.G.O 91)·15,819장·1.27GB(저장소 제외).
  - 이름: `idle`(가끔 `Default`/`idel`/`standing`), `mov`/`move`, `gud`(방어), `dmg`(피격), `miss`(회피), `dead`, `skill1_N`/`skill2_N`/`skill3_N`(스킬별 프레임, E.G.O 는 `skill_N`·`skill1_N`), `…_e`/`…_eN`(그 프레임의 이펙트 레이어), `1`~`5`(피 튀김 공용), `Fx_T_Shape_*`(공용 이펙트). 같은 이름이 둘이면 `__2` 가 붙는데 **다른 레이어**다(예: 인물 + 괴물 부위) — 합쳐 써야 한 프레임. 효과 텍스처 6개는 번들 미다운로드로 실패(무시).
  - 크기 맞춤: `.venv\Scripts\python.exe sd-render\fit.py --src extracted\cache\sd-pose\sprite\Resources_moved\Prefab\SD --out extracted\cache\sd-pose-512 --size 512 --recursive` — 프리팹마다 idle 이 512 상자에 맞는 **공통 배율**로 전부 축소(자세별로 따로 맞추면 웅크린 컷이 커져 버림). 대부분 원본이 이미 500px 안팎이라 거의 그대로. 확인용 격자: `sd-render\sheet.py <폴더> out.png --recursive --only idle`.
- **나머지 SD 전부(2026-11-21, "환상체랑 다른 sd 전부")**: `run-windows.ps1` 의 `sd-abno`(환상체) / `sd-enemy`(적) / `sd-season`(`SEASON7|8/*`, `DeadScene`, `Prefab/SD/` 바로 아래 프리팹 = 신규 시즌 인격·E.G.O) 필터, 각각 `--types sprite,tex,text` 로 Spine 세트와 자세 Sprite 를 한 번에 → `extracted/cache/sd-abno|sd-enemy|sd-season/`(저장소 제외).
  - 자세 Sprite: 환상체 프리팹 102개 11,072장(485MB) · 적 229개 7,962장(644MB) · 시즌 206개 15,571장(1.39GB). 적은 인격과 같은 이름 규칙(idle/move/gud/dmg/miss/dead/skillN_M). **환상체·시즌 보스는 `s{스킬}_f{프레임}_l{레이어}_p{부위}_n|d|nd` 식 부위 레이어**가 많다(한 프레임이 여러 조각) — 통째로 쓰려면 겹쳐야 하고, 정지 1장은 Spine 렌더 쪽이 낫다. 512 사본은 같은 `sd-pose-512/` 아래 `Abnormality/`, `Enemy/`, `SEASON7/…` 로 합쳐 둠.
  - Spine idle 렌더: `server.py` 가 `--root` 를 여러 번 받고 `text/…/Prefab/SD/` 아래를 깊이 무관하게 훑는다(id 는 폴더 상대 경로, 파일명은 `/`→`__`). `python sd-render\server.py --root extracted\cache\sd --root extracted\cache\sd-abno --root extracted\cache\sd-enemy --root extracted\cache\sd-season --out extracted\cache\sd-render` → 733 항목 중 730장 성공(인격 175 · E.G.O 90 · 환상체 86 · 적 187 · 시즌7 70 · 시즌8 54 · 신규·DeadScene 68, 합계 508MB). 실패 3: atlas 없음 1, 페이지 없음 1, 아틀라스에 리전 없음 1(`1365_Chicken_SuperElite_Mirror`).
  - **스킨 함정**: 환상체·적 스켈레톤은 기본 스킨이 비어 있고 이름 있는 스킨(`normal`/`destroy`, `villager_of_rodion_a` …)만 있어 그대로 찍으면 "빈 경계". `index.html` 이 기본 스킨이 비면 `normal`→`default`→첫 스킨을 고르고, 그래도 비면 다른 스킨·다른 시각(0.5/1/2초)을 차례로 시도한다. `?skin=이름` 으로 지정 가능. 멀티 스켈레톤 프리팹(부위마다 json)은 부위별로 따로 나온다. 브라우저 탭이 숨겨져 있으면 타이머가 1초로 느려져 300장에 20분쯤 걸린다(보이게 두면 1분 안팎).
- **배경(2026-11-21)**: `bg2` 필터(`--types tex`) → `extracted/cache/bg/tex/`: `Resources_moved/Story/Backgrounds/<에피소드|Default|Bus_*>/` 스토리 배경 663장(거의 1920×1080, 970MB — `Default/` 27장이 범용: 뒷골목·버스 안·공원·사무실·로보토미 등), `Resources_moved/Prefab/Battle/BattleMapPresets/BattleMapPreset_*/` 전투 맵 327개(2,948장, 2.2GB — 프리셋마다 2000×1200 바탕 1~3장(`back`, `back_1..3`, `floor`, `back_fog`, `dark_1`) + `sactx-*` 소품 아틀라스; 바탕 한 장만 쓰려면 sactx 아닌 것 중 가장 큰 png), `Prefab/Dungeon/Mirror/Background/` 15장.
- **스토리 스탠딩 = LD(2026-11-21)**: `standing` 필터 → `extracted/cache/standing/`. 세 종류: `Story/StandingModel/<이름>.psb`(수감자·주요 NPC 382개, Unity PSD Importer 레이어 모델 = `default` 몸 + `face_*` 표정 + `pivot`; Sprite 만 뽑으면 전부 `<이름>.psb.png, __2…` 로 나와 이름·위치를 잃는다), `Story/StandingSprite/*.png`(단장 스탠딩 350장), `Story/StoryPortrait/`(448장). **`standing-compose.py`** 가 번들을 직접 열어 SpriteRenderer→GameObject→Transform 으로 레이어 이름·월드 위치·정렬 순서를 읽고 몸+표정을 합성한다: `.venv\Scripts\python.exe standing-compose.py --cache "%USERPROFILE%\AppData\LocalLow\Unity\ProjectMoon_LimbusCompany" --out extracted\cache\standing-composed --cab-map cab_map.json` → `standing-composed/<경로>/<이름>/default.png, face_smile.png …` + `layers.json`. `--cab-map` 은 CAB 이름→`__data` 경로 json — `cab-map.py --cache … --out extracted\cab_map.json` 으로 만든다(없으면 번들 전체를 훑어 더 느림). 위치는 Transform 누적 × PixelsToUnits(100), 피벗 0.5/0.5 기준. 표정 이름은 `face_smile/angry/sad/surprise/idle/close/shock/dark…` + `_L/_R`(얼굴 방향).
- 캐릭터 스탠딩은 Spine(TextAsset `.skel`/`.atlas` + Texture2D)으로 들어 있을 수 있다. 정지 이미지로 쓰려면 아틀라스 PNG를 잘라 쓰고, 애니메이션 재생은 spine-ts 런타임(별도 라이선스 조건)이 필요하므로 일단 정지 이미지 권장.

## 4. 프로젝트에 넣기
- 소량(아이콘·UI 조각·배경 몇 장)은 기존처럼 `apps/web/public/assets/limbus/<종류>/`에 PNG로.
- 음악·대량 배경처럼 큰 파일은 깃에 넣지 말고 Supabase Storage(비공개 버킷 + 서명 URL)에 올리는 쪽을 권장. 필요하면 업로드 스크립트를 추가한다.

## 전투 UI 조각 (2026-11-23, 사용자 "UI 추출한 거 그대로 가져온다면?" → "전투 화면부터")
설치 폴더 추출본 `extracted/all/sprite/{resources,sharedassets3,…}/BattleUI_*.png` 은 Unity Sprite 단위라 이미 정확히 잘려 있다(459장). 그중 전투 화면에 쓰는 134장을 이름을 붙여 `apps/web/public/assets/limbus/ui/b/` 에 복사했고(복사 스크립트 `ui-pick-battle.py`, 아래 표가 그 안의 M 과 같다), 폰트 `ExcelsiorSans.ttf`·`BebasKai.ttf`·`SCDream5.otf`(`extracted/all/font/resources/`)를 `apps/web/public/assets/limbus/font/` 에 넣었다. 옛 눈대중 조각 `ui/*.png` 54장은 세션 무대(`stage.tsx` plate-tag)와 CSS 일부가 아직 써서 남겨 둠. 가족별 확인 시트: `ui-family-sheets.py <조각 폴더> <출력 폴더>`(PIL, BattleUI_/MainUI_ 가족 prefix 별 이름표 격자).

| 공방 이름 | 원본 (`<폴더>/BattleUI_…`) | 쓰임 |
|---|---|---|
| hud-turn / hud-wave / hud-enemy | sharedassets3 UpperLeft_1_24 / _23 / _40 | 좌상단 TURN·ENEMY 플레이트(숫자는 오른쪽 칸) |
| tag-enemy, hud-panel, hud-plate | UpperLeft_1_41, _1_20, _1_44 | ENEMY 꼬리표(유닛 카드), 로그 카드 9조각, 플레이트 |
| plate-red-off / plate-red-on | UpperLeft_1_4 / _5 | 승률·피해량 토글 |
| btn-play / btn-pause / btn-gear / btn-fwd / btn-arrows-off·on / btn-glow | UpperLeft_1_29 / _26 / _19 / _36 / _16·_18 / _28 | 우상단 사각 버튼, 켜짐 글로우 |
| arm-l / arm-r, side-gold / side-red, hazard-v | UpperLeft_1_37 / _38, _22 / _42, _39 | 스킬 띠 양끝 팔, 세로 틀 |
| slot-base / slot-empty / slot-break / slot-glow / slot-link / slot-vanish | sharedassets3 ActionSlotUI_outline / _empty / _break / _1 / _linkline / _vanish | 속도 다이스(팔각): 바탕·빈 틀·흐트러짐·선택 글로우 |
| gauge-frame / gauge-fill / gauge-emblem / gauge-gear / gauge-corner | BattleUnit_Gauge_0 / _1 / _2 / _3 / _4 | 초상 칠각 게이지(왼쪽 빨강 체력, 오른쪽 파랑 정신력 — conic mask) |
| die-enemy / die-enemy-fill, creature-break, splat-red | CreatureBattle_SkillSlot_hp_bg / _hp, CreatureBattle_break, DestroyedPartBg | 적 다이스(붉은 칠각) |
| chip-frame / chip-mask / chip-ego / chip-gold / chip-outline / chip-emblem | resources Choice_7_0 / Operation_1_0 / Choice_8_1 / Choice_7_30 / _7_1 / _7_28 | 스킬 칩(팔각 청동 틀 + 죄악색 마스크), E.G.O 주황 글로우 |
| oct-dark / oct-red / oct-bronze / oct-arc / oct-crack / oct-panel / oct-outline | Operation_1_30 / _9 / _6 / _34 / _24 / _16 / _21 | 라운드 버튼(붉은 팔각 + 청동 테) 등 |
| start-gear / start-lever | Turn_5 / Operation_1_23 | 라운드 버튼 뒤 도는 기어 |
| panel-wide / panel-tall / panel-sq / panel-black / panel-popup / panel-grey | Choice_7_24 / _26 / _16 / _5 / Choice_8_0 / _7_19 | `.b-pane` 9조각(panel-wide) 등 |
| card-ally / card-enemy / card-glow-gold / card-glow-red | PassivePanel_new_0 / _19 / _18 / _20 | 유닛 카드 9조각(아군 청동·적 빨강) |
| hazard-bar / pill-dark / bar-gold / card-dark | PassivePanel_new_23 / _25 / _3 / _5 | 머리띠(`.b-head-plate`) |
| plate-brown / plate-dark / plate-white / bar-grey / bar-brush / bar-redglow | Choice_8_6 / _7 / _8 / _3 / Choice_7_15 / _18 | 하단 탭·버튼(`.b-tabx`, `.b-btn`), 적 머리띠 |
| plate-slant-w / -s / -d / -x, name-box, dots | CoinPopup_1_21 / _18 / _28 / _26, _1_37, _1_41 | 속도 숫자·이름(흰 사선 플레이트), 상태 바(어두운 사선), 컷인 스킬 상자 |
| btn-red / btn-red2 / paper | Choice_5_21 / _17 / _20 | (예비) |
| coin-heads / coin-tails / coin-glow / coin-break / coin-hept-w / coin-hept-b | CoinPopup_coin / _back / _coin2 / _break / _1_30 / _1_39 | (예비: 지금 코인은 `coins/`) |
| ico-heart / ico-shield / ico-boot / ico-swords / ico-x | Popup_4_2 / _3 / _4 / _5(sharedassets5) / _7 | HUD·상태 바 아이콘 |
| ico-check / ico-x-w / ico-tri / ico-mind / ico-warn / ico-key / ico-exit / ico-skip / ico-up / ico-lock | DanteAbility_01_17 / _16 / _21, EGO_new_4, EGO_new_3, UpperLeft_1_47, Choice_5_2, Choice_7_6, _7_32, resources icon_lock | 정신력(뇌)·확정 자물쇠 등 |
| txt-turn / turn-lines / turn-lines-gold / turn-band | Turn_0 / _1 / _3 / _7 | 라운드 플래시 "TURN n" |
| txt-victory / txt-defeat / txt-survived / result-branch-l·r / result-lines-gold / result-line-red / result-band(-wide) / txt-continue | Result_6 / _0 / _12 / _4·_5 / _8 / _1 / _11·_14 / StageContinue_02_4 | 승리·패배 배너(`ResultBanner`) |
| threat-zayin / -teth / -he / -waw / -aleph / -aleph2 / -unknown, tag-new, x-red | CreatureBattle_3_0 / _12 / _15 / _22 / _26 / _38 / _18, _19, _33 | 적 등급 꼬리표(뜬소문=ZAYIN … 별=ALEPH(빨강), 불순물=???) |
| banner-red / battle-ring / battle-star / smudge | Battlestart_0 / _2 / _3 / _1 | 맨 아래 붉은 바 |
| link-blue / link-orange, crosshair / crosshair2 | Operation_2_1 / _3, CreatureBattle_3_4 / _5 | (예비) |

미리보기: `apps/web/src/app/dev/battle/page.tsx` — 로그인·DB 없이 가짜 전투로 전투 화면만 본다(프로덕션 404, `proxy.ts` 가 개발에서만 `/dev/*` 통과). 그림은 `apps/web/public/dev/`(저장소 제외)에 `ally1.png ally2.png enemy1.png enemy2.png bg.png` 를 두면 쓴다. `?ended=1` 종료, `?replay=win|lose` 뒤 "다시 보기"로 VICTORY/DEFEAT 연출, `?gm=0` 플레이어 시점.

## 사이트 틀 조각 (2026-11-23, 사용자 "사이트 틀 자체가 림버스가 아니라서" + 폰트 글 https://www.postype.com/@bysmile0824/post/14436984)
`MainUI_common_Popup_01/03`, `MainUI_UserInfo_1`, `MainUI_Settings_3` 에서 47장을 골라 `apps/web/public/assets/limbus/ui/s/`(2.1MB) 에 복사(`ui-pick-shell.py`, 이름·원본·쓰임 주석은 그 안에). 쓰임: `header-red`(상단 바 배경, UserInfo_1_0 붉은 질감), `panel`(패널 9조각, UserInfo_1_1 검정+청동 테), `card`(목록 항목, common_Popup_03_6), `btn-normal/hover/focus`(버튼 세 상태, common_Popup_01_btn_t1_*), `bar-input`, `plate-slant`(스탬프), `bg-texture`(페이지 배경, Settings_3_8), `line`, 아이콘(x·gear·check·lock·new·warn·search·refresh·docs), 스크롤바, 팔각 틀.
폰트(게임 파일 `extracted/all/font/resources/`, 포스타입 글은 영문 = Bebas Neue, 타이틀 = Tagmarker 라고 함): 본문 `SCDream5.otf`, 제목 `KOTRA_BOLD.ttf`, 영문·숫자 `BebasKai.ttf`(Bebas Neue 계열), 전투 제목 `ExcelsiorSans.ttf` → `apps/web/public/assets/limbus/font/`. Tagmarker 는 게임 파일에 없고 라이선스가 불분명해 안 씀. 미리보기 `/dev/shell`.
