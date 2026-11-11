"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { createClient, realtimeReady } from "@/lib/supabase/client";
import { sendMessage, deleteMessage, type MessageKind } from "@/app/campaigns/[id]/sessions/[sid]/actions";
import { CoinIcon } from "@/components/icons";
import { KeywordText } from "@/components/keyword/keyword";

export interface ChatMessage {
  id: number; kind: MessageKind; content: string; created_at: string;
  author_id: string | null; character_id: string | null; to_user_id: string | null;
  payload: Record<string, unknown> | null;
}
export interface Member { user_id: string; username: string; role: "gm" | "temp_gm" | "player" }
export interface MyChar { id: string; name: string }

interface Props {
  sessionId: string; sceneId: string | null; meId: string; isGm: boolean;
  members: Member[]; myChars: MyChar[]; charNames: Record<string, string>;
  initial: ChatMessage[]; sessionOpen: boolean;
  onMessages?: (msgs: ChatMessage[]) => void;
  /** 부모 높이를 꽉 채운다 (전투 화면) */
  fill?: boolean;
  /** 입력칸을 숨긴다 (세션 화면은 아래 바에서 입력) */
  hideInput?: boolean;
  /** 메시지 상태를 바깥(useSessionMessages)에서 관리할 때 */
  store?: { msgs: ChatMessage[]; setMsgs: React.Dispatch<React.SetStateAction<ChatMessage[]>> };
}

