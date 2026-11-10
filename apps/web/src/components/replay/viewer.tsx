"use client";
import { useEffect, useMemo, useState } from "react";
import { formatRound, type RoundEvent } from "@/lib/replay-format";
import { CoinIcon, StatusBadge } from "@/components/icons";
import type { StatusId } from "@limbus/rules";

interface Msg { id: number; kind: string; content: string; created_at: string; author_id: string | null; character_id: string | null; to_user_id: string | null; scene_id: string | null; payload: Record<string, unknown> | null }
interface Snap { id: string; name: string; side: "ally" | "enemy"; hp: number; maxHp: number; sanity: number; sanityLocked: boolean; statuses: Record<string, number>; staggered: boolean; incapacitated: boolean; light?: number; erosion?: number }
interface CombatRec { id: string; scene_id: string | null; created_at: string; state: { units: { id: string; name: string }[]; winner: string | null }; events: { seq: number; created_at?: string; round: number; events: RoundEvent[]; after?: Snap[] }[] }
export interface ReplayFile {
  format: string; version: number; exportedAt: string;
  campaign: { name: string }; session: { title: string; started_at: string; ended_at: string | null };
  members: { user_id: string; username: string; role: string }[];
  scenes: { id: string; title: string; kind: string; order_index: number }[];
  messages: Msg[]; combats: CombatRec[];
  characters: { id: string; name: string; portrait_url: string | null }[];
}

export function ReplayViewer({ data }: { data: ReplayFile }) {
  const names = useMemo(() => Object.fromEntries(data.members.map((m) => [m.user_id, m.username])), [data.members]);
  const charNames = useMemo(() => Object.fromEntries(data.characters.map((c) => [c.id, c.name])), [data.characters]);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timeline = useMemo(() => buildTimeline(data), [data]);
  const visible = timeline.slice(0, cursor + 1);

  // 자동 재생
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setCursor((c) => { if (c >= timeline.length - 1) { setPlaying(false); return c; } return c + 1; }), 900);
    return () => clearInterval(t);
  }, [playing, timeline.length]);

  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <div className="stamp">리플레이</div>
        <h1 className="mt-1 text-2xl font-bold">{data.session.title}</h1>
        <p className="text-sm text-muted">{data.campaign.name} · {new Date(data.session.started_at).toLocaleString("ko-KR")}{data.session.ended_at ? ` ~ ${new Date(data.session.ended_at).toLocaleString("ko-KR")}` : ""} · 참가 {data.members.map((m) => m.username).join(", ")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <button type="button" className="border border-border px-2 py-1" onClick={() => setCursor(0)}>⏮</button>
          <button type="button" className="border border-border px-2 py-1" onClick={() => setCursor((c) => Math.max(0, c - 1))}>◀</button>
          <button type="button" className="border border-accent px-3 py-1 text-accent" onClick={() => setPlaying(!playing)}>{playing ? "일시정지" : "재생"}</button>
          <button type="button" className="border border-border px-2 py-1" onClick={() => setCursor((c) => Math.min(timeline.length - 1, c + 1))}>▶</button>
          <button type="button" className="border border-border px-2 py-1" onClick={() => setCursor(timeline.length - 1)}>⏭</button>
          <input type="range" min={0} max={Math.max(0, timeline.length - 1)} value={cursor} onChange={(e) => setCursor(Number(e.target.value))} className="flex-1" />
          <span className="tabular-nums text-muted">{cursor + 1} / {timeline.length}</span>
        </div>
      </div>
      <div className="space-y-1">
        {visible.map((item, i) => <Item key={i} item={item} names={names} charNames={charNames} last={i === visible.length - 1} />)}
      </div>
    </div>
  );
}

type TimelineItem =
  | { t: "scene"; title: string; kind: string; at: string }
  | { t: "msg"; m: Msg }
  | { t: "round"; combatId: string; round: number; lines: string[]; after?: Snap[]; at: string }
  | { t: "combatEnd"; winner: string | null; at: string };

function buildTimeline(d: ReplayFile): TimelineItem[] {
  const items: { at: string; item: TimelineItem }[] = [];
  const combatRounds = new Map<string, { round: number; at: string }[]>();
  for (const c of d.combats) {
    const n = Object.fromEntries(c.state.units.map((u) => [u.id, u.name]));
    for (const e of c.events) {
      items.push({ at: e.created_at ?? c.created_at, item: { t: "round", combatId: c.id, round: e.round, lines: formatRound(e.events, n), after: e.after, at: e.created_at ?? c.created_at } });
    }
    combatRounds.set(c.id, []);
  }
  for (const m of d.messages) {
    const p = m.payload ?? {};
    if (m.kind === "system" && p.type === "round") continue;          // 라운드는 이벤트 쪽을 쓴다
    if (m.kind === "system" && p.type === "scene") { const sc = d.scenes.find((s) => s.id === p.sceneId); items.push({ at: m.created_at, item: { t: "scene", title: sc?.title ?? m.content, kind: sc?.kind ?? "drama", at: m.created_at } }); continue; }
    items.push({ at: m.created_at, item: { t: "msg", m } });
  }
  items.sort((a, b) => a.at.localeCompare(b.at));
  return items.map((x) => x.item);
}

