"use client";
import { useState, useTransition } from "react";
import { deleteCampaign } from "@/app/campaigns/actions";
import { Button, Input } from "@/components/ui";

export function DeleteCampaign({ campaignId, name }: { campaignId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  if (!open) return <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => setOpen(true)}>캠페인 삭제</Button>;
  return (
    <div className="space-y-2 border border-danger/50 bg-danger/5 p-3 text-sm">
      <p>세션, 장면, 채팅 기록, 전투 로그, 적 도감, 초대 코드가 모두 삭제됩니다. 캐릭터는 남지만 캠페인에서 빠집니다. 되돌릴 수 없습니다.</p>
      <p className="text-xs text-muted">확인을 위해 캠페인 이름 <b>{name}</b> 을 입력하세요.</p>
      <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={name} />
      <div className="flex gap-2">
        <Button variant="danger" disabled={typed !== name || pending} onClick={() => start(() => deleteCampaign(campaignId))}>
          {pending ? "삭제 중..." : "영구 삭제"}
        </Button>
        <Button variant="ghost" onClick={() => { setOpen(false); setTyped(""); }}>취소</Button>
      </div>
    </div>
  );
}
