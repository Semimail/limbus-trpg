"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DAMAGE_TYPE_LABEL, type SpritePose, type SpritePoses, type SpriteAnimKey, type SpriteAnims, type DamageType, type DefenseKind } from "@limbus/rules";
import { createClient } from "@/lib/supabase/client";
import { Button, Input } from "@/components/ui";
import { Panel } from "@/components/office/panel";
import { BACKGROUNDS } from "@/components/icons";
import { SdSprite, SPRITE_MOTIONS, type SpriteMotion } from "./sd-sprite";
import { buildSpritePrompt, POSES, STRIPS } from "@/lib/sprite/prompt";
import { STRIP_SPECS, skillStripSpec, fpsFor, isSkillKey, type StripSpec } from "@/lib/sprite/strip";
import { sliceStrip } from "@/lib/sprite/slice";
import { generateSprite, generatePose, generateStrip, saveStripFrames, applySprite, createEnemyFromSprite, deleteSpriteJob, type SpriteJobRow, type SpriteTarget } from "@/app/campaigns/[id]/sprites/actions";

/*
 * SD 스프라이트 공방 (GM 전용 — 플레이어에게는 보이지 않는다)
 *  - 이미지를 여러 장 올리거나 글만 적어 대기열에 넣고, 한 장씩 차례로 생성한다 (AI는 대기 1장, 모션은 코드).
 *  - 완료된 대기 이미지에는 "포즈 이미지"(모션당 정지 1장, 교차 페이드)와 "프레임 띠"(모션당 호출 1회로 N칸 띠 → 브라우저에서 잘라 프레임 재생)를 더할 수 있다.
 *  - 결과는 내 캐릭터(플레이어) 또는 적 도감·모든 캐릭터(GM)의 스탠딩으로 적용한다.
 *  - 로그는 본인 것만 보인다. GM은 캠페인 전체를 보지만, GM이 만든 것은 플레이어에게 보이지 않는다.
 */

interface SkillLite { id: string; name: string; kind: "attack" | "defense"; damageType: DamageType; defenseKind?: DefenseKind }
interface EnemyLite { id: string; name: string; spriteUrl: string | null; skills: SkillLite[] }
interface CharLite { id: string; name: string; mine: boolean; spriteUrl: string | null; skills: SkillLite[] }
const DEFENSE_LABEL: Record<DefenseKind, string> = { guard: "방어", evade: "회피", counter: "반격" };
const skillLabel = (sk: SkillLite) => `${sk.name || "(이름 없음)"} · ${sk.kind === "attack" ? DAMAGE_TYPE_LABEL[sk.damageType] : DEFENSE_LABEL[sk.defenseKind ?? "guard"]}`;
interface QueueItem { key: string; file: File | null; preview: string | null; label: string; notes: string; target: string; status: "wait" | "upload" | "gen" | "done" | "fail"; result?: string; error?: string; /** 세트 생성 진행 문구 */ progress?: string }
interface PreviewSet { src: string; poses: SpritePoses; anims: SpriteAnims }

const STATUS_LABEL: Record<SpriteJobRow["status"], string> = { queued: "대기", running: "생성 중", done: "완료", failed: "실패" };
const field = "w-full rounded-md border border-border bg-elev px-2 py-1 text-sm outline-none focus:border-accent";

/** select 값 ↔ 대상. "" = 적용 안 함, "e:<id>" 적, "c:<id>" 캐릭터 */
const encodeTarget = (t: SpriteTarget): string => (t ? `${t.kind === "enemy" ? "e" : "c"}:${t.id}` : "");
const decodeTarget = (v: string): SpriteTarget => { const [k, id] = v.split(":"); return id ? { kind: k === "e" ? "enemy" : "character", id } : null; };
const isPose = (p: string): p is SpritePose => POSES.some((x) => x.id === p);
const isAnimKey = (p: string): p is SpriteAnimKey => p === "idle" || isPose(p) || isSkillKey(p);
const isStrip = (j: SpriteJobRow) => j.kind === "strip";
/** 완료된 자식 포즈 이미지 / 프레임 띠를 모은다 */
const posesOf = (kids: SpriteJobRow[]): SpritePoses => { const o: SpritePoses = {}; for (const k of kids) if (!isStrip(k) && k.status === "done" && k.result_url && isPose(k.pose)) o[k.pose] = k.result_url; return o; };
const animsOf = (kids: SpriteJobRow[]): SpriteAnims => { const o: SpriteAnims = {}; for (const k of kids) if (isStrip(k) && k.status === "done" && k.frame_urls?.length && isAnimKey(k.pose)) o[k.pose] = { frames: k.frame_urls, fps: fpsFor(k.pose, k.frame_urls.length) }; return o; };

