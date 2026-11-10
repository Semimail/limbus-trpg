"use server";
import { revalidatePath } from "next/cache";
import { createClient, getUser } from "@/lib/supabase/server";
import { rollDice } from "@/lib/dice";
import { DEFAULT_RULES, judge, type CharacterData } from "@limbus/rules";
import { createRng } from "@limbus/rules";

export type MessageKind = "ic" | "ooc" | "gm" | "system" | "whisper";

export interface SendInput {
  sessionId: string;
  sceneId: string | null;
  kind: MessageKind;
  content: string;
  characterId?: string | null;
  toUserId?: string | null;
  imageUrl?: string | null;
}

/**
 * 메시지 전송. 명령어:
 *  /r 2d6+3        주사위
 *  /coin 3 [난이도]  코인 판정 (선택한 캐릭터의 정신력 적용, 없으면 0)
 *  /w 이름 내용     귓속말은 UI에서 kind=whisper로 처리
 */
export async function sendMessage(input: SendInput): Promise<{ error?: string; message?: Record<string, unknown> }> {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return { error: "로그인이 필요합니다" };
  const content = input.content.trim();
  if (!content && !input.imageUrl) return { error: "내용이 없습니다" };

  let kind = input.kind;
  let payload: Record<string, unknown> | null = input.imageUrl ? { image: input.imageUrl } : null;
  let text = content;

  // 명령어 처리 → 시스템 메시지
  const cmd = content.match(/^\/(r|roll)\s+(.+)$/i);
  const coin = content.match(/^\/coin\s+(\d+)(?:\s+(\d+))?$/i);
  if (cmd) {
    const r = rollDice(cmd[2]!);
    if (!r) return { error: "주사위 식을 읽을 수 없습니다. 예: /r 2d6+3" };
    kind = "system";
    payload = { type: "dice", ...r };
    text = `${r.expr} = [${r.rolls.join(", ")}]${r.mod ? (r.mod > 0 ? ` + ${r.mod}` : ` - ${-r.mod}`) : ""} = ${r.total}`;
  } else if (coin) {
    const n = Math.min(30, Math.max(0, Number(coin[1])));
    const difficulty = coin[2] ? Number(coin[2]) : 0;
    let sanity = 0;
    if (input.characterId) {
      const { data: ch } = await supabase.from("characters").select("data").eq("id", input.characterId).single();
      sanity = (ch?.data as unknown as CharacterData | null)?.sanity ?? 0;
    }
    const j = judge(n, 0, difficulty, sanity, DEFAULT_RULES, createRng((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0));
    kind = "system";
    payload = { type: "coin", coins: j.coins, heads: j.heads, difficulty, sanity, success: difficulty > 0 ? j.success : null };
    text = `코인 ${n}개 (정신력 ${sanity >= 0 ? "+" : ""}${sanity}) → 앞면 ${j.heads}` + (difficulty > 0 ? ` / 난이도 ${difficulty} → ${j.success ? "성공" : "실패"}` : "");
  }

  const { data: row, error } = await supabase.from("messages").insert({
    session_id: input.sessionId,
    scene_id: input.sceneId,
    author_id: user.id,
    character_id: kind === "ic" || kind === "system" ? input.characterId ?? null : null,
    kind,
    to_user_id: kind === "whisper" ? input.toUserId ?? null : null,
    content: text,
    payload: payload as never,
  }).select("id, kind, content, created_at, author_id, character_id, to_user_id, payload").single();
  if (error) return { error: error.message };
  return { message: row as unknown as Record<string, unknown> };
}

export async function createScene(campaignId: string, sessionId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim() || "새 장면";
  const kind = (String(formData.get("kind") ?? "drama") as "drama" | "explore" | "combat");
  const supabase = await createClient();
  const { count } = await supabase.from("scenes").select("id", { count: "exact", head: true }).eq("session_id", sessionId);
  const { data, error } = await supabase.from("scenes").insert({ session_id: sessionId, title, kind, order_index: count ?? 0 }).select("id").single();
  if (error) throw new Error(error.message);
  await supabase.from("sessions").update({ current_scene_id: data.id }).eq("id", sessionId);
  await supabase.from("messages").insert({ session_id: sessionId, scene_id: data.id, kind: "system", content: `── 장면: ${title} ──`, payload: { type: "scene", sceneId: data.id } as never });
  revalidatePath(`/campaigns/${campaignId}/sessions/${sessionId}`);
}

export async function setCurrentScene(campaignId: string, sessionId: string, sceneId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("sessions").update({ current_scene_id: sceneId }).eq("id", sessionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/campaigns/${campaignId}/sessions/${sessionId}`);
}