function Item({ item, names, charNames, last }: { item: TimelineItem; names: Record<string, string>; charNames: Record<string, string>; last: boolean }) {
  const cls = last ? "ring-1 ring-accent/60" : "";
  if (item.t === "scene") return <div className={`my-3 flex items-center gap-2 ${cls}`}><div className="h-px flex-1 bg-border" /><span className="stamp">{({ drama: "드라마", explore: "탐색", combat: "전투" } as Record<string, string>)[item.kind] ?? item.kind}</span><span className="text-sm font-semibold">{item.title}</span><div className="h-px flex-1 bg-border" /></div>;
  if (item.t === "round") return (
    <div className={`border-l-2 border-gold bg-gold/5 px-3 py-2 text-xs ${cls}`}>
      <div className="mb-1 font-semibold">라운드 {item.round}</div>
      <pre className="whitespace-pre-wrap font-mono leading-relaxed">{item.lines.join("\n")}</pre>
      {item.after ? (
        <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {item.after.map((u) => (
            <div key={u.id} className={`border border-border px-2 py-1 ${u.incapacitated ? "opacity-50" : ""}`}>
              <div className="flex justify-between"><span className={u.side === "ally" ? "text-gold" : ""}>{u.name}</span><span className="text-muted">{u.incapacitated ? "전투불능" : u.staggered ? "흐트러짐" : ""}</span></div>
              <div className="mt-1 h-1.5 bg-fg/10"><div className="h-full bg-danger" style={{ width: `${Math.max(0, Math.min(100, u.hp / u.maxHp * 100))}%` }} /></div>
              <div className="flex justify-between tabular-nums text-muted"><span>{u.hp}/{u.maxHp}</span>{!u.sanityLocked ? <span>정신력 {u.sanity}</span> : null}</div>
              <div className="mt-0.5 flex flex-wrap gap-1">{Object.entries(u.statuses ?? {}).filter(([, v]) => v > 0).map(([k, v]) => <StatusBadge key={k} status={k as StatusId} value={v} size={14} />)}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
  if (item.t === "combatEnd") return <div className="text-xs text-muted">전투 종료 · {item.winner === "ally" ? "아군 승리" : "아군 패배"}</div>;
  const m = item.m;
  const time = new Date(m.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  const author = m.author_id ? names[m.author_id] ?? "?" : "";
  const img = m.payload && typeof m.payload.image === "string" ? m.payload.image : null;
  const body = (
    <>
      {m.content ? <span className="whitespace-pre-wrap break-words">{m.content}</span> : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {img ? <img src={img} alt="" className="mt-1 max-h-64 border border-border" /> : null}
    </>
  );
  if (m.kind === "system") {
    const p = m.payload ?? {};
    return <div className={`border-l-2 border-gold bg-gold/5 px-2 py-1 text-xs ${cls}`}><span className="text-muted">{time} · {author}{m.character_id ? ` (${charNames[m.character_id] ?? ""})` : ""}</span><div className="mt-0.5 whitespace-pre-wrap font-mono">{m.content}</div>
      {p.type === "coin" && Array.isArray(p.coins) ? <div className="mt-1 flex gap-0.5">{(p.coins as boolean[]).map((h, i) => <CoinIcon key={i} heads={h} size={18} />)}</div> : null}</div>;
  }
  if (m.kind === "gm") return <div className={`border-l-2 border-accent px-2 py-1 text-sm italic ${cls}`}><span className="mr-2 text-xs not-italic text-muted">{time} GM</span>{body}</div>;
  if (m.kind === "whisper") return <div className={`px-2 py-1 text-sm text-muted ${cls}`}><span className="mr-2 text-xs">{time} 귓속말 {author} → {m.to_user_id ? names[m.to_user_id] ?? "?" : "?"}</span>{body}</div>;
  if (m.kind === "ic") return <div className={`px-2 py-1 text-sm ${cls}`}><span className="mr-2 text-xs text-muted">{time}</span><span className="mr-2 font-semibold text-gold">{m.character_id ? charNames[m.character_id] ?? author : author}</span>{body}</div>;
  return <div className={`px-2 py-1 text-sm text-muted ${cls}`}><span className="mr-2 text-xs">{time}</span><span className="mr-2">({author})</span>{body}</div>;
}
