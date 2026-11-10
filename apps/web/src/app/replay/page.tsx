"use client";
import { useState } from "react";
import { ReplayViewer, type ReplayFile } from "@/components/replay/viewer";

export default function ReplayPage() {
  const [data, setData] = useState<ReplayFile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = async (file: File) => {
    try {
      const json = JSON.parse(await file.text()) as ReplayFile;
      if (json.format !== "limbus-trpg-replay") throw new Error("림버스 TRPG 리플레이 파일이 아닙니다");
      setData(json); setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "파일을 읽을 수 없습니다"); }
  };
  if (data) return <ReplayViewer data={data} />;
  return (
    <div className="mx-auto mt-12 max-w-md space-y-4 text-center">
      <div className="stamp">리플레이</div>
      <h1 className="text-2xl font-bold">세션 기록 재생</h1>
      <p className="text-sm text-muted">GM이 내보낸 JSON 파일을 열면 채팅과 전투를 시간순으로 다시 볼 수 있습니다. 파일은 이 브라우저 안에서만 읽히고 서버로 보내지지 않습니다.</p>
      <label className="inline-block cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg">
        파일 선택
        <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); }} />
      </label>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void load(f); }}
        className="rounded-md border border-dashed border-border p-8 text-xs text-muted">여기에 파일을 끌어다 놓아도 됩니다</div>
      {err ? <p className="text-sm text-danger">{err}</p> : null}
    </div>
  );
}
