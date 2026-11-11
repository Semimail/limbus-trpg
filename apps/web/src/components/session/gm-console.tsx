"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createScene, setCurrentScene, updateBoard, type BoardData } from "@/app/campaigns/[id]/sessions/[sid]/actions";
import { closeSession } from "@/app/campaigns/actions";
import { createClient } from "@/lib/supabase/client";
import { CombatSetup, type AllyOption, type EnemyOption } from "@/components/combat/setup";
import { BACKGROUNDS } from "@/components/icons";
import type { SceneRow } from "./scene-bar";
import type { StageActor } from "./stage";

export type ConsoleTab = "flow" | "stage" | "combat" | "sheets";
const KIND_LABEL = { drama: "드라마", explore: "탐색", combat: "전투" } as const;

interface Props {
  campaignId: string; sessionId: string; sessionOpen: boolean; scenes: SceneRow[]; currentId: string | null; current: SceneRow | null;
  board: BoardData; actors: StageActor[]; meId: string;
  chars: { id: string; name: string; owner: string; approved: boolean; hp: number; maxHp: number; sanity: number }[];
  setup: { allies: AllyOption[]; enemies: EnemyOption[] } | null; combatActive: boolean;
  tab: ConsoleTab; setTab: (t: ConsoleTab) => void; onClose: () => void; onBoard: (b: BoardData) => void;
}

