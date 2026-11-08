"use client";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // 서버 렌더 시에는 테마를 알 수 없으므로 마운트 전까지 자리만 차지한다.
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  if (!mounted) return <span className="inline-block w-16" />;
  const dark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="rounded-md border border-border px-2 py-1 text-sm text-muted hover:text-fg"
      aria-label="테마 전환"
    >
      {dark ? "라이트" : "다크"}
    </button>
  );
}
