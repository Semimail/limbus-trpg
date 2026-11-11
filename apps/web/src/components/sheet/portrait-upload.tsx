"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function PortraitUpload({ value, onChange, disabled, label = "초상화", size = "h-28 w-28", hint = "정사각형에 가까운 이미지를 권장합니다" }: { value: string | null; onChange: (url: string | null) => void; disabled?: boolean; label?: string; size?: string; hint?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const upload = async (file: File) => {
    setBusy(true); setErr(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("로그인이 필요합니다");
      if (file.size > 5 * 1024 * 1024) throw new Error("5MB 이하 이미지만 가능합니다");
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("portraits").upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("portraits").getPublicUrl(path);
      onChange(data.publicUrl);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "업로드 실패");
    } finally { setBusy(false); }
  };

  return (
    <div className="flex items-start gap-3">
      <div className={`${size} shrink-0 overflow-hidden border border-border bg-fg/10`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-muted">{label}</div>}
      </div>
      {!disabled ? (
        <div className="text-sm">
          <label className="inline-block cursor-pointer rounded-md border border-border px-3 py-1.5 hover:bg-fg/5">
            {busy ? "업로드 중..." : "이미지 선택"}
            <input type="file" accept="image/*" className="hidden" disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
          </label>
          {value ? <button type="button" onClick={() => onChange(null)} className="ml-2 text-xs text-muted hover:text-fg">제거</button> : null}
          {err ? <p className="mt-1 text-xs text-danger">{err}</p> : null}
          <p className="mt-1 text-xs text-muted">{hint}</p>
        </div>
      ) : null}
    </div>
  );
}
