import { Button, Input } from "@/components/ui";
import { createScene, setCurrentScene } from "@/app/campaigns/[id]/sessions/[sid]/actions";

export interface SceneRow { id: string; title: string; kind: "drama" | "explore" | "combat"; order_index: number }
const KIND_LABEL = { drama: "드라마", explore: "탐색", combat: "전투" } as const;

export function SceneBar({ campaignId, sessionId, scenes, currentId, isGm, sessionOpen }: {
  campaignId: string; sessionId: string; scenes: SceneRow[]; currentId: string | null; isGm: boolean; sessionOpen: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {scenes.length === 0 ? <span className="text-sm text-muted">장면이 없습니다.</span> : null}
        {scenes.map((s, i) => {
          const active = s.id === currentId;
          const chip = (
            <span className={`inline-flex items-center gap-1 border px-2 py-1 text-xs ${active ? "border-accent text-accent" : "border-border text-muted"}`}>
              <span className="tabular-nums">{i + 1}.</span>{s.title}<span className="opacity-70">· {KIND_LABEL[s.kind]}</span>
            </span>
          );
          return isGm && sessionOpen && !active
            ? <form key={s.id} action={setCurrentScene.bind(null, campaignId, sessionId, s.id)}><button type="submit">{chip}</button></form>
            : <span key={s.id}>{chip}</span>;
        })}
      </div>
      {isGm && sessionOpen ? (
        <form action={createScene.bind(null, campaignId, sessionId)} className="flex flex-wrap gap-2">
          <Input name="title" placeholder="새 장면 제목" className="max-w-xs" />
          <select name="kind" className="rounded-md border border-border bg-elev px-2 text-sm">
            <option value="drama">드라마</option><option value="explore">탐색</option><option value="combat">전투</option>
          </select>
          <Button type="submit" variant="ghost">장면 추가</Button>
        </form>
      ) : null}
    </div>
  );
}