/** 띠 결과를 브라우저에서 잘라 사용자 폴더에 올리고 서버에 기록한다 (대기열 세트 생성과 로그가 함께 쓴다) */
async function sliceAndUploadStrip(campaignId: string, jobId: string, resultUrl: string, frames: number, label: string, onProgress: (t: string) => void) {
  onProgress(`${label}: 프레임 자르는 중…`);
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");
  const { blobs } = await sliceStrip(resultUrl, frames);
  const urls: string[] = [];
  for (let i = 0; i < blobs.length; i++) {
    onProgress(`${label}: 프레임 ${i + 1}/${blobs.length} 올리는 중…`);
    const path = `${user.id}/${jobId}-f${i}.png`;
    const { error } = await supabase.storage.from("sprites").upload(path, blobs[i]!, { contentType: "image/png", upsert: true });
    if (error) throw new Error(`프레임 업로드 실패: ${error.message}`);
    urls.push(supabase.storage.from("sprites").getPublicUrl(path).data.publicUrl);
  }
  const r = await saveStripFrames(campaignId, jobId, urls);
  if (r.error) throw new Error(r.error);
}
const skillSpecOf = (sk: SkillLite) => skillStripSpec(sk);

function TargetSelect({ value, onChange, name, enemies, characters, className = field, disabled, none = "적용 안 함" }: { value?: string; onChange?: (v: string) => void; name?: string; enemies: EnemyLite[]; characters: CharLite[]; className?: string; disabled?: boolean; none?: string }) {
  return (
    <select {...(onChange ? { value, onChange: (e) => onChange(e.target.value) } : { name, defaultValue: "" })} className={className} disabled={disabled}>
      <option value="">{none}</option>
      {characters.length ? <optgroup label="캐릭터">{characters.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.name}{c.mine ? "" : " (남의 캐릭터)"}{c.spriteUrl ? " · 스탠딩 있음" : ""}</option>)}</optgroup> : null}
      {enemies.length ? <optgroup label="적 도감">{enemies.map((e) => <option key={e.id} value={`e:${e.id}`}>{e.name}{e.spriteUrl ? " · 스탠딩 있음" : ""}</option>)}</optgroup> : null}
    </select>
  );
}

