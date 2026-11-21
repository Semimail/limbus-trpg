"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Input } from "@/components/ui";
import { Panel } from "@/components/office/panel";
import { REF_ROLES, refRoleLabel, type RefRole } from "@/lib/sprite/refs";
import { groupRefFiles, composeRefStrip, type RefSetDraft } from "@/lib/sprite/refs-compose";
import { saveRefSet, deleteRefSet, type SpriteRefRow } from "@/app/campaigns/[id]/sprites/actions";

/*
 * 원작 참고 스프라이트 세트 (GM 전용).
 *  - PC 에서 추출한 SD 폴더(`sd-pose-512/<그룹>/<프리팹>/`)를 통째로 올리면 파일 이름으로 역할을 알아내
 *    대기(idle)·피격(dmg)·회피(miss)·방어(gud)·전투불능(dead)·공격(skill1_N → 최대 6칸 띠) 로 묶어 브라우저에서 한 장씩 합친다.
 *  - `sd-render` 의 대기 렌더 PNG 만 올려도 된다(스타일 참고로만 쓰임).
 *  - 생성 때 스타일 참고(대기 그림 n장) + 같은 종류 동작 예시 1장을 입력 이미지로 함께 보낸다.
 */

interface RefSetView { name: string; rows: SpriteRefRow[] }
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "set";

