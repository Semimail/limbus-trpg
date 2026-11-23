# 사이트 틀(헤더·패널·버튼·입력)용 원작 MainUI 조각 복사 → apps/web/public/assets/limbus/ui/s/
import os, shutil
SRC = r"D:\new\limbus-trpg-claude-admiring-feynman-wbms4a\scripts\limbus-extract\extracted\all\sprite"
DST = r"D:\new\limbus-trpg-claude-admiring-feynman-wbms4a\apps\web\public\assets\limbus\ui\s"
R, S2 = "resources", "sharedassets2"
M = {
  "header-red": (R, "MainUI_UserInfo_1_0"),          # 2039x905 붉은 질감 플레이트 → 헤더 배경
  "panel": (R, "MainUI_UserInfo_1_1"),               # 513x514 검정 + 청동 테 → 패널 9조각
  "panel-corner": (R, "MainUI_UserInfo_1_33"),       # 280x280 검정 + 청동 모서리 틀
  "panel-plain": (R, "MainUI_common_Popup_01_11"),   # 657x379 민무늬 어두운 패널
  "panel-brown": (R, "MainUI_common_Popup_01_22"),   # 179x182 갈색 패널 + 밝은 테
  "card": (R, "MainUI_common_Popup_03_6"),           # 668x249 모서리 깎인 어두운 플레이트 → 카드·목록 항목
  "bar-input": (R, "MainUI_common_Popup_01_13"),     # 720x135 청동 테 어두운 바 → 입력칸
  "bar-brown": (R, "MainUI_common_Popup_01_6"),      # 873x62 갈색 바
  "bar-red": (R, "MainUI_common_Popup_01_8"),        # 495x76 붉은 빛 바
  "bar-white": (R, "MainUI_common_Popup_03_11"),     # 464x74 흰 그라데이션 바
  "plate-slant": (R, "MainUI_common_Popup_01_27"),   # 268x52 흰 사선 플레이트 (제목)
  "plate-slant2": (R, "MainUI_common_Popup_01_37"),
  "plate-orange": (R, "MainUI_common_Popup_03_16"),  # 130x62 주황 작은 플레이트
  "plate-orange2": (R, "MainUI_common_Popup_03_17"),
  "btn-normal": (R, "MainUI_common_Popup_01_btn_t1_normal"),   # 173x176 검정+청동 버튼
  "btn-hover": (R, "MainUI_common_Popup_01_btn_t1_hover"),     # 165x168 주황 채움
  "btn-focus": (R, "MainUI_common_Popup_01_btn_t1_focused"),   # 196x196 주황 테 글로우
  "frame-glow": (R, "MainUI_UserInfo_1_19"),          # 292x292 주황 글로우 틀 (선택)
  "frame-fill": (R, "MainUI_UserInfo_1_29"),          # 247x249 주황 채움 글로우
  "frame-gold": (R, "MainUI_common_Popup_03_12"),     # 307x306 금빛 얇은 틀
  "paper": (R, "MainUI_common_Popup_01_14"),          # 170x170 종이
  "bg-texture": (R, "MainUI_Settings_3_8"),           # 2048x1006 어두운 붉은 질감 → 페이지 배경
  "bg-black": (R, "MainUI_UserInfo_1_3"),             # 513x514 검정 질감
  "line": (R, "MainUI_Settings_3_17"),                # 1521x13 가는 선
  "line-gold": (R, "MainUI_UserInfo_1_28"),           # 330x4
  "ico-x": (R, "MainUI_common_Popup_01_10"), "ico-gear": (R, "MainUI_common_Popup_01_15"), "ico-check": (R, "MainUI_common_Popup_01_33"),
  "ico-lock": (R, "MainUI_UserInfo_1_16"), "ico-new": (R, "MainUI_common_Popup_01_26"), "ico-warn": (S2, "MainUI_common_Popup_01_16"),
  "ico-search": (R, "MainUI_common_Popup_03_23"), "ico-refresh": (R, "MainUI_common_Popup_03_24"), "ico-docs": (R, "MainUI_common_Popup_03_22"),
  "ico-tri": (S2, "MainUI_common_Popup_01_4"), "ico-arrow-l": (R, "MainUI_common_Popup_01_46"), "ico-arrow-r": (R, "MainUI_common_Popup_01_47"),
  "scroll-thumb": (R, "MainUI_common_Popup_01_1"), "scroll-track": (R, "MainUI_common_Popup_01_0"),
  "arm": (R, "MainUI_common_Popup_01_30"), "arm2": (R, "MainUI_common_Popup_01_31"),
  "emblem": (R, "MainUI_common_Popup_01_9"),          # 458x516 희미한 회사 문장 (워터마크)
  "oct-dark": (S2, "MainUI_common_Popup_03_7"), "oct-glow": (S2, "MainUI_common_Popup_03_9"), "oct-brown": (R, "MainUI_common_Popup_03_8"),
  "progress-bg": (R, "MainUI_Settings_3_13"), "progress-fill": (R, "MainUI_Settings_3_15"),
}
os.makedirs(DST, exist_ok=True)
tot = 0; miss = []
for n, (sub, stem) in M.items():
    p = os.path.join(SRC, sub, stem + ".png")
    if not os.path.exists(p): miss.append((n, p)); continue
    shutil.copyfile(p, os.path.join(DST, n + ".png")); tot += os.path.getsize(p)
print("copied", len(M) - len(miss), tot); [print("MISSING", m) for m in miss]
