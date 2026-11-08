import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Button({ className = "", variant = "primary", ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const base = "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition disabled:opacity-50";
  const v = variant === "primary" ? "bg-accent text-accent-fg hover:opacity-90"
    : variant === "danger" ? "border border-danger text-danger hover:bg-danger/10"
    : "border border-border text-fg hover:bg-fg/5";
  return <button className={`${base} ${v} ${className}`} {...p} />;
}

export function Input({ className = "", ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`w-full rounded-md border border-border bg-elev px-3 py-2 text-sm outline-none focus:border-accent ${className}`} {...p} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-border bg-elev p-4 ${className}`}>{children}</div>;
}

export function PageTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <h1 className="text-xl font-semibold tracking-tight">{children}</h1>
      {right}
    </div>
  );
}
