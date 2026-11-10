import type { ReactNode } from "react";

export function Panel({ title, stamp, children, className = "", right }: {
  title: string; stamp?: string; children: ReactNode; className?: string; right?: ReactNode;
}) {
  return (
    <section className={`panel p-4 ${className}`}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide">
          {stamp ? <span className="stamp">{stamp}</span> : null}
          {title}
        </h2>
        {right}
      </header>
      {children}
    </section>
  );
}