export function RefPanel({ campaignId, refs }: { campaignId: string; refs: SpriteRefRow[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<File[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(refs.length === 0);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const drafts = useMemo<RefSetDraft[]>(() => groupRefFiles(pending), [pending]);
  const sets = useMemo<RefSetView[]>(() => { const m = new Map<string, SpriteRefRow[]>(); for (const r of refs) (m.get(r.set_name) ?? m.set(r.set_name, []).get(r.set_name)!).push(r); return Array.from(m.entries()).map(([name, rows]) => ({ name, rows })); }, [refs]);
  const idleCount = refs.filter((r) => r.role === "idle").length;

  const addFiles = (list: FileList | null) => { if (list?.length) setPending((p) => [...p, ...Array.from(list)]); if (fileRef.current) fileRef.current.value = ""; if (dirRef.current) dirRef.current.value = ""; };
  const nameOf = (d: RefSetDraft) => names[d.name] ?? d.name;

  const upload = async () => {
    if (busy || !drafts.length) return;
    setBusy(true); setErr(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErr("로그인이 필요합니다"); setBusy(false); return; }
    const errs: string[] = [];
    for (const d of drafts) {
      const setName = nameOf(d).trim() || d.name;
      const folder = `${user.id}/refs/${slug(setName)}-${Date.now().toString(36)}`;
      const items: { role: RefRole; frames: number; url: string }[] = [];
      for (const r of d.roles) {
        try {
          setProgress(`${setName} · ${refRoleLabel(r.role)} 합치는 중…`);
          const { blob, frames } = await composeRefStrip(r.role, r.frames);
          setProgress(`${setName} · ${refRoleLabel(r.role)} 올리는 중…`);
          const path = `${folder}/${r.role}.png`;
          const { error } = await supabase.storage.from("sprites").upload(path, blob, { contentType: "image/png", upsert: true });
          if (error) throw new Error(error.message);
          items.push({ role: r.role, frames, url: supabase.storage.from("sprites").getPublicUrl(path).data.publicUrl });
        } catch (e) { errs.push(`${setName}/${refRoleLabel(r.role)}: ${e instanceof Error ? e.message : "실패"}`); }
      }
      if (items.length) { const res = await saveRefSet(campaignId, setName, items); if (res.error) errs.push(`${setName}: ${res.error}`); }
    }
    setPending([]); setNames({}); setProgress(""); setBusy(false);
    if (errs.length) setErr(errs.join(" / "));
    router.refresh();
  };
  const remove = async (name: string) => {
    if (busy || !confirm(`참고 세트 "${name}" 을(를) 지울까요?`)) return;
    setBusy(true); setErr(null);
    const r = await deleteRefSet(campaignId, name);
    if (r.error) setErr(r.error);
    setBusy(false); router.refresh();
  };

  return (
    <Panel title="원작 참고 스프라이트" stamp={sets.length ? `${sets.length}세트 · 대기 ${idleCount}장` : "없음"}
      right={<button type="button" className="text-xs text-muted hover:text-fg" onClick={() => setOpen((o) => !o)}>{open ? "접기" : "펼치기"}</button>}>
      {!open ? (
        <p className="text-xs text-muted">{sets.length ? `생성할 때 대기 그림을 스타일 참고로, 같은 동작의 원작 예시를 동작 참고로 함께 보냅니다. 세트: ${sets.map((s) => s.name).join(", ")}` : "PC 에서 추출한 원작 SD 를 올려 두면 새 NPC 를 그 스타일로 그립니다. 펼쳐서 올리세요."}</p>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-xs text-muted">
            PC 의 <code>extracted\cache\sd-pose-512\&lt;그룹&gt;\&lt;프리팹&gt;</code> 폴더를 통째로 올리면 파일 이름으로 역할을 알아냅니다 — idle → 대기(스타일), dmg → 피격, miss → 회피, gud → 방어, dead → 전투불능, skill1_N → 공격(최대 6칸 띠). 이펙트(<code>_e</code>)·피·이동·skill2/3 은 건너뜁니다.
            <code>sd-render</code> 의 대기 렌더 PNG 만 올려도 됩니다(스타일 참고로만). 원작 그림은 API 에 입력 이미지로만 보내고 결과에 그대로 쓰지 않습니다.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-block cursor-pointer rounded-md border border-border px-3 py-1.5 text-sm hover:bg-fg/5">폴더 올리기
              <input ref={dirRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} /></label>
            <label className="inline-block cursor-pointer rounded-md border border-border px-3 py-1.5 text-sm hover:bg-fg/5">파일 올리기 (여러 장)
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} /></label>
            {pending.length ? <span className="text-xs text-muted">{pending.length}개 파일 · {drafts.length}세트</span> : null}
            <span className="flex-1" />
            {pending.length ? <Button variant="ghost" onClick={() => { setPending([]); setNames({}); }} disabled={busy}>비우기</Button> : null}
            <Button onClick={() => void upload()} disabled={busy || !drafts.length}>{busy ? "작업 중…" : `세트 저장 (${drafts.length})`}</Button>
          </div>
          {progress ? <p className="text-xs text-accent">{progress}</p> : null}
          {err ? <p className="text-xs text-danger">{err}</p> : null}
          {drafts.length ? (
            <ul className="divide-y divide-border border border-border">
              {drafts.map((d) => (
                <li key={d.name} className="grid gap-2 p-2 sm:grid-cols-[14rem_1fr]">
                  <Input value={nameOf(d)} onChange={(e) => setNames((n) => ({ ...n, [d.name]: e.target.value }))} placeholder="세트 이름" disabled={busy} />
                  <div className="flex flex-wrap items-center gap-1 text-xs">
                    {d.roles.map((r) => <span key={r.role} className="rounded-sm bg-fg/10 px-1.5 py-0.5">{refRoleLabel(r.role)} {r.frames.length > 1 ? `${Math.min(r.frames.length, REF_ROLES.find((x) => x.id === r.role)?.maxFrames ?? 1)}칸 (${r.frames.length}프레임)` : ""}{r.frames.some((f) => f.length > 1) ? " · 레이어 겹침" : ""}</span>)}
                    {d.skipped ? <span className="text-muted">건너뜀 {d.skipped}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          {pending.length && !drafts.length ? <p className="text-xs text-danger">쓸 수 있는 파일이 없습니다 (idle/dmg/miss/gud/dead/skill1_N 이름이거나 sd-render PNG 여야 합니다).</p> : null}
          {sets.length ? (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sets.map((s) => { const idle = s.rows.find((r) => r.role === "idle") ?? s.rows[0]!; return (
                <li key={s.name} className="flex gap-2 border border-border p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={idle.url} alt="" className="h-16 w-16 shrink-0 bg-fg/10 object-contain" style={idle.frames > 1 ? { objectPosition: "left" } : undefined} />
                  <div className="min-w-0 flex-1 text-xs">
                    <div className="truncate font-medium" title={s.name}>{s.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1">{REF_ROLES.filter((r) => s.rows.some((x) => x.role === r.id)).map((r) => { const row = s.rows.find((x) => x.role === r.id)!; return <a key={r.id} href={row.url} target="_blank" rel="noreferrer" className="rounded-sm bg-fg/10 px-1 hover:bg-fg/20">{r.label}{row.frames > 1 ? ` ${row.frames}칸` : ""}</a>; })}</div>
                    <button type="button" className="mt-1 text-muted hover:text-danger" disabled={busy} onClick={() => void remove(s.name)}>삭제</button>
                  </div>
                </li>
              ); })}
            </ul>
          ) : null}
          <p className="text-[11px] text-muted">생성 때 스타일 참고 장수는 서버 환경 변수 <code>SPRITE_REF_STYLE_COUNT</code>(기본 2)로 정하고, 동작 예시는 1장입니다. 입력 이미지가 늘면 호출당 비용이 조금 늘어납니다. 대기열 항목마다 참고 세트를 고를 수 있습니다(자동이면 매번 무작위로 섞음).</p>
        </div>
      )}
    </Panel>
  );
}
