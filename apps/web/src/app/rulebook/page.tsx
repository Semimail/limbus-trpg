import fs from "node:fs";
import path from "node:path";
import { renderMarkdown } from "@/lib/markdown";

export const metadata = { title: "룰북 · 림버스 TRPG" };

function loadRulebook(): string {
  const candidates = [path.join(process.cwd(), "docs/rulebook.md"), path.join(process.cwd(), "../../docs/rulebook.md"), path.join(process.cwd(), "apps/web/public/rulebook.md"), path.join(process.cwd(), "public/rulebook.md")];
  for (const c of candidates) { try { return fs.readFileSync(c, "utf-8"); } catch { /* 다음 후보 */ } }
  return "# 룰북\n\n룰북 파일을 찾지 못했습니다.";
}

export default function RulebookPage() {
  const md = loadRulebook();
  const headings = [...md.matchAll(/^##\s+(.*)$/gm)].map((m) => m[1]!);
  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
      <nav className="hidden lg:block">
        <div className="sticky top-4 space-y-1 text-xs">
          <div className="stamp">목차</div>
          {headings.map((h) => <a key={h} href={`#${h.replace(/[^\w가-힣]+/g, "-").replace(/^-|-$/g, "")}`} className="block text-muted hover:text-fg">{h}</a>)}
        </div>
      </nav>
      <article className="min-w-0">{renderMarkdown(md)}</article>
    </div>
  );
}
