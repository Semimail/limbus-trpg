"use client";
import { Fragment, useMemo, type ReactNode } from "react";
import { GLOSSARY_BY_ID, GLOSSARY_TERMS } from "@limbus/rules";
import { useKeyword } from "./provider";

/** 눌러서 설명을 여는 키워드 */
export function Keyword({ id, children, className = "" }: { id: string; children?: ReactNode; className?: string }) {
  const { open } = useKeyword();
  const e = GLOSSARY_BY_ID[id];
  if (!e) return <>{children}</>;
  return (
    <span role="button" tabIndex={0} onClick={(ev) => { ev.stopPropagation(); open(id, ev.currentTarget); }}
      onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); open(id, ev.currentTarget); } }}
      className={`cursor-help border-b border-dotted border-gold/70 text-gold hover:border-solid ${className}`}>
      {children ?? e.term}
    </span>
  );
}

const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// 한 글자 키워드(합, 빛, 덱)는 단어 안에서 오탐이 많으므로 앞이 한글이 아니고 뒤가 조사·띄어쓰기·문장부호일 때만 잡는다
const PARTICLE = "을를이가은는에의과와도로만서";
const SHORT = GLOSSARY_TERMS.filter((t) => t.term.length === 1).map((t) => esc(t.term));
const LONG = GLOSSARY_TERMS.filter((t) => t.term.length > 1).map((t) => esc(t.term));
const PATTERN = new RegExp(
  `(${LONG.join("|")})` + (SHORT.length ? `|(?<![가-힣])(${SHORT.join("|")})(?=$|[\\s.,!?()\\[\\]:;/·→%]|(?:에서|으로|까지|부터|에게|[${PARTICLE}])(?![가-힣]))` : ""),
  "g",
);

/** 문자열 안의 키워드를 자동으로 눌러볼 수 있게 감싼다 */
export function KeywordText({ text, className }: { text: string; className?: string }) {
  const parts = useMemo(() => {
    const out: { t: string; id?: string }[] = [];
    let last = 0;
    for (const m of text.matchAll(PATTERN)) {
      const i = m.index ?? 0;
      if (i > last) out.push({ t: text.slice(last, i) });
      const hit = GLOSSARY_TERMS.find((x) => x.term === m[0]);
      out.push({ t: m[0], id: hit?.entry.id });
      last = i + m[0].length;
    }
    if (last < text.length) out.push({ t: text.slice(last) });
    return out;
  }, [text]);
  return <span className={className}>{parts.map((p, i) => p.id ? <Keyword key={i} id={p.id}>{p.t}</Keyword> : <Fragment key={i}>{p.t}</Fragment>)}</span>;
}
