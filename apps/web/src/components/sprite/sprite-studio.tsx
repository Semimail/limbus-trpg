"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Input } from "@/components/ui";
import { Panel } from "@/components/office/panel";
import { BACKGROUNDS } from "@/components/icons";
import { SdSprite, SPRITE_MOTIONS, type SpriteMotion } from "./sd-sprite";
import { buildSpritePrompt } from "@/lib/sprite/prompt";
import { generateSprite, applySpriteToEnemy, createEnemyFromSprite, deleteSpriteJob, type SpriteJobRow } from "@/app/campaigns/[id]/sprites/actions";

/*
 * SD 스프라이트 공방 (GM 전용)
 *  - 이미지를 여러 장 올리거나 글만 적어 대기열에 넣고, 한 장씩 차례로 생성한다 (AI는 정지 1장, 모션은 코드).
 *  - 오른쪽 미리보기에서 대기·공격·회피·피격·전투불능 모션을 눌러 확인한다.
 *  - 아래 로그: 누가·언제·어떤 모델·프롬프트·비용·결과. 적에게 적용 / 새 적 등록 / 삭제.
 */

interface EnemyLite { id: string; name: string; spriteUrl: string | null }
interface QueueItem { key: string; file: File | null; preview: string | null; label: string; notes: string; enemyId: string | null; status: "wait" | "upload" | "gen" | "done" | "fail"; result?: string; error?: string }

const STATUS_LABEL: Record<SpriteJobRow["status"], string> = { queued: "대기", running: "생성 중", done: "완료", failed: "실패" };
const field = "w-full rounded-md border border-border bg-elev px-2 py-1 text-sm outline-none focus:border-accent";