/** 세션 메시지 상태 + 실시간 구독. 세션 화면과 채팅 서랍이 공유한다 */
export function useSessionMessages(sessionId: string, initial: ChatMessage[]) {
  const [msgs, setMsgs] = useState<ChatMessage[]>(initial);
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false; let ch: ReturnType<typeof supabase.channel> | null = null;
    void realtimeReady(supabase).then(() => {
      if (cancelled) return;
      ch = supabase.channel(`session:${sessionId}:msgs:${Math.random().toString(36).slice(2, 8)}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `session_id=eq.${sessionId}` },
          (p) => { const m = p.new as ChatMessage; setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m].sort((a, b) => a.id - b.id))); })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" },
          (p) => setMsgs((prev) => prev.filter((m) => m.id !== (p.old as { id: number }).id)))
        .subscribe();
    });
    return () => { cancelled = true; if (ch) void supabase.removeChannel(ch); };
  }, [sessionId]);
  const append = (m: ChatMessage) => setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m].sort((a, b) => a.id - b.id)));
  return { msgs, setMsgs, append };
}

export function Chat({ sessionId, sceneId, meId, isGm, members, myChars, charNames, initial, sessionOpen, onMessages, fill, hideInput, store }: Props) {
  const [ownMsgs, setOwnMsgs] = useState<ChatMessage[]>(initial);
  const msgs = store ? store.msgs : ownMsgs;
  const setMsgs = store ? store.setMsgs : setOwnMsgs;
  const [kind, setKind] = useState<MessageKind>(myChars.length ? "ic" : "ooc");
  const [charId, setCharId] = useState<string | null>(myChars[0]?.id ?? null);
  const [toUser, setToUser] = useState<string | null>(members.find((m) => m.user_id !== meId)?.user_id ?? null);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const names = Object.fromEntries(members.map((m) => [m.user_id, m.username]));
  const append = (m: ChatMessage) => setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m].sort((a, b) => a.id - b.id)));

  useEffect(() => {
    if (store) return; // 바깥 스토어가 구독한다
    const supabase = createClient();
    let cancelled = false; let ch: ReturnType<typeof supabase.channel> | null = null;
    void realtimeReady(supabase).then(() => {
      if (cancelled) return;
      ch = supabase.channel(`session:${sessionId}:${Math.random().toString(36).slice(2, 8)}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `session_id=eq.${sessionId}` },
          (p) => append(p.new as ChatMessage))
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" },
          (p) => setMsgs((prev) => prev.filter((m) => m.id !== (p.old as { id: number }).id)))
        .subscribe();
    });
    return () => { cancelled = true; if (ch) void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, !!store]);

  useEffect(() => { const el = bottom.current?.parentElement; if (el) el.scrollTop = el.scrollHeight; onMessages?.(msgs); }, [msgs, onMessages]);

  const send = () => {
    if (!text.trim()) return;
    setErr(null);
    const body = text;
    setText("");
    start(async () => {
      const r = await sendMessage({ sessionId, sceneId, kind, content: body, characterId: charId, toUserId: toUser });
      if (r.error) { setErr(r.error); setText(body); return; }
      if (r.message) append(r.message as unknown as ChatMessage);
    });
  };

  const uploadImage = async (file: File) => {
    setUploading(true); setErr(null);
    try {
      const supabase = createClient();
      const path = `${meId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error } = await supabase.storage.from("uploads").upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("uploads").getPublicUrl(path);
      const r = await sendMessage({ sessionId, sceneId, kind: kind === "system" ? "ooc" : kind, content: text, characterId: charId, toUserId: toUser, imageUrl: data.publicUrl });
      if (r.error) throw new Error(r.error);
      if (r.message) append(r.message as unknown as ChatMessage);
      setText("");
    } catch (e) { setErr(e instanceof Error ? e.message : "업로드 실패"); }
    finally { setUploading(false); }
  };

  return (
    <div className={fill ? "flex h-full flex-col" : "flex h-[70vh] flex-col lg:h-[calc(100vh-10rem)]"}>
      <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
        {msgs.map((m) => <Line key={m.id} m={m} names={names} charNames={charNames} meId={meId}
          onDelete={isGm ? () => { if (confirm("이 메시지를 삭제할까요?")) void deleteMessage(sessionId, m.id).then(() => setMsgs((prev) => prev.filter((x) => x.id !== m.id))); } : undefined} />)}
        <div ref={bottom} />
      </div>

      {hideInput ? null : sessionOpen ? (
        <div className="mt-2 border-t border-border pt-2">
          <div className="mb-1 flex flex-wrap items-center gap-1 text-xs">
            {(["ic", "ooc", "gm", "whisper"] as const).filter((k) => k !== "gm" || isGm).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)}
                className={`border px-2 py-0.5 ${kind === k ? "border-accent text-accent" : "border-border text-muted"}`}>
                {{ ic: "캐릭터", ooc: "플레이어", gm: "GM 서술", whisper: "귓속말" }[k]}
              </button>
            ))}
            {kind === "ic" ? (
              <select value={charId ?? ""} onChange={(e) => setCharId(e.target.value || null)} className="border border-border bg-elev px-1 py-0.5">
                {myChars.length === 0 ? <option value="">캐릭터 없음</option> : null}
                {myChars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : null}
            {kind === "whisper" ? (
              <select value={toUser ?? ""} onChange={(e) => setToUser(e.target.value || null)} className="border border-border bg-elev px-1 py-0.5">
                {members.filter((m) => m.user_id !== meId).map((m) => <option key={m.user_id} value={m.user_id}>→ {m.username}</option>)}
              </select>
            ) : null}
            <label className="ml-auto cursor-pointer border border-border px-2 py-0.5 text-muted hover:text-fg">
              {uploading ? "업로드 중" : "이미지"}
              <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadImage(f); e.target.value = ""; }} />
            </label>
          </div>
          <div className="flex gap-2">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
              placeholder={kind === "ic" ? "캐릭터의 말과 행동 (/coin 분노 2, /coin 3 2 +1 빛, /vs 오만 상대이름 색욕)" : kind === "gm" ? "상황 서술" : "메시지. /r 2d6+3, /coin 분노 2, /vs 오만 이름 색욕"}
              className="flex-1 resize-none rounded-md border border-border bg-elev px-3 py-2 text-sm outline-none focus:border-accent" />
            <button type="button" onClick={send} disabled={pending || !text.trim()}
              className="rounded-md bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50">전송</button>
          </div>
          {err ? <p className="mt-1 text-xs text-danger">{err}</p> : null}
        </div>
      ) : <p className="mt-2 border-t border-border pt-2 text-xs text-muted">종료된 세션입니다. 기록만 볼 수 있습니다.</p>}
    </div>
  );
}

function Line({ m, names, charNames, meId, onDelete }: { m: ChatMessage; names: Record<string, string>; charNames: Record<string, string>; meId: string; onDelete?: () => void }) {
  const del = onDelete ? <button type="button" onClick={onDelete} className="ml-1 text-[10px] text-muted opacity-0 hover:text-danger group-hover:opacity-100" aria-label="삭제">삭제</button> : null;
  const time = new Date(m.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  const author = m.author_id ? names[m.author_id] ?? "?" : "";
  const img = m.payload && typeof m.payload.image === "string" ? m.payload.image : null;
  const body = (
    <>
      {m.content ? <KeywordText text={m.content} className="whitespace-pre-wrap break-words" /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {img ? <a href={img} target="_blank" rel="noreferrer"><img src={img} alt="" className="mt-1 max-h-64 max-w-full border border-border" /></a> : null}
    </>
  );
  if (m.kind === "system") {
    const p = m.payload ?? {};
    return (
      <div className="group border-l-2 border-gold bg-gold/5 px-2 py-1 text-xs">
        <span className="text-muted">{time} · {author}{m.character_id ? ` (${charNames[m.character_id] ?? ""})` : ""}</span>{del}
        <div className="mt-0.5 whitespace-pre-wrap font-mono"><KeywordText text={m.content} /></div>
        {p.type === "coin" && Array.isArray(p.coins) ? (
          <div className="mt-1 flex flex-wrap gap-0.5">
            {(p.coins as boolean[]).map((h, i) => <CoinIcon key={i} heads={h} size={22} />)}
          </div>
        ) : null}
      </div>
    );
  }
  if (m.kind === "gm") return <div className="group border-l-2 border-accent px-2 py-1 text-sm italic"><span className="mr-2 text-xs not-italic text-muted">{time} GM</span>{body}{del}</div>;
  if (m.kind === "whisper") {
    const to = m.to_user_id ? names[m.to_user_id] ?? "?" : "?";
    return <div className="group px-2 py-1 text-sm text-muted"><span className="mr-2 text-xs">{time} 귓속말 {author} → {m.to_user_id === meId ? "나" : to}</span>{body}{del}</div>;
  }
  if (m.kind === "ic") {
    const cn = m.character_id ? charNames[m.character_id] ?? author : author;
    return <div className="group px-2 py-1 text-sm"><span className="mr-2 text-xs text-muted">{time}</span><span className="mr-2 font-semibold text-gold">{cn}</span>{body}{del}</div>;
  }
  return <div className="group px-2 py-1 text-sm text-muted"><span className="mr-2 text-xs">{time}</span><span className="mr-2">({author})</span>{body}{del}</div>;
}
