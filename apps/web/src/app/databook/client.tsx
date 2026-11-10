"use client";
import { useMemo, useState } from "react";
import { GLOSSARY, type GlossaryCategory } from "@limbus/rules";
import { KeywordText } from "@/components/keyword/keyword";
import { Input } from "@/components/ui";

const ORDER: GlossaryCategory[] = ["기본", "상태이상", "피해 유형", "방어", "죄악", "자원", "성장", "진행"];

export function DatabookClient() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<GlossaryCategory | "전체">("전체");
  const list = useMemo(() => GLOSSARY.filter((g) => (cat === "전체" || g.category === cat) && (!q.trim() || [g.term, ...(g.aliases ?? []), g.short, g.long].some((t) => t.includes(q.trim())))), [q, cat]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><div className="stamp">DATABOOK</div><h1 className="mt-1 text-2xl font-bold">데이터북</h1><p className="text-sm text-muted">키워드 설명. 화면 어디서든 금색 점선 단어를 누르면 같은 설명이 뜹니다.</p></div>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="검색 (예: 출혈, 정신력)" className="max-w-xs" />
      </div>
      <div className="flex flex-wrap gap-1 text-xs">
        {(["전체", ...ORDER] as const).map((c) => (
          <button key={c} type="button" onClick={() => setCat(c)} className={`border px-2 py-1 ${cat === c ? "border-accent text-accent" : "border-border text-muted hover:text-fg"}`}>{c}</button>
        ))}
      </div>
      {ORDER.filter((c) => list.some((g) => g.category === c)).map((c) => (
        <section key={c}>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><span className="stamp">{c}</span></h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {list.filter((g) => g.category === c).map((g) => (
              <article key={g.id} id={g.id} className="panel p-3">
                <div className="flex items-center gap-2">
                  {g.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/assets/limbus/${g.icon}.png`} alt="" width={24} height={24} />
                  ) : null}
                  <h3 className="font-semibold">{g.term}</h3>
                  {g.aliases?.length ? <span className="text-[11px] text-muted">{g.aliases.join(" · ")}</span> : null}
                </div>
                <p className="mt-1 text-sm">{g.short}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted"><KeywordText text={g.long} /></p>
              </article>
            ))}
          </div>
        </section>
      ))}
      {list.length === 0 ? <p className="text-sm text-muted">검색 결과가 없습니다.</p> : null}
    </div>
  );
}
