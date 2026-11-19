# 림버스 원본 아틀라스 보관소 (비공개 팬 프로젝트 전용)

원작 에셋 드라이브가 비활성화되어, 세션 중 받아 둔 원본을 여기 보관한다. 웹에서 직접 쓰지 않고(빌드에 포함되지 않음),
필요한 조각을 잘라 `apps/web/public/assets/limbus/` 아래에 넣어 쓴다. 공개 배포·홍보 금지.

- `ui/` — `UI/Battle` 아틀라스 19장 (BattleUI_UpperLeft_1/2/7, ActionSlotUI, Turn, Battlestart, BattleUnit_Gauge, Choice_5/7, Popup_2, InfoPopup_new_1, PassivePanel, CreatureBattle_2/3, EGO, EndGear/StartGear, skill_target_num_icon). 이미 잘라 쓴 조각은 `public/assets/limbus/ui/*.png`.
- `icons/` — Icons 폴더 원본 40장 (Icon_Common·Icon_SkillFrame·Icon_skillFrame_1·Icon_AttackType·Icon_DamageType·죄악 7종·상태이상·Coin_F/B·DebuffPlate·TempResistIcon·textIcons 등) + BackStreet_1 배경.
- `bg/` — 합성된 전투 배경 원본(underground, checkpoint, fathoms). 웹용 jpg는 `public/assets/limbus/bg/`.

자르는 방법: PIL로 아틀라스를 열어 미리보기 격자(128px 눈금)를 그려 좌표를 잡고, 대략적인 사각형으로 crop한 뒤 알파 bbox로 여백을 자동 보정, 최대 변 길이를 제한해 저장. (세션 scratchpad의 스크립트를 썼고, STATUS "전투 화면 v4" 항목 참고.)
