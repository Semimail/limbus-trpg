# 원작 BattleUI 조각(설치 폴더 추출본)을 이름을 붙여 apps/web/public/assets/limbus/ui/b/ 로 복사한다.
import os, shutil, sys
SRC = r"D:\new\limbus-trpg-claude-admiring-feynman-wbms4a\scripts\limbus-extract\extracted\all\sprite"
DST = r"D:\new\limbus-trpg-claude-admiring-feynman-wbms4a\apps\web\public\assets\limbus\ui\b"
R, S2, S3, S5 = "resources", "sharedassets2", "sharedassets3", "sharedassets5"
M = {
  # 좌상단 HUD
  "hud-turn": (S3, "BattleUI_UpperLeft_1_24"), "hud-wave": (S3, "BattleUI_UpperLeft_1_23"), "hud-enemy": (S3, "BattleUI_UpperLeft_1_40"),
  "tag-enemy": (S3, "BattleUI_UpperLeft_1_41"), "hud-panel": (S3, "BattleUI_UpperLeft_1_20"), "hud-plate": (S3, "BattleUI_UpperLeft_1_44"),
  "plate-red-off": (S3, "BattleUI_UpperLeft_1_4"), "plate-red-on": (S3, "BattleUI_UpperLeft_1_5"),
  "btn-play": (S3, "BattleUI_UpperLeft_1_29"), "btn-pause": (S3, "BattleUI_UpperLeft_1_26"), "btn-gear": (S3, "BattleUI_UpperLeft_1_19"),
  "btn-fwd": (S3, "BattleUI_UpperLeft_1_36"), "btn-arrows-off": (S3, "BattleUI_UpperLeft_1_16"), "btn-arrows-on": (S3, "BattleUI_UpperLeft_1_18"),
  "btn-glow": (S3, "BattleUI_UpperLeft_1_28"), "btn-help": (S3, "BattleUI_UpperLeft_2_1"), "btn-mission": (S3, "BattleUI_UpperLeft_2_3"), "chev-l": (S3, "BattleUI_UpperLeft_1_35"),
  "arm-l": (S3, "BattleUI_UpperLeft_1_37"), "arm-r": (S3, "BattleUI_UpperLeft_1_38"), "side-gold": (S3, "BattleUI_UpperLeft_1_22"), "side-red": (S3, "BattleUI_UpperLeft_1_42"), "hazard-v": (S3, "BattleUI_UpperLeft_1_39"),
  # 행동 슬롯(속도 다이스)·게이지
  "slot-empty": (S3, "BattleUI_ActionSlotUI_empty"), "slot-break": (S3, "BattleUI_ActionSlotUI_break"), "slot-glow": (S3, "BattleUI_ActionSlotUI_1"),
  "slot-base": (S3, "BattleUI_ActionSlotUI_outline"), "slot-link": (S3, "BattleUI_ActionSlotUI_linkline"), "slot-vanish": (S3, "BattleUI_ActionSlotUI_vanish"),
  "gauge-frame": (S3, "BattleUI_BattleUnit_Gauge_0"), "gauge-fill": (S3, "BattleUI_BattleUnit_Gauge_1"), "gauge-emblem": (S3, "BattleUI_BattleUnit_Gauge_2"), "gauge-gear": (S3, "BattleUI_BattleUnit_Gauge_3"), "gauge-corner": (S3, "BattleUI_BattleUnit_Gauge_4"),
  "die-enemy": (S3, "BattleUI_CreatureBattle_SkillSlot_hp_bg"), "die-enemy-fill": (S3, "BattleUI_CreatureBattle_SkillSlot_hp"), "creature-break": (S3, "BattleUI_CreatureBattle_break"), "splat-red": (S3, "BattleUI_CreatureBattle_DestroyedPartBg"),
  # 스킬 칩·팔각
  "chip-frame": (R, "BattleUI_Choice_7_0"), "chip-mask": (R, "BattleUI_Operation_1_0"), "chip-ego": (R, "BattleUI_Choice_8_1"), "chip-gold": (R, "BattleUI_Choice_7_30"), "chip-outline": (R, "BattleUI_Choice_7_1"), "chip-emblem": (R, "BattleUI_Choice_7_28"),
  "oct-dark": (R, "BattleUI_Operation_1_30"), "oct-red": (S3, "BattleUI_Operation_1_9"), "oct-bronze": (R, "BattleUI_Operation_1_6"), "oct-arc": (R, "BattleUI_Operation_1_34"), "oct-crack": (S3, "BattleUI_Operation_1_24"), "oct-panel": (R, "BattleUI_Operation_1_16"), "oct-outline": (R, "BattleUI_Operation_1_21"),
  "start-gear": (S3, "BattleUI_Turn_5"), "start-lever": (S3, "BattleUI_Operation_1_23"),
  # 패널·플레이트
  "panel-wide": (R, "BattleUI_Choice_7_24"), "panel-tall": (R, "BattleUI_Choice_7_26"), "panel-sq": (R, "BattleUI_Choice_7_16"), "panel-black": (R, "BattleUI_Choice_7_5"), "panel-popup": (R, "BattleUI_Choice_8_0"), "panel-grey": (R, "BattleUI_Choice_7_19"),
  "card-ally": (S3, "BattleUI_PassivePanel_new_0"), "card-enemy": (S3, "BattleUI_PassivePanel_new_19"), "card-glow-gold": (S3, "BattleUI_PassivePanel_new_18"), "card-glow-red": (S3, "BattleUI_PassivePanel_new_20"),
  "hazard-bar": (S3, "BattleUI_PassivePanel_new_23"), "pill-dark": (S3, "BattleUI_PassivePanel_new_25"), "bar-gold": (S3, "BattleUI_PassivePanel_new_3"), "card-dark": (S3, "BattleUI_PassivePanel_new_5"),
  "plate-brown": (R, "BattleUI_Choice_8_6"), "plate-dark": (R, "BattleUI_Choice_8_7"), "plate-white": (R, "BattleUI_Choice_8_8"), "bar-grey": (R, "BattleUI_Choice_8_3"), "bar-brush": (R, "BattleUI_Choice_7_15"), "bar-redglow": (R, "BattleUI_Choice_7_18"),
  "plate-slant-w": (S3, "BattleUI_CoinPopup_1_21"), "plate-slant-s": (S3, "BattleUI_CoinPopup_1_18"), "plate-slant-d": (S3, "BattleUI_CoinPopup_1_28"), "name-box": (R, "BattleUI_CoinPopup_1_37"), "dots": (S3, "BattleUI_CoinPopup_1_41"), "plate-slant-x": (R, "BattleUI_CoinPopup_1_26"),
  "btn-red": (R, "BattleUI_Choice_5_21"), "btn-red2": (R, "BattleUI_Choice_5_17"), "paper": (R, "BattleUI_Choice_5_20"),
  # 코인
  "coin-heads": (S3, "BattleUI_CoinPopup_coin"), "coin-tails": (S3, "BattleUI_CoinPopup_back"), "coin-glow": (S3, "BattleUI_CoinPopup_coin2"), "coin-break": (R, "BattleUI_CoinPopup_break"), "coin-hept-w": (R, "BattleUI_CoinPopup_1_30"), "coin-hept-b": (S3, "BattleUI_CoinPopup_1_39"),
  # 아이콘
  "ico-heart": (R, "BattleUI_Popup_4_2"), "ico-shield": (R, "BattleUI_Popup_4_3"), "ico-boot": (R, "BattleUI_Popup_4_4"), "ico-swords": (S5, "BattleUI_Popup_4_5"), "ico-x": (R, "BattleUI_Popup_4_7"),
  "ico-check": (S3, "BattleUI_DanteAbility_01_17"), "ico-x-w": (S3, "BattleUI_DanteAbility_01_16"), "ico-tri": (S3, "BattleUI_DanteAbility_01_21"), "ico-mind": (R, "BattleUI_EGO_new_4"), "ico-warn": (S3, "BattleUI_EGO_new_3"),
  "ico-key": (S3, "BattleUI_UpperLeft_1_47"), "ico-exit": (R, "BattleUI_Choice_5_2"), "ico-skip": (R, "BattleUI_Choice_7_6"), "ico-up": (R, "BattleUI_Choice_7_32"),
  # 글자·결과
  "txt-turn": (S3, "BattleUI_Turn_0"), "turn-lines": (S3, "BattleUI_Turn_1"), "turn-lines-gold": (S3, "BattleUI_Turn_3"), "turn-band": (S3, "BattleUI_Turn_7"),
  "txt-victory": (S3, "BattleUI_Result_6"), "txt-defeat": (S3, "BattleUI_Result_0"), "txt-survived": (S3, "BattleUI_Result_12"), "result-branch-l": (S3, "BattleUI_Result_4"), "result-branch-r": (S3, "BattleUI_Result_5"),
  "result-lines-gold": (S3, "BattleUI_Result_8"), "result-line-red": (S3, "BattleUI_Result_1"), "result-band": (S3, "BattleUI_Result_11"), "result-band-wide": (S3, "BattleUI_Result_14"), "txt-continue": (S3, "BattleUI_StageContinue_02_4"),
  "threat-zayin": (R, "BattleUI_CreatureBattle_3_0"), "threat-teth": (R, "BattleUI_CreatureBattle_3_12"), "threat-he": (R, "BattleUI_CreatureBattle_3_15"), "threat-unknown": (R, "BattleUI_CreatureBattle_3_18"),
  "threat-waw": (R, "BattleUI_CreatureBattle_3_22"), "threat-aleph": (R, "BattleUI_CreatureBattle_3_26"), "threat-aleph2": (R, "BattleUI_CreatureBattle_3_38"), "tag-new": (S3, "BattleUI_CreatureBattle_3_19"), "x-red": (R, "BattleUI_CreatureBattle_3_33"),
  "banner-red": (S3, "BattleUI_Battlestart_0"), "battle-ring": (S3, "BattleUI_Battlestart_2"), "battle-star": (S3, "BattleUI_Battlestart_3"), "smudge": (S3, "BattleUI_Battlestart_1"),
  "link-blue": (S3, "BattleUI_Operation_2_1"), "link-orange": (S3, "BattleUI_Operation_2_3"), "crosshair": (S3, "BattleUI_CreatureBattle_3_4"), "crosshair2": (S3, "BattleUI_CreatureBattle_3_5"),
  "ico-lock": (R, "icon_lock"),
}
os.makedirs(DST, exist_ok=True)
missing = []
total = 0
for name, (sub, stem) in M.items():
    p = os.path.join(SRC, sub, stem + ".png")
    if not os.path.exists(p): missing.append((name, p)); continue
    shutil.copyfile(p, os.path.join(DST, name + ".png")); total += os.path.getsize(p)
print("copied", len(M) - len(missing), "bytes", total)
for m in missing: print("MISSING", m)
