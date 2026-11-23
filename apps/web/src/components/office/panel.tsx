import type { ReactNode } from "react";

/** 사무소 패널: 원작 검정+청동 틀(globals.css .panel) + 갈색 머리띠. stamp 는 흰 사선 플레이트에 Bebas */
export function Panel({ title, stamp, children, className = "", right }: {
  title: string; stamp?: string; children: ReactNode; className?: string; right?: ReactNode;
}) {
  return (
    <section className={`panel p-4 ${className}`}>
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 tracking-wide">
          {stamp ? <span className="stamp">{stamp}</span> : null}
          {title}
        </h2>
        {right}
      </header>
      {children}
    </section>
  );
}
