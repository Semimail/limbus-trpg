import type { ReactNode } from "react";
import { KeywordText } from "@/components/keyword/keyword";

/** 작은 마크다운 렌더러: 제목, 문단, 목록, 표, 굵게, 인라인 코드, 인용. 텍스트는 키워드 자동 연결. */
export function renderMarkdown(md: string): ReactNode[] {
  const lines = md.replace(/\r/g, "").split("\n");
  const out: ReactNode[] = [];
  let i = 0, key = 0;
  const inline = (t: string): ReactNode => {
    const parts: ReactNode[] = [];
    const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
    let last = 0;
    for (const m of t.matchAll(re)) {
      const idx = m.index ?? 0;
      if (idx > last) parts.push(<KeywordText key={key++} text={t.slice(last, idx)} />);
      const tok = m[0];
      if (tok.startsWith("**")) parts.push(<b key={key++}><KeywordText text={tok.slice(2, -2)} /></b>);
      else parts.push(<code key={key++} className="rounded bg-fg/10 px-1 text-[0.9em]">{tok.slice(1, -1)}</code>);
      last = idx + tok.length;
    }
    if (last < t.length) parts.push(<KeywordText key={key++} text={t.slice(last)} />);
    return parts;
  };
  while (i < lines.length) {
    const l = lines[i]!;
    if (!l.trim()) { i++; continue; }
    const h = l.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lvl = h[1]!.length; const text = h[2]!;
      const id = text.replace(/[^\w가-힣]+/g, "-").replace(/^-|-$/g, "");
      const cls = lvl === 1 ? "mt-2 text-2xl font-bold" : lvl === 2 ? "mt-8 border-b border-border pb-1 text-xl font-semibold" : lvl === 3 ? "mt-5 text-base font-semibold" : "mt-3 text-sm font-semibold";
      out.push(lvl === 1 ? <h1 key={key++} id={id} className={cls}>{inline(text)}</h1> : lvl === 2 ? <h2 key={key++} id={id} className={cls}>{inline(text)}</h2> : lvl === 3 ? <h3 key={key++} id={id} className={cls}>{inline(text)}</h3> : <h4 key={key++} id={id} className={cls}>{inline(text)}</h4>);
      i++; continue;
    }
    if (l.startsWith(">")) {
      const buf: string[] = []; while (i < lines.length && lines[i]!.startsWith(">")) { buf.push(lines[i]!.replace(/^>\s?/, "")); i++; }
      out.push(<blockquote key={key++} className="my-2 border-l-2 border-gold/60 bg-gold/5 px-3 py-2 text-sm text-muted">{buf.map((b, j) => <p key={j}>{inline(b)}</p>)}</blockquote>); continue;
    }
    if (l.startsWith("|")) {
      const rows: string[][] = []; while (i < lines.length && lines[i]!.startsWith("|")) { rows.push(lines[i]!.split("|").slice(1, -1).map((c) => c.trim())); i++; }
      const body = rows.filter((r) => !r.every((c) => /^:?-+:?$/.test(c)));
      const [head, ...rest] = body;
      out.push(<div key={key++} className="my-2 overflow-x-auto"><table className="w-full border-collapse text-sm"><thead><tr>{head!.map((c, j) => <th key={j} className="border border-border bg-fg/5 px-2 py-1 text-left font-semibold">{inline(c)}</th>)}</tr></thead>
        <tbody>{rest.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j} className="border border-border px-2 py-1 align-top">{inline(c)}</td>)}</tr>)}</tbody></table></div>); continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const items: { depth: number; text: string; ordered: boolean }[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i]!)) { const m = lines[i]!.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/)!; items.push({ depth: Math.floor(m[1]!.length / 2), text: m[3]!, ordered: /\d/.test(m[2]!) }); i++; }
      const ordered = items[0]!.ordered;
      const Tag = ordered ? "ol" : "ul";
      out.push(<Tag key={key++} className={`my-2 space-y-1 pl-5 text-sm ${ordered ? "list-decimal" : "list-disc"}`}>{items.map((it, j) => <li key={j} style={{ marginLeft: it.depth * 16 }}>{inline(it.text)}</li>)}</Tag>); continue;
    }
    const buf: string[] = []; while (i < lines.length && lines[i]!.trim() && !/^(#{1,4}\s|>|\||\s*([-*]|\d+\.)\s)/.test(lines[i]!)) { buf.push(lines[i]!); i++; }
    out.push(<p key={key++} className="my-2 text-sm leading-relaxed">{inline(buf.join(" "))}</p>);
  }
  return out;
}
