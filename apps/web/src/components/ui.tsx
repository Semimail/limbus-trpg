import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

/*
 * 공용 조각 (사이트 틀 v2, 2026-11-23): 원작 MainUI 조각(public/assets/limbus/ui/s/)을 9조각으로 쓴다. 스타일은 globals.css 의 .lb-* 규칙.
 *  - Button: primary = 붉은 플레이트, ghost = 검정+청동 버튼, danger = 붉은 테
 */
export function Button({ className = "", variant = "primary", ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const v = variant === "primary" ? "lb-btn-primary" : variant === "danger" ? "lb-btn-danger" : "lb-btn-ghost";
  return <button className={`lb-btn ${v} ${className}`} {...p} />;
}

export function Input({ className = "", ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`lb-input ${className}`} {...p} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`lb-card p-4 ${className}`}>{children}</div>;
}

export function PageTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="lb-title">{children}</h1>
        <div className="lb-title-bar w-48" />
      </div>
      {right}
    </div>
  );
}
