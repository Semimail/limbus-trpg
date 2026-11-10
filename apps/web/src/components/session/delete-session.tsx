"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";

export function DeleteSession({ title, action }: { title: string; action: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  if (!open) return <Button variant="danger" className="text-xs" onClick={() => setOpen(true)}>세션 삭제</Button>;
  return (
    <span className="flex items-center gap-2 border border-danger/50 bg-danger/5 px-2 py-1 text-xs">
      <span>&quot;{title}&quot;의 채팅·전투 기록이 모두 지워집니다. 먼저 내보내기를 하셨나요?</span>
      <Button variant="danger" className="px-2 py-0.5 text-xs" disabled={pending} onClick={() => start(() => action())}>{pending ? "삭제 중..." : "삭제"}</Button>
      <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => setOpen(false)}>취소</Button>
    </span>
  );
}
