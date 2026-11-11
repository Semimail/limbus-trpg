"use client";
import { useState } from "react";
import { Chat, type ChatMessage, type Member, type MyChar } from "./chat";
import { Stage, type StageActor } from "./stage";
import { SceneBoard, type TokenSource } from "@/components/board/scene-board";
import type { BoardData } from "@/app/campaigns/[id]/sessions/[sid]/actions";
import { Panel } from "@/components/office/panel";

interface Props {
  campaignId: string; sessionId: string; sceneId: string | null; sceneTitle: string | null; sceneKind: string | null;
  meId: string; isGm: boolean; members: Member[]; myChars: MyChar[]; charNames: Record<string, string>;
  initialMessages: ChatMessage[]; sessionOpen: boolean;
  actors: StageActor[]; board: BoardData; tokenSources: TokenSource[];
}

/** 비전투 장면: 무대(스탠딩+대사) / 지도(토큰) 전환 + 채팅. 채팅 메시지를 무대와 공유한다 */
export function SessionLive(p: Props) {
  const [msgs, setMsgs] = useState<ChatMessage[]>(p.initialMessages);
  const [mode, setMode] = useState<"stage" | "map">("stage");
  const gmNames = Object.fromEntries(p.members.map((m) => [m.user_id, m.username]));
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="order-last space-y-3 lg:order-none lg:col-span-2">
        <Panel title={p.sceneTitle ?? "장면"} stamp={p.sceneKind === "explore" ? "탐색" : "드라마"}
          right={<div className="flex gap-1 text-xs">
            <button type="button" onClick={() => setMode("stage")} className={`border px-2 py-0.5 ${mode === "stage" ? "border-accent text-accent" : "border-border text-muted"}`}>무대</button>
            <button type="button" onClick={() => setMode("map")} className={`border px-2 py-0.5 ${mode === "map" ? "border-accent text-accent" : "border-border text-muted"}`}>지도</button>
          </div>}>
          {!p.sceneId ? <p className="text-sm text-muted">장면을 추가하면 무대가 나타납니다.</p>
            : mode === "stage" ? <Stage background={p.board.background} actors={p.actors} messages={msgs} gmNames={gmNames} />
            : <SceneBoard key={p.sceneId} campaignId={p.campaignId} sceneId={p.sceneId} initial={p.board} isGm={p.isGm} meId={p.meId} sources={p.tokenSources} readOnly={!p.sessionOpen} />}
        </Panel>
      </div>
      <Panel title="채팅" className="order-first lg:order-none lg:sticky lg:top-4">
        <Chat sessionId={p.sessionId} sceneId={p.sceneId} meId={p.meId} isGm={p.isGm} members={p.members} myChars={p.myChars}
          charNames={p.charNames} initial={p.initialMessages} sessionOpen={p.sessionOpen} onMessages={setMsgs} />
      </Panel>
    </div>
  );
}