export function SpriteStudio({ campaignId, isGm, enemies, characters, jobs, provider, initialTarget }: { campaignId: string; isGm: boolean; enemies: EnemyLite[]; characters: CharLite[]; jobs: SpriteJobRow[]; provider: { name: string; model: string; configured: boolean }; initialTarget: SpriteTarget }) {
  const router = useRouter();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [notes, setNotes] = useState("");
  const [target, setTarget] = useState<string>(encodeTarget(initialTarget));
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // 세트 생성: 대기 이미지 뒤에 이어서 만들 공통 띠와, 대상을 지정했을 때의 스킬별 띠
  const [setStrips, setSetStrips] = useState<SpriteAnimKey[]>(["idle", "hit", "evade", "down"]);
  const [setSkills, setSetSkills] = useState(true);
  const toggleSetStrip = (k: SpriteAnimKey) => setSetStrips((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const targetSkillsOf = (t: SpriteTarget): SkillLite[] => !t ? [] : t.kind === "enemy" ? enemies.find((e) => e.id === t.id)?.skills ?? [] : characters.find((c) => c.id === t.id)?.skills ?? [];
  const callsFor = (q: QueueItem) => 1 + setStrips.length + (setSkills ? targetSkillsOf(decodeTarget(q.target)).length : 0);
  // 부모(대기 정지) 작업과 자식(포즈·띠) 작업으로 나눈다. 옛 행(pose 없음)은 대기로 본다
  const parents = useMemo(() => jobs.filter((j) => !j.parent_job_id && (j.pose ?? "idle") === "idle" && !isStrip(j)), [jobs]);
  const kidsOf = useMemo(() => { const m: Record<string, SpriteJobRow[]> = {}; for (const j of jobs) if (j.parent_job_id) (m[j.parent_job_id] ??= []).push(j); return m; }, [jobs]);
  const orphans = useMemo(() => jobs.filter((j) => j.parent_job_id && !jobs.some((p) => p.id === j.parent_job_id)), [jobs]);
  // 미리보기는 대기 이미지 URL 만 기억하고, 포즈·띠는 그 URL 의 부모 작업에서 매번 끌어온다 (새로 완료되면 자동 반영)
  const [previewSrc, setPreviewSrc] = useState<string | null>(() => parents.find((j) => j.result_url)?.result_url ?? null);
  // 스킬 id → 스킬 정보 (스킬 띠 이름 표시·미리보기용)
  const skillInfo = useMemo(() => { const m: Record<string, SkillLite> = {}; for (const e of enemies) for (const sk of e.skills) m[sk.id] = sk; for (const c of characters) for (const sk of c.skills) m[sk.id] = sk; return m; }, [enemies, characters]);
  const preview = useMemo<PreviewSet | null>(() => { if (!previewSrc) return null; const p = parents.find((j) => j.result_url === previewSrc); const kids = p ? kidsOf[p.id] ?? [] : []; return { src: previewSrc, poses: posesOf(kids), anims: animsOf(kids) }; }, [previewSrc, parents, kidsOf]);

  // 미리보기 URL 정리
  useEffect(() => () => { queue.forEach((q) => { if (q.preview?.startsWith("blob:")) URL.revokeObjectURL(q.preview); }); }, [queue]);

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const items: QueueItem[] = Array.from(files).filter((f) => f.type.startsWith("image/")).map((f) => ({
      key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, file: f, preview: URL.createObjectURL(f), label: f.name.replace(/\.[^.]+$/, ""), notes, target, status: "wait",
    }));
    setQueue((q) => [...q, ...items]);
    if (fileRef.current) fileRef.current.value = "";
  };
  const addTextOnly = () => setQueue((q) => [...q, { key: `${Date.now()}-t`, file: null, preview: null, label: "", notes, target, status: "wait" }]);
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
        const r = await generateSprite(campaignId, { sourceUrl, label: item.label, notes: item.notes, target: decodeTarget(item.target) });
        if (!r.resultUrl || !r.jobId) throw new Error(r.error ?? "생성 실패");
        patch(item.key, { result: r.resultUrl, error: r.error }); setPreviewSrc(r.resultUrl);
        router.refresh();
        // 세트: 공통 띠 → 스킬별 띠 (대상이 적용된 경우만). 하나가 실패해도 다음으로 넘어가고 오류는 모아 둔다
        const target = decodeTarget(item.target);
        const plan: { key: SpriteAnimKey; label: string; frames: number }[] = [
          ...setStrips.map((k) => ({ key: k, label: STRIPS.find((x) => x.id === k)?.label ?? k, frames: STRIP_SPECS[k as keyof typeof STRIP_SPECS]?.frames ?? 4 })),
          ...(setSkills && target && !r.error ? targetSkillsOf(target).map((sk) => ({ key: `skill:${sk.id}` as SpriteAnimKey, label: skillLabel(sk), frames: skillSpecOf(sk).frames })) : []),
        ];
        const errs: string[] = [];
        for (let i = 0; i < plan.length; i++) {
          if (stopRef.current) break;
          const st = plan[i]!;
          const prog = (t: string) => patch(item.key, { progress: `띠 ${i + 1}/${plan.length} · ${t}` });
          try {
            prog(`${st.label} 생성 중… (${st.frames}칸)`);
            const g = await generateStrip(campaignId, r.jobId, st.key);
            if (g.error || !g.resultUrl || !g.jobId) throw new Error(g.error ?? "생성 실패");
            await sliceAndUploadStrip(campaignId, g.jobId, g.resultUrl, g.frames ?? st.frames, st.label, prog);
          } catch (e) { errs.push(`${st.label}: ${e instanceof Error ? e.message : "실패"}`); }
          router.refresh();
        }
        patch(item.key, { status: "done", progress: plan.length ? `띠 ${plan.length - errs.length}/${plan.length} 완료` : undefined, error: [r.error, ...errs].filter(Boolean).join(" / ") || undefined });
      } catch (e) {
        patch(item.key, { status: "fail", progress: undefined, error: e instanceof Error ? e.message : "실패" });
      }
      router.refresh();
    }
    setRunning(false);
  };
  const totalCalls = queue.filter((q) => q.status === "wait" || q.status === "fail").reduce((n, q) => n + callsFor(q), 0);
  const waiting = queue.filter((q) => q.status === "wait" || q.status === "fail").length;
  const promptPreview = useMemo(() => buildSpritePrompt({ label: queue[0]?.label, notes, hasSource: !!queue[0]?.file }), [queue, notes]);
  const busy = (q: QueueItem) => q.status === "upload" || q.status === "gen";

  return (
    <div className="space-y-4">
      {!provider.configured ? (
        <div className="border border-danger/60 bg-danger/10 p-3 text-sm">
          이미지 생성 키가 없습니다. {isGm ? <>Vercel(또는 <code>apps/web/.env.local</code>)에 <code>OPENAI_API_KEY</code>를 넣으면 생성할 수 있습니다. 시험만 하려면 <code>SPRITE_PROVIDER=mock</code>.</> : "GM에게 알려 주세요."}
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        {/* 왼쪽: 대기열 */}
        <Panel title="만들기" stamp={`${provider.name} · ${provider.model}`}
          right={<span className="text-xs text-muted">AI는 대기 포즈 한 장을 그리고, 움직임은 코드로 냅니다. 포즈·프레임 띠는 아래 로그에서 추가</span>}>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
            <label className="block"><span className="block text-xs text-muted">공통 메모 (무기·복장·특징, 선택)</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={field} placeholder="예: 녹슨 식칼을 든 뒷골목 청소부, 낡은 작업복, 방독면" /></label>
            <label className="block"><span className="block text-xs text-muted">생성 후 바로 스탠딩으로 적용할 대상 (선택)</span>
              <TargetSelect value={target} onChange={setTarget} enemies={enemies} characters={characters} none="적용 안 함 (나중에 로그에서 적용)" />
              <span className="mt-1 block text-[11px] text-muted">메모와 대상은 대기열에 추가할 때 각 항목에 복사됩니다.{isGm ? "" : " 내 캐릭터에만 적용할 수 있습니다."}</span></label>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border border-border/70 bg-elev/40 p-2 text-[11px]">
            <span className="font-semibold text-muted">세트로 함께 만들기:</span>
            {STRIPS.map((st) => (
              <label key={st.id} className="flex items-center gap-1"><input type="checkbox" checked={setStrips.includes(st.id)} onChange={() => toggleSetStrip(st.id)} disabled={running} /> {st.label} <span className="text-muted">{STRIP_SPECS[st.id as keyof typeof STRIP_SPECS].frames}칸</span></label>
            ))}
            <label className="flex items-center gap-1"><input type="checkbox" checked={setSkills} onChange={(e) => setSetSkills(e.target.checked)} disabled={running} /> 스킬별 띠 <span className="text-muted">(대상을 지정한 항목만, 스킬 수만큼)</span></label>
            <span className="text-muted">대기 이미지가 끝나면 이어서 자동 생성됩니다. 항목당 호출 = 1 + 띠 수.</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="inline-block cursor-pointer rounded-md border border-border px-3 py-1.5 text-sm hover:bg-fg/5">
              이미지 추가 (여러 장 가능)
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
            </label>
            <Button variant="ghost" onClick={addTextOnly}>글로만 만들기</Button>
            <span className="flex-1" />
            {running ? <Button variant="danger" onClick={() => { stopRef.current = true; }}>중지</Button> : null}
            <Button onClick={run} disabled={running || waiting === 0 || !provider.configured}>{running ? "생성 중..." : `생성 시작 (${waiting}항목 · 호출 ${totalCalls}회)`}</Button>
          </div>
          {queue.length === 0 ? <p className="mt-3 text-sm text-muted">이미지를 올리거나 &lsquo;글로만 만들기&rsquo;를 눌러 대기열에 넣으세요. 세트 선택에 따라 항목당 호출 수가 정해집니다.</p> : null}
          <ul className="mt-3 space-y-2">
            {queue.map((q) => (
              <li key={q.key} className="grid gap-2 border border-border p-2 sm:grid-cols-[4rem_1fr_auto]">
                <div className="h-16 w-16 overflow-hidden bg-fg/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {q.result ? <img src={q.result} alt="" className="h-full w-full object-contain" /> : q.preview ? <img src={q.preview} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-[10px] text-muted">글</span>}
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex gap-2">
                    <Input value={q.label} onChange={(e) => patch(q.key, { label: e.target.value })} placeholder="이름 (프롬프트·로그에 씀)" disabled={busy(q)} />
                    <TargetSelect value={q.target} onChange={(v) => patch(q.key, { target: v })} enemies={enemies} characters={characters} className={`${field} w-44 shrink-0`} disabled={busy(q)} />
                  </div>
                  <Input value={q.notes} onChange={(e) => patch(q.key, { notes: e.target.value })} placeholder="이 항목만의 메모" disabled={busy(q)} />
                  {q.progress ? <p className="text-[11px] text-accent">{q.progress}</p> : null}
                  {q.error ? <p className="text-xs text-danger">{q.error}</p> : null}
                </div>
                <div className="flex flex-col items-end gap-1 text-xs">
                  <span className={q.status === "fail" ? "text-danger" : q.status === "done" ? "text-ok" : "text-muted"}>
                    {q.status === "wait" ? `대기 (호출 ${callsFor(q)})` : q.status === "upload" ? "업로드 중" : q.status === "gen" ? "생성 중…" : q.status === "done" ? "완료" : "실패"}
                  </span>
                  {q.result ? <button type="button" className="text-accent" onClick={() => setPreviewSrc(q.result!)}>미리보기</button> : null}
                  {!busy(q) ? <button type="button" className="text-muted hover:text-danger" onClick={() => setQueue((qq) => qq.filter((x) => x.key !== q.key))}>제거</button> : null}
                </div>
              </li>
            ))}
          </ul>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-muted">보낼 프롬프트 보기</summary>
            <p className="mt-1 whitespace-pre-wrap border border-border bg-elev p-2 text-xs text-muted">{promptPreview}</p>
            {isGm ? <p className="mt-1 text-[11px] text-muted">스타일·포즈·띠 문장은 <code>apps/web/src/lib/sprite/prompt.ts</code> 에서 바꿉니다. 원작 이미지는 참고로 보내지 않습니다.</p> : null}
          </details>
        </Panel>

        {/* 오른쪽: 미리보기 + 코드 모션 (+ 포즈·띠) */}
        <MotionPreview set={preview} skillInfo={skillInfo} />
      </div>

      <JobLog campaignId={campaignId} isGm={isGm} parents={parents} kidsOf={kidsOf} orphans={orphans} enemies={enemies} characters={characters} skillInfo={skillInfo} configured={provider.configured}
        onPreview={(p) => setPreviewSrc(p.result_url!)} />
    </div>
  );
}