/** GM 콘솔 (영상의 오른쪽 패널): 진행 / 무대 / 전투 / 시트 */
export function GmConsole(p: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const cast = p.board.stage?.cast ?? [];
  const run = (fn: () => Promise<unknown>) => start(async () => { setErr(null); try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "실패"); } });
  const patchBoard = (patch: Partial<BoardData>) => run(async () => { if (!p.currentId) throw new Error("장면이 없습니다"); const r = await updateBoard(p.campaignId, p.currentId, patch); if (r.error) throw new Error(r.error); if (r.board) p.onBoard(r.board); });
  const toggleCast = (id: string) => patchBoard({ stage: { cast: cast.includes(id) ? cast.filter((x) => x !== id) : [...cast, id], split: p.board.stage?.split } });
  const uploadBg = async (file: File) => {
    setUploading(true); setErr(null);
    try {
      const supabase = createClient();
      const path = `${p.meId}/bg-${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error } = await supabase.storage.from("uploads").upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("uploads").getPublicUrl(path);
      patchBoard({ background: data.publicUrl });
    } catch (e) { setErr(e instanceof Error ? e.message : "업로드 실패"); } finally { setUploading(false); }
  };
  const tabs: [ConsoleTab, string][] = [["flow", "진행"], ["stage", "무대"], ["combat", "전투"], ["sheets", "시트"]];
  const sec = (title: string) => <div className="gm-sec">{title}</div>;
  return (
    <div className="flex h-full flex-col text-xs">
      <div className="b-bar flex h-10 items-center gap-2 px-3">
        <span className="text-sm font-bold text-[#f1d9a0]">GM 콘솔</span>
        <button type="button" className="b-muted ml-auto hover:text-white" onClick={p.onClose}>✕</button>
      </div>
      <div className="flex border-b" style={{ borderColor: "var(--b-line)" }}>
        {tabs.map(([k, l]) => <button key={k} type="button" onClick={() => p.setTab(k)} className={`flex-1 py-1.5 ${p.tab === k ? "bg-[#c9a24a] font-bold text-[#1a1208]" : "text-[#d9c08a] hover:bg-white/5"}`}>{l}</button>)}
      </div>
      {err ? <div className="px-3 py-1 text-red-300">{err}</div> : null}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {p.tab === "flow" ? (
          <>
            {sec("장면")}
            <div className="space-y-1">
              {p.scenes.map((s, i) => {
                const active = s.id === p.currentId;
                return (
                  <div key={s.id} className={`flex items-center gap-2 border px-2 py-1 ${active ? "border-[#c9a24a] bg-[#c9a24a1a]" : "border-[#3a2626]"}`}>
                    <span className="b-muted tabular-nums">{i + 1}.</span><span className="flex-1 truncate">{s.title}</span><span className="b-muted">{KIND_LABEL[s.kind]}</span>
                    {!active && p.sessionOpen ? <button type="button" disabled={pending} className="b-btn text-[10px]" onClick={() => run(async () => { await setCurrentScene(p.campaignId, p.sessionId, s.id); router.refresh(); })}>전환</button> : active ? <span className="text-[10px] text-[#c9a24a]">현재</span> : null}
                  </div>
                );
              })}
              {p.scenes.length === 0 ? <div className="b-muted">장면이 없습니다.</div> : null}
            </div>
            {p.sessionOpen ? (
              <form action={async (fd) => { await createScene(p.campaignId, p.sessionId, fd); router.refresh(); }} className="flex flex-wrap gap-1">
                <input name="title" placeholder="새 장면 제목" className="b-input min-w-0 flex-1 px-2 py-1" />
                <select name="kind" className="b-input px-1 py-1"><option value="drama">드라마</option><option value="explore">탐색</option><option value="combat">전투</option></select>
                <button type="submit" className="b-btn-red">장면 추가 · 전환</button>
              </form>
            ) : null}
            {sec("세션")}
            <div className="flex flex-wrap gap-1">
              <a href={`/api/sessions/${p.sessionId}/export`} className="b-btn">내보내기 (JSON)</a>
              {p.sessionOpen ? <form action={async () => { if (!confirm("세션을 종료할까요? 기록은 남고, 더는 입력할 수 없습니다.")) return; await closeSession(p.campaignId, p.sessionId); router.refresh(); }}><button type="submit" className="b-btn text-red-300">세션 종료</button></form> : <span className="b-muted self-center">종료된 세션</span>}
            </div>
          </>
        ) : null}

        {p.tab === "stage" ? (
          <>
            {sec("출연진 (스탠딩)")}
            <div className="b-muted">누르면 등장/퇴장. 캐릭터가 대사를 보내면 자동으로 등장합니다.</div>
            <div className="flex flex-wrap gap-1">
              {p.actors.filter((a) => a.kind === "pc").map((a) => <button key={a.id} type="button" disabled={pending || !p.currentId} onClick={() => toggleCast(a.id)} className={`border px-2 py-0.5 ${cast.includes(a.id) ? "border-[#c9a24a] text-[#f1d9a0]" : "border-[#3a2626] text-[#9a8f86]"}`}>{a.name}</button>)}
            </div>
            <div className="b-label">NPC (적 도감)</div>
            <div className="flex flex-wrap gap-1">
              {p.actors.filter((a) => a.kind === "npc").map((a) => <button key={a.id} type="button" disabled={pending || !p.currentId} onClick={() => toggleCast(a.id)} className={`border px-2 py-0.5 ${cast.includes(a.id) ? "border-[#b3161c] text-[#ffd7d7]" : "border-[#3a2626] text-[#9a8f86]"}`}>{a.name}</button>)}
              {p.actors.filter((a) => a.kind === "npc").length === 0 ? <span className="b-muted">적 도감에 항목이 없습니다.</span> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="flex items-center gap-1"><input type="checkbox" checked={!!p.board.stage?.split} onChange={(e) => patchBoard({ stage: { cast, split: e.target.checked } })} />진영 배치 (왼쪽 PC · 오른쪽 NPC)</label>
              <button type="button" className="b-btn" disabled={pending} onClick={() => patchBoard({ stage: { cast: [], split: p.board.stage?.split } })}>전부 퇴장</button>
            </div>
            {sec("배경")}
            <div className="flex flex-wrap items-center gap-1">
              <label className="b-btn cursor-pointer">{uploading ? "업로드 중…" : "이미지 업로드"}<input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadBg(f); e.target.value = ""; }} /></label>
              <button type="button" className="b-btn" onClick={() => patchBoard({ background: BACKGROUNDS.backstreet })}>뒷골목</button>
              <button type="button" className="b-btn" onClick={() => patchBoard({ background: null })}>기본</button>
            </div>
            <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get("url") ?? "").trim(); if (v) patchBoard({ background: v }); }}>
              <input name="url" placeholder="배경 이미지 URL" defaultValue={p.board.background ?? ""} className="b-input min-w-0 flex-1 px-2 py-1" /><button type="submit" className="b-btn">적용</button>
            </form>
          </>
        ) : null}

        {p.tab === "combat" ? (
          <>
            {sec("전투")}
            {p.combatActive ? <div>전투가 진행 중입니다. <button type="button" className="b-gold underline" onClick={() => router.refresh()}>전투 화면 열기</button></div>
              : p.current?.kind === "combat" && p.setup ? <div className="gm-setup"><CombatSetup campaignId={p.campaignId} sessionId={p.sessionId} sceneId={p.current.id} allies={p.setup.allies} enemies={p.setup.enemies} /></div>
              : (
                <div className="space-y-2">
                  <div className="b-muted">현재 장면은 {p.current ? KIND_LABEL[p.current.kind] : "없음"}입니다. 전투 장면을 추가하면 여기서 아군·적을 골라 전투를 시작합니다.</div>
                  {p.sessionOpen ? <form action={async (fd) => { await createScene(p.campaignId, p.sessionId, fd); router.refresh(); p.setTab("combat"); }} className="flex gap-1"><input type="hidden" name="kind" value="combat" /><input name="title" placeholder="전투 장면 제목" className="b-input min-w-0 flex-1 px-2 py-1" /><button type="submit" className="b-btn-red">전투 장면 추가</button></form> : null}
                </div>
              )}
          </>
        ) : null}

        {p.tab === "sheets" ? (
          <>
            {sec("캐릭터")}
            <div className="space-y-1">
              {p.chars.map((c) => (
                <div key={c.id} className="flex items-center gap-2 border border-[#3a2626] px-2 py-1">
                  <span className="min-w-0 flex-1 truncate">{c.name} <span className="b-muted">({c.owner}{c.approved ? "" : " · 미승인"})</span></span>
                  <span className="b-muted tabular-nums">체력 {c.hp}/{c.maxHp} · 정신 {c.sanity > 0 ? "+" : ""}{c.sanity}</span>
                  <Link href={`/characters/${c.id}`} target="_blank" className="b-btn text-[10px]">시트</Link>
                </div>
              ))}
              {p.chars.length === 0 ? <div className="b-muted">캐릭터가 없습니다.</div> : null}
            </div>
            <div className="flex flex-wrap gap-1 pt-1">
              <Link href={`/campaigns/${p.campaignId}`} className="b-btn">사무소 (GM 패널)</Link>
              <Link href={`/campaigns/${p.campaignId}/enemies`} className="b-btn">적 도감</Link>
              <Link href={`/campaigns/${p.campaignId}/settings`} className="b-btn">룰 설정</Link>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