export function SpriteStudio({ campaignId, enemies, jobs, provider, initialEnemyId }: { campaignId: string; enemies: EnemyLite[]; jobs: SpriteJobRow[]; provider: { name: string; model: string; configured: boolean }; initialEnemyId: string | null }) {
  const router = useRouter();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [notes, setNotes] = useState("");
  const [enemyId, setEnemyId] = useState<string | null>(initialEnemyId);
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);
  const [preview, setPreview] = useState<string | null>(() => jobs.find((j) => j.result_url)?.result_url ?? null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 미리보기 URL 정리
  useEffect(() => () => { queue.forEach((q) => { if (q.preview?.startsWith("blob:")) URL.revokeObjectURL(q.preview); }); }, [queue]);

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const items: QueueItem[] = Array.from(files).filter((f) => f.type.startsWith("image/")).map((f) => ({
      key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, file: f, preview: URL.createObjectURL(f), label: f.name.replace(/\.[^.]+$/, ""), notes, enemyId, status: "wait",
    }));
    setQueue((q) => [...q, ...items]);
    if (fileRef.current) fileRef.current.value = "";
  };
  const addTextOnly = () => setQueue((q) => [...q, { key: `${Date.now()}-t`, file: null, preview: null, label: "", notes, enemyId, status: "wait" }]);
  const patch = (key: string, p: Partial<QueueItem>) => setQueue((q) => q.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const run = async () => {
    if (running) return;
    setRunning(true); stopRef.current = false;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    for (const item of queue) {
      if (stopRef.current) break;
      if (item.status !== "wait" && item.status !== "fail") continue;
      try {
        let sourceUrl: string | null = null;
        if (item.file) {
          if (!user) throw new Error("로그인이 필요합니다");
          patch(item.key, { status: "upload", error: undefined });
          const ext = (item.file.name.split(".").pop() || "png").toLowerCase();
          const path = `${user.id}/sprite-src-${Date.now()}.${ext}`;
          const { error } = await supabase.storage.from("uploads").upload(path, item.file, { contentType: item.file.type });
          if (error) throw new Error(`업로드 실패: ${error.message}`);
          sourceUrl = supabase.storage.from("uploads").getPublicUrl(path).data.publicUrl;
        }
        patch(item.key, { status: "gen" });
        const r = await generateSprite(campaignId, { sourceUrl, label: item.label, notes: item.notes, enemyId: item.enemyId });
        if (r.error) throw new Error(r.error);
        patch(item.key, { status: "done", result: r.resultUrl });
        if (r.resultUrl) setPreview(r.resultUrl);
      } catch (e) {
        patch(item.key, { status: "fail", error: e instanceof Error ? e.message : "실패" });
      }
      router.refresh();
    }
    setRunning(false);
  };
  const waiting = queue.filter((q) => q.status === "wait" || q.status === "fail").length;
  const promptPreview = useMemo(() => buildSpritePrompt({ label: queue[0]?.label, notes, hasSource: !!queue[0]?.file }), [queue, notes]);

  return (
    <div className="space-y-4">
      {!provider.configured ? (
        <div className="border border-danger/60 bg-danger/10 p-3 text-sm">
          이미지 생성 키가 없습니다. Vercel(또는 <code>apps/web/.env.local</code>)에 <code>OPENAI_API_KEY</code>를 넣으면 생성할 수 있습니다. 시험만 하려면 <code>SPRITE_PROVIDER=mock</code>.
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        {/* 왼쪽: 대기열 */}
        <Panel title="만들기" stamp={`${provider.name} · ${provider.model}`}
          right={<span className="text-xs text-muted">AI는 대기 포즈 한 장만 그리고, 움직임은 코드로 냅니다</span>}>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
            <label className="block"><span className="block text-xs text-muted">공통 메모 (무기·복장·특징, 선택)</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={field} placeholder="예: 녹슨 식칼을 든 뒷골목 청소부, 낡은 작업복, 방독면" /></label>
            <label className="block"><span className="block text-xs text-muted">생성 후 바로 적용할 적 (선택)</span>
              <select value={enemyId ?? ""} onChange={(e) => setEnemyId(e.target.value || null)} className={field}>
                <option value="">적용 안 함 (나중에 로그에서 적용)</option>
                {enemies.map((e) => <option key={e.id} value={e.id}>{e.name}{e.spriteUrl ? " (스탠딩 있음)" : ""}</option>)}
              </select>
              <span className="mt-1 block text-[11px] text-muted">메모와 적은 대기열에 추가할 때 각 항목에 복사됩니다.</span></label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="inline-block cursor-pointer rounded-md border border-border px-3 py-1.5 text-sm hover:bg-fg/5">
              이미지 추가 (여러 장 가능)
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
            </label>
            <Button variant="ghost" onClick={addTextOnly}>글로만 만들기</Button>
            <span className="flex-1" />
            {running ? <Button variant="danger" onClick={() => { stopRef.current = true; }}>중지</Button> : null}
            <Button onClick={run} disabled={running || waiting === 0 || !provider.configured}>{running ? "생성 중..." : `생성 시작 (${waiting})`}</Button>
          </div>
          {queue.length === 0 ? <p className="mt-3 text-sm text-muted">이미지를 올리거나 &lsquo;글로만 만들기&rsquo;를 눌러 대기열에 넣으세요. 한 항목당 호출 1회입니다.</p> : null}
          <ul className="mt-3 space-y-2">
            {queue.map((q) => (
              <li key={q.key} className="grid gap-2 border border-border p-2 sm:grid-cols-[4rem_1fr_auto]">
                <div className="h-16 w-16 overflow-hidden bg-fg/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {q.result ? <img src={q.result} alt="" className="h-full w-full object-contain" /> : q.preview ? <img src={q.preview} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-[10px] text-muted">글</span>}
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex gap-2">
                    <Input value={q.label} onChange={(e) => patch(q.key, { label: e.target.value })} placeholder="이름 (프롬프트·로그에 씀)" disabled={q.status === "upload" || q.status === "gen"} />
                    <select value={q.enemyId ?? ""} onChange={(e) => patch(q.key, { enemyId: e.target.value || null })} className={`${field} w-40 shrink-0`} disabled={q.status === "upload" || q.status === "gen"}>
                      <option value="">적용 안 함</option>
                      {enemies.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </div>
                  <Input value={q.notes} onChange={(e) => patch(q.key, { notes: e.target.value })} placeholder="이 항목만의 메모" disabled={q.status === "upload" || q.status === "gen"} />
                  {q.error ? <p className="text-xs text-danger">{q.error}</p> : null}
                </div>
                <div className="flex flex-col items-end gap-1 text-xs">
                  <span className={q.status === "fail" ? "text-danger" : q.status === "done" ? "text-ok" : "text-muted"}>
                    {q.status === "wait" ? "대기" : q.status === "upload" ? "업로드 중" : q.status === "gen" ? "생성 중…" : q.status === "done" ? "완료" : "실패"}
                  </span>
                  {q.result ? <button type="button" className="text-accent" onClick={() => setPreview(q.result!)}>미리보기</button> : null}
                  {q.status !== "upload" && q.status !== "gen" ? <button type="button" className="text-muted hover:text-danger" onClick={() => setQueue((qq) => qq.filter((x) => x.key !== q.key))}>제거</button> : null}
                </div>
              </li>
            ))}
          </ul>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-muted">보낼 프롬프트 보기</summary>
            <p className="mt-1 whitespace-pre-wrap border border-border bg-elev p-2 text-xs text-muted">{promptPreview}</p>
            <p className="mt-1 text-[11px] text-muted">스타일 문장은 <code>apps/web/src/lib/sprite/prompt.ts</code> 에서 바꿉니다. 원작 이미지는 참고로 보내지 않습니다.</p>
          </details>
        </Panel>

        {/* 오른쪽: 미리보기 + 코드 모션 */}
        <MotionPreview src={preview} />
      </div>

      <JobLog campaignId={campaignId} jobs={jobs} enemies={enemies} onPreview={setPreview} />
    </div>
  );
}

function MotionPreview({ src }: { src: string | null }) {
  const [motion, setMotion] = useState<SpriteMotion>("idle");
  const [tick, setTick] = useState(0);
  const [flip, setFlip] = useState(false);
  const [bg, setBg] = useState(true);
  const [h, setH] = useState(220);
  const play = (m: SpriteMotion) => { setMotion(m); setTick((t) => t + 1); };
  return (
    <Panel title="미리보기 · 코드 모션">
      <div className="relative flex h-72 items-end justify-center overflow-hidden border border-border" style={bg ? { backgroundImage: `url(${BACKGROUNDS.backstreet})`, backgroundSize: "cover", backgroundPosition: "center" } : { backgroundImage: "repeating-conic-gradient(#2a2222 0% 25%, #1a1414 0% 50%)", backgroundSize: "16px 16px" }}>
        {src ? (
          <div className="mb-4">
            <SdSprite src={src} height={h} flip={flip} motion={motion} motionKey={tick} />
          </div>
        ) : <p className="mb-4 text-xs text-white/60">아직 결과가 없습니다</p>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {SPRITE_MOTIONS.map((m) => <button key={m.id} type="button" onClick={() => play(m.id)} className={`rounded-md border px-2 py-1 text-xs ${motion === m.id ? "border-accent text-accent" : "border-border text-fg hover:bg-fg/5"}`}>{m.label}</button>)}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
        <label className="flex items-center gap-1"><input type="checkbox" checked={flip} onChange={(e) => setFlip(e.target.checked)} /> 적 방향(왼쪽 보기)</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={bg} onChange={(e) => setBg(e.target.checked)} /> 전투 배경</label>
        <label className="flex items-center gap-1">크기 <input type="range" min={100} max={260} value={h} onChange={(e) => setH(Number(e.target.value))} /></label>
      </div>
      <p className="mt-2 text-[11px] text-muted">전투 보드와 장면 무대에서는 합·공격·피격·회피·전투불능 결과에 맞춰 같은 모션이 자동으로 나옵니다.</p>
    </Panel>
  );
}

function JobLog({ campaignId, jobs, enemies, onPreview }: { campaignId: string; jobs: SpriteJobRow[]; enemies: EnemyLite[]; onPreview: (u: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const enemyName = (id: string | null) => enemies.find((e) => e.id === id)?.name ?? null;
  const act = (fn: () => Promise<{ error?: string }>) => start(async () => { setErr(null); const r = await fn(); if (r.error) setErr(r.error); router.refresh(); });
  const total = jobs.reduce((s, j) => s + (j.cost_usd ?? 0), 0);
  const done = jobs.filter((j) => j.status === "done").length;
  return (
    <Panel title="생성 로그" stamp={`${jobs.length}건`} right={<span className="text-xs text-muted">완료 {done} · 실패 {jobs.filter((j) => j.status === "failed").length}{total ? ` · 추정 비용 $${total.toFixed(2)}` : ""}</span>}>
      {err ? <p className="mb-2 text-xs text-danger">{err}</p> : null}
      {jobs.length === 0 ? <p className="text-sm text-muted">아직 기록이 없습니다.</p> : null}
      <ul className="divide-y divide-border">
        {jobs.map((j) => (
          <li key={j.id} className="py-2">
            <div className="grid gap-2 sm:grid-cols-[3.5rem_1fr_auto]">
              <button type="button" className="h-14 w-14 overflow-hidden bg-fg/10" onClick={() => j.result_url && onPreview(j.result_url)} title="미리보기">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {j.result_url ? <img src={j.result_url} alt="" className="h-full w-full object-contain" /> : j.source_url ? <img src={j.source_url} alt="" className="h-full w-full object-cover opacity-50" /> : null}
              </button>
              <div className="min-w-0 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{j.label || "(이름 없음)"}</span>
                  <span className={`text-xs ${j.status === "failed" ? "text-danger" : j.status === "done" ? "text-ok" : "text-muted"}`}>{STATUS_LABEL[j.status]}</span>
                  {j.enemy_id ? <Link href={`/campaigns/${campaignId}/enemies/${j.enemy_id}`} className="text-xs text-accent">→ {enemyName(j.enemy_id) ?? "적"}</Link> : null}
                </div>
                <div className="text-xs text-muted">
                  {new Date(j.created_at).toLocaleString("ko-KR")} · {j.provider}/{j.model}{j.duration_ms ? ` · ${(j.duration_ms / 1000).toFixed(1)}초` : ""}{j.cost_usd !== null ? ` · $${Number(j.cost_usd).toFixed(3)}` : ""}{j.source_url ? " · 참고 이미지" : " · 글만"}
                </div>
                {j.error ? <div className="text-xs text-danger">{j.error}</div> : null}
                <button type="button" className="text-[11px] text-muted hover:text-fg" onClick={() => setOpen(open === j.id ? null : j.id)}>{open === j.id ? "프롬프트 접기" : "프롬프트·사용량"}</button>
                {open === j.id ? <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap border border-border bg-elev p-2 text-[11px] text-muted">{j.prompt}{j.usage ? `\n\n사용량: ${JSON.stringify(j.usage)}` : ""}</pre> : null}
              </div>
              {j.status === "done" && j.result_url ? (
                <div className="flex flex-col items-end gap-1 text-xs">
                  <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const eid = String(f.get("enemy") || ""); if (eid) act(() => applySpriteToEnemy(campaignId, j.id, eid)); }}>
                    <select name="enemy" className={`${field} w-32`} defaultValue="">
                      <option value="">적 선택</option>
                      {enemies.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                    <Button type="submit" variant="ghost" className="px-2 py-1 text-xs" disabled={pending}>적용</Button>
                  </form>
                  <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); act(() => createEnemyFromSprite(campaignId, j.id, String(f.get("name") || j.label))); }}>
                    <Input name="name" defaultValue={j.label} placeholder="새 적 이름" className="w-32 px-2 py-1 text-xs" />
                    <Button type="submit" variant="ghost" className="px-2 py-1 text-xs" disabled={pending}>새 적 등록</Button>
                  </form>
                  <div className="flex gap-2">
                    <a href={j.result_url} download className="text-muted hover:text-fg">PNG 저장</a>
                    <button type="button" className="text-muted hover:text-danger" disabled={pending} onClick={() => { if (confirm("이 기록과 결과 파일을 지울까요? (적에 적용된 스탠딩은 유지)")) act(() => deleteSpriteJob(campaignId, j.id)); }}>삭제</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-end text-xs">
                  <button type="button" className="text-muted hover:text-danger" disabled={pending} onClick={() => act(() => deleteSpriteJob(campaignId, j.id))}>삭제</button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
