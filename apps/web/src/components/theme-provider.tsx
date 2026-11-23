"use client";
import { ThemeProvider as NextThemes } from "next-themes";
import type { ReactNode } from "react";

/** 사이트 틀 v2: 항상 어두운 림버스 팔레트 (라이트 테마 없음). next-themes 는 .dark 클래스만 고정해 둔다 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemes attribute="class" forcedTheme="dark" enableSystem={false} disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
