import Link from "next/link";

export interface CharacterSummary {
  id: string; name: string; portrait_url: string | null; approved: boolean;
  data: Record<string, unknown>;
}

const GRADE = ["뜬소문", "도시괴담", "도시전설", "도시의 악몽", "도시의 재앙", "별", "불순물"];

function num(v: unknown, d: number) { return typeof v === "number" ? v : d; }

export function CharacterCard({ c }: { c: CharacterSummary }) {
  const level = num(c.data.level, 1);
  const grade = GRADE[Math.min(6, Math.floor((level - 1) / 7))];
  const maxHp = num(c.data.maxHp, 100), hp = num(c.data.hp, maxHp);
  const sanity = num(c.data.sanity, 0);
  const light = num(c.data.light, 3);
  const sync = num(c.data.sync, 1);
  return (
    <Link href={`/characters/${c.id}`} className="panel block p-3 hover:border-accent">
      <div className="flex gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden bg-fg/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {c.portrait_url ? <img src={c.portrait_url} alt="" className="h-full w-full object-cover" /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate font-medium">{c.name}</div>
            {!c.approved ? <span className="text-[11px] text-muted">승인 대기</span> : null}
          </div>
          <div className="mt-0.5 text-xs text-muted">{grade} · Lv.{level} · 동기화 {sync}</div>
          <div className="mt-2 space-y-1">
            <Bar label="체력" value={hp} max={maxHp} color="bg-danger" />
            <Bar label="정신력" value={sanity + 45} max={90} color="bg-gold" text={`${sanity > 0 ? "+" : ""}${sanity}`} />
          </div>
          <div className="mt-1 text-[11px] text-muted">빛 {light}</div>
        </div>
      </div>
    </Link>
  );
}

function Bar({ label, value, max, color, text }: { label: string; value: number; max: number; color: string; text?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-9 shrink-0 text-muted">{label}</span>
      <div className="h-1.5 flex-1 bg-fg/10"><div className={`h-full ${color}`} style={{ width: `${pct}%` }} /></div>
      <span className="w-14 shrink-0 text-right tabular-nums">{text ?? `${value}/${max}`}</span>
    </div>
  );
}