function MotionPreview({ set, skillInfo }: { set: PreviewSet | null; skillInfo: Record<string, SkillLite> }) {
  const [motion, setMotion] = useState<SpriteMotion>("idle");
  const [animKey, setAnimKey] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [flip, setFlip] = useState(false);
  const [bg, setBg] = useState(true);
  const [usePoses, setUsePoses] = useState(true);
  const [useAnims, setUseAnims] = useState(true);
  const [h, setH] = useState(220);
  const play = (m: SpriteMotion, key: string | null = null) => { setMotion(m); setAnimKey(key); setTick((t) => t + 1); };
  const skillKeys = set ? Object.keys(set.anims).filter(isSkillKey) : [];
  const poseCount = set ? Object.keys(set.poses).length : 0;
  const animCount = set ? Object.keys(set.anims).length : 0;
  const mark = (m: SpriteMotion) => { if (!set || !isAnimKey(m)) return ""; if (set.anims[m]) return " ◆"; if (m !== "idle" && set.poses[m]) return " ●"; return ""; };
  return (
    <Panel title="미리보기 · 코드 모션" stamp={animCount || poseCount ? `띠 ${animCount} · 포즈 ${poseCount}` : undefined}>
      <div className="relative flex h-72 items-end justify-center overflow-hidden border border-border" style={bg ? { backgroundImage: `url(${BACKGROUNDS.backstreet})`, backgroundSize: "cover", backgroundPosition: "center" } : { backgroundImage: "repeating-conic-gradient(#2a2222 0% 25%, #1a1414 0% 50%)", backgroundSize: "16px 16px" }}>
        {set ? (
          <div className="mb-4">
            <SdSprite src={set.src} poses={usePoses ? set.poses : null} anims={useAnims ? set.anims : null} animKey={useAnims ? animKey : null} height={h} flip={flip} motion={motion} motionKey={tick} />
          </div>
        ) : <p className="mb-4 text-xs text-white/60">아직 결과가 없습니다</p>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {SPRITE_MOTIONS.map((m) => <button key={m.id} type="button" onClick={() => play(m.id)} className={`rounded-md border px-2 py-1 text-xs ${motion === m.id && !animKey ? "border-accent text-accent" : "border-border text-fg hover:bg-fg/5"}`}>{m.label}{mark(m.id)}</button>)}
      </div>
      {skillKeys.length ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {skillKeys.map((k) => { const sk = skillInfo[k.slice(6)]; const m: SpriteMotion = sk?.kind === "defense" ? "ready" : "attack"; return <button key={k} type="button" onClick={() => play(m, k)} className={`rounded-md border px-2 py-1 text-xs ${animKey === k ? "border-accent text-accent" : "border-border text-fg hover:bg-fg/5"}`}>◆ {sk ? skillLabel(sk) : k}</button>; })}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
        <label className="flex items-center gap-1"><input type="checkbox" checked={flip} onChange={(e) => setFlip(e.target.checked)} /> 적 방향(왼쪽 보기)</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={bg} onChange={(e) => setBg(e.target.checked)} /> 전투 배경</label>
        {animCount ? <label className="flex items-center gap-1"><input type="checkbox" checked={useAnims} onChange={(e) => setUseAnims(e.target.checked)} /> 프레임 띠 사용</label> : null}
        {poseCount ? <label className="flex items-center gap-1"><input type="checkbox" checked={usePoses} onChange={(e) => setUsePoses(e.target.checked)} /> 포즈 이미지 사용</label> : null}
        <label className="flex items-center gap-1">크기 <input type="range" min={100} max={260} value={h} onChange={(e) => setH(Number(e.target.value))} /></label>
      </div>
      <p className="mt-2 text-[11px] text-muted">전투 보드와 장면 무대에서는 합·공격·피격·회피·전투불능 결과에 맞춰 같은 모션이 자동으로 나옵니다. ◆ 프레임 띠(실제 프레임 재생), ● 포즈 이미지(교차 페이드). 띠가 있으면 띠가 우선입니다.</p>
    </Panel>
  );
}

function JobLog({ campaignId, isGm, parents, kidsOf, orphans, enemies, characters, skillInfo, configured, onPreview }: { campaignId: string; isGm: boolean; parents: SpriteJobRow[]; kidsOf: Record<string, SpriteJobRow[]>; orphans: SpriteJobRow[]; enemies: EnemyLite[]; characters: CharLite[]; skillInfo: Record<string, SkillLite>; configured: boolean; onPreview: (p: SpriteJobRow) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null); // 포즈·띠 생성 중인 부모 id
  const [progress, setProgress] = useState<string>("");
  const [poseSel, setPoseSel] = useState<Record<string, SpritePose[]>>({});
  const [stripSel, setStripSel] = useState<Record<string, SpriteAnimKey[]>>({});
  const all = useMemo(() => [...parents, ...Object.values(kidsOf).flat(), ...orphans], [parents, kidsOf, orphans]);
  const linked = (j: SpriteJobRow): { href: string; name: string } | null => {
    if (j.enemy_id) return { href: `/campaigns/${campaignId}/enemies/${j.enemy_id}`, name: enemies.find((e) => e.id === j.enemy_id)?.name ?? "적" };
    if (j.character_id) return { href: `/characters/${j.character_id}`, name: characters.find((c) => c.id === j.character_id)?.name ?? "캐릭터" };
    return null;
  };
  const act = (fn: () => Promise<{ error?: string }>) => start(async () => { setErr(null); const r = await fn(); if (r.error) setErr(r.error); router.refresh(); });
  const total = all.reduce((s, j) => s + (j.cost_usd ?? 0), 0);
  const done = all.filter((j) => j.status === "done").length;
  const stillKids = (p: SpriteJobRow) => (kidsOf[p.id] ?? []).filter((k) => !isStrip(k));
  const stripKids = (p: SpriteJobRow) => (kidsOf[p.id] ?? []).filter(isStrip);
  const poseLabel = (id: string) => POSES.find((x) => x.id === id)?.label ?? id;
  const stripLabel = (id: string) => { if (isSkillKey(id)) { const sk = skillInfo[id.slice(6)]; return sk ? `스킬 ${skillLabel(sk)}` : "스킬 (삭제됨)"; } return STRIPS.find((x) => x.id === id)?.label ?? id; };
  /** 부모가 연결된 적/캐릭터의 스킬 목록 (스킬 띠 후보) */
  const targetSkills = (p: SpriteJobRow): SkillLite[] => p.enemy_id ? enemies.find((e) => e.id === p.enemy_id)?.skills ?? [] : p.character_id ? characters.find((c) => c.id === p.character_id)?.skills ?? [] : [];
  const specOf = (key: string): StripSpec => { if (isSkillKey(key)) { const sk = skillInfo[key.slice(6)]; return sk ? skillStripSpec(sk) : { frames: 6, fps: 10, loop: false }; } return STRIP_SPECS[key as keyof typeof STRIP_SPECS] ?? { frames: 4, fps: 7, loop: false }; };
  const selPoses = (p: SpriteJobRow): SpritePose[] => poseSel[p.id] ?? POSES.map((x) => x.id).filter((id) => !stillKids(p).some((k) => k.pose === id && k.status === "done"));
  const selStrips = (p: SpriteJobRow): SpriteAnimKey[] => stripSel[p.id] ?? [...STRIPS.map((x) => x.id), ...targetSkills(p).map((sk) => `skill:${sk.id}` as SpriteAnimKey)].filter((id) => !stripKids(p).some((k) => k.pose === id && k.status === "done" && k.frame_urls?.length));
  const togglePose = (p: SpriteJobRow, id: SpritePose) => setPoseSel((m) => { const cur = selPoses(p); return { ...m, [p.id]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] }; });
  const toggleStrip = (p: SpriteJobRow, id: SpriteAnimKey) => setStripSel((m) => { const cur = selStrips(p); return { ...m, [p.id]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] }; });

  const runPoses = async (p: SpriteJobRow) => {
    const sel = selPoses(p); if (!sel.length || working) return;
    setWorking(p.id); setErr(null);
    for (const pose of sel) {
      setProgress(`${poseLabel(pose)} 포즈 생성 중…`);
      const r = await generatePose(campaignId, p.id, pose);
      if (r.error) setErr(`${poseLabel(pose)}: ${r.error}`);
      router.refresh();
    }
    setPoseSel((m) => ({ ...m, [p.id]: [] })); setProgress(""); setWorking(null);
  };
  /** 띠 결과를 브라우저에서 잘라 올리고 기록한다 */
  const sliceAndUpload = (jobId: string, resultUrl: string, frames: number, label: string) => sliceAndUploadStrip(campaignId, jobId, resultUrl, frames, label, setProgress);
  const runStrips = async (p: SpriteJobRow) => {
    const sel = selStrips(p); if (!sel.length || working) return;
    setWorking(p.id); setErr(null);
    for (const key of sel) {
      try {
        setProgress(`${stripLabel(key)} 띠 생성 중… (${specOf(key).frames}칸)`);
        const r = await generateStrip(campaignId, p.id, key);
        if (r.error || !r.resultUrl || !r.jobId) throw new Error(r.error ?? "생성 실패");
        await sliceAndUpload(r.jobId, r.resultUrl, r.frames ?? specOf(key).frames, stripLabel(key));
      } catch (e) { setErr(`${stripLabel(key)}: ${e instanceof Error ? e.message : "실패"}`); }
      router.refresh();
    }
    setStripSel((m) => ({ ...m, [p.id]: [] })); setProgress(""); setWorking(null);
  };
  const resliceStrip = async (k: SpriteJobRow) => {
    if (!k.result_url || working) return;
    setWorking(k.parent_job_id ?? k.id); setErr(null);
    try { await sliceAndUpload(k.id, k.result_url, k.frames ?? specOf(k.pose).frames, stripLabel(k.pose)); }
    catch (e) { setErr(`${stripLabel(k.pose)}: ${e instanceof Error ? e.message : "실패"}`); }
    router.refresh(); setProgress(""); setWorking(null);
  };

  const meta = (j: SpriteJobRow) => `${new Date(j.created_at).toLocaleString("ko-KR")} · ${j.provider}/${j.model}${j.duration_ms ? ` · ${(j.duration_ms / 1000).toFixed(1)}초` : ""}${j.cost_usd !== null ? ` · $${Number(j.cost_usd).toFixed(3)}` : ""}`;
  const thumb = (j: SpriteJobRow, size: string, click?: () => void) => (
    <button type="button" className={`${size} overflow-hidden bg-fg/10`} onClick={click} title={click ? "미리보기" : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {j.result_url ? <img src={j.result_url} alt="" className="h-full w-full object-contain" /> : j.source_url ? <img src={j.source_url} alt="" className="h-full w-full object-cover opacity-50" /> : null}
    </button>
  );
  const delBtn = (j: SpriteJobRow, label = "삭제", confirmMsg?: string) => (
    <button type="button" className="text-muted hover:text-danger" disabled={pending} onClick={() => { if (!confirmMsg || confirm(confirmMsg)) act(() => deleteSpriteJob(campaignId, j.id)); }}>{label}</button>
  );
  const row = (j: SpriteJobRow, isParent: boolean) => {
    const ln = linked(j); const stills = isParent ? stillKids(j) : []; const strips = isParent ? stripKids(j) : [];
    const busyHere = working === j.id;
    return (
      <li key={j.id} className="py-2">
        <div className="grid gap-2 sm:grid-cols-[3.5rem_1fr_auto]">
          {thumb(j, "h-14 w-14", j.result_url && isParent ? () => onPreview(j) : undefined)}
          <div className="min-w-0 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{j.label || "(이름 없음)"}</span>
              {!isParent ? <span className="rounded-sm bg-fg/10 px-1 text-[10px]">{isStrip(j) ? `띠 · ${stripLabel(j.pose)}` : poseLabel(j.pose)}</span> : null}
              <span className={`text-xs ${j.status === "failed" ? "text-danger" : j.status === "done" ? "text-ok" : "text-muted"}`}>{STATUS_LABEL[j.status]}</span>
              {ln ? <Link href={ln.href} className="text-xs text-accent">→ {ln.name}</Link> : null}
            </div>
            <div className="text-xs text-muted">{meta(j)}{j.source_url ? (isParent ? " · 참고 이미지" : "") : " · 글만"}</div>
            {j.error ? <div className="text-xs text-danger">{j.error}</div> : null}
            <button type="button" className="text-[11px] text-muted hover:text-fg" onClick={() => setOpen(open === j.id ? null : j.id)}>{open === j.id ? "프롬프트 접기" : "프롬프트·사용량"}</button>
            {open === j.id ? <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap border border-border bg-elev p-2 text-[11px] text-muted">{j.prompt}{j.usage ? `\n\n사용량: ${JSON.stringify(j.usage)}` : ""}</pre> : null}
            {/* 프레임 띠·포즈: 완료된 대기 이미지에만 */}
            {isParent && j.status === "done" && j.result_url ? (
              <div className="mt-2 space-y-2 border border-border/70 bg-elev/40 p-2">
                {busyHere && progress ? <div className="text-[11px] text-accent">{progress}</div> : null}
                {/* 프레임 띠 */}
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold text-muted">프레임 띠 (실제 움직임)</span>
                    {strips.map((k) => (
                      <span key={k.id} className="flex items-center gap-1 text-[11px]">
                        {thumb(k, "h-9 w-20")}
                        <span className={k.status === "failed" ? "text-danger" : k.status === "done" ? "" : "text-muted"}>{stripLabel(k.pose)} {k.frames ?? ""}칸{k.status !== "done" ? ` (${STATUS_LABEL[k.status]})` : k.frame_urls?.length ? "" : " · 자르기 안 됨"}</span>
                        {k.status === "done" && !k.frame_urls?.length ? <button type="button" className="text-accent" disabled={working !== null} onClick={() => void resliceStrip(k)}>자르기</button> : null}
                        {delBtn(k, "×")}
                      </span>
                    ))}
                    {strips.length === 0 ? <span className="text-[11px] text-muted">없음</span> : null}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="text-muted">추가:</span>
                    {STRIPS.map((s) => { const have = strips.some((k) => k.pose === s.id && k.status === "done" && k.frame_urls?.length); const on = selStrips(j).includes(s.id); return (
                      <label key={s.id} className={`flex items-center gap-1 ${have ? "text-muted" : ""}`} title={have ? "이미 있음 (다시 만들면 교체)" : undefined}>
                        <input type="checkbox" checked={on} onChange={() => toggleStrip(j, s.id)} disabled={working !== null} /> {s.label} <span className="text-muted">{STRIP_SPECS[s.id as keyof typeof STRIP_SPECS].frames}칸</span>
                      </label>
                    ); })}
                    {targetSkills(j).length ? <span className="ml-2 text-muted">스킬별:</span> : null}
                    {targetSkills(j).map((sk) => { const key = `skill:${sk.id}` as SpriteAnimKey; const have = strips.some((k) => k.pose === key && k.status === "done" && k.frame_urls?.length); const on = selStrips(j).includes(key); return (
                      <label key={key} className={`flex items-center gap-1 ${have ? "text-muted" : ""}`} title={have ? "이미 있음 (다시 만들면 교체)" : "이 스킬을 쓸 때 재생"}>
                        <input type="checkbox" checked={on} onChange={() => toggleStrip(j, key)} disabled={working !== null} /> {skillLabel(sk)} <span className="text-muted">{skillStripSpec(sk).frames}칸</span>
                      </label>
                    ); })}
                    <Button variant="ghost" className="px-2 py-0.5 text-[11px]" disabled={!configured || working !== null || selStrips(j).length === 0} onClick={() => void runStrips(j)}>
                      {busyHere ? "작업 중…" : `띠 생성 (호출 ${selStrips(j).length}회)`}
                    </Button>
                    <span className="text-muted">모션당 호출 1회로 N칸 띠를 받아 브라우저에서 잘라 프레임으로 재생합니다. 대기 띠는 숨쉬기 루프. 스킬별 띠는 적·캐릭터에 적용한 뒤에 뜨며, 그 스킬을 쓸 때 공통 공격 띠보다 우선합니다 (방어 스킬은 방어·회피·반격 동작).</span>
                  </div>
                </div>
                {/* 포즈 이미지 */}
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold text-muted">포즈 이미지 (정지 1장, 교차 페이드)</span>
                    {stills.map((k) => (
                      <span key={k.id} className="flex items-center gap-1 text-[11px]">
                        {thumb(k, "h-9 w-9")}
                        <span className={k.status === "failed" ? "text-danger" : k.status === "done" ? "" : "text-muted"}>{poseLabel(k.pose)}{k.status !== "done" ? ` (${STATUS_LABEL[k.status]})` : ""}</span>
                        {delBtn(k, "×")}
                      </span>
                    ))}
                    {stills.length === 0 ? <span className="text-[11px] text-muted">없음</span> : null}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="text-muted">추가:</span>
                    {POSES.map((p) => { const have = stills.some((k) => k.pose === p.id && k.status === "done"); const on = selPoses(j).includes(p.id); return (
                      <label key={p.id} className={`flex items-center gap-1 ${have ? "text-muted" : ""}`} title={have ? "이미 있음 (다시 만들면 교체)" : undefined}>
                        <input type="checkbox" checked={on} onChange={() => togglePose(j, p.id)} disabled={working !== null} /> {p.label}
                      </label>
                    ); })}
                    <Button variant="ghost" className="px-2 py-0.5 text-[11px]" disabled={!configured || working !== null || selPoses(j).length === 0} onClick={() => void runPoses(j)}>
                      {busyHere ? "작업 중…" : `포즈 생성 (호출 ${selPoses(j).length}회)`}
                    </Button>
                    <span className="text-muted">띠가 있는 모션은 띠가 우선이고, 포즈 이미지는 띠가 없을 때 쓰입니다.</span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          {j.status === "done" && j.result_url ? (
            <div className="flex flex-col items-end gap-1 text-xs">
              <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); const t = decodeTarget(String(new FormData(e.currentTarget).get("target") || "")); if (t) act(() => applySprite(campaignId, j.id, t)); }}>
                <TargetSelect name="target" enemies={enemies} characters={characters} className={`${field} w-40`} none="대상 선택" />
                <Button type="submit" variant="ghost" className="px-2 py-1 text-xs" disabled={pending}>{isParent ? "적용 (포즈·띠 포함)" : isStrip(j) ? "이 띠만 적용" : "이 포즈만 적용"}</Button>
              </form>
              {isGm && isParent ? (
                <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); act(() => createEnemyFromSprite(campaignId, j.id, String(f.get("name") || j.label))); }}>
                  <Input name="name" defaultValue={j.label} placeholder="새 적 이름" className="w-32 px-2 py-1 text-xs" />
                  <Button type="submit" variant="ghost" className="px-2 py-1 text-xs" disabled={pending}>새 적 등록</Button>
                </form>
              ) : null}
              <div className="flex gap-2">
                <a href={j.result_url} download className="text-muted hover:text-fg">PNG 저장</a>
                {delBtn(j, "삭제", isParent ? "이 기록과 결과 파일, 딸린 포즈·띠까지 지울까요? (이미 적용된 스탠딩은 유지)" : "이 기록과 파일을 지울까요?")}
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-end text-xs">{delBtn(j)}</div>
          )}
        </div>
      </li>
    );
  };
  return (
    <Panel title={isGm ? "생성 로그 (캠페인 전체)" : "내 생성 로그"} stamp={`${all.length}건`} right={<span className="text-xs text-muted">완료 {done} · 실패 {all.filter((j) => j.status === "failed").length}{total ? ` · 추정 비용 $${total.toFixed(2)}` : ""}</span>}>
      {err ? <p className="mb-2 text-xs text-danger">{err}</p> : null}
      {all.length === 0 ? <p className="text-sm text-muted">아직 기록이 없습니다.</p> : null}
      <ul className="divide-y divide-border">
        {parents.map((j) => row(j, true))}
        {orphans.map((j) => row(j, false))}
      </ul>
    </Panel>
  );
}
