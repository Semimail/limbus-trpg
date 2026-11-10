"use server";
import { revalidatePath } from "next/cache";
import { createClient, getUser } from "@/lib/supabase/server";
import { rollDice } from "@/lib/dice";
import { judge, judgeOpposed, createRng, SINS, SIN_LABEL, type CharacterData, type Sin } from "@limbus/rules";
import { getCampaignRules } from "@/lib/rules";

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
  const coin = content.match(/^\/coin\s+(\d+|분노|색욕|나태|탐식|우울|오만|질투)(?:\s+(\d+))?(?:\s+\+(\d+))?(\s+빛)?$/i);
  const vs = content.match(/^\/vs\s+(분노|색욕|나태|탐식|우울|오만|질투|\d+)\s+(\S+)\s+(분노|색욕|나태|탐식|우울|오만|질투|\d+)$/i);
  const sinOf = (w: string): Sin | null => (SINS.find((k) => SIN_LABEL[k] === w) ?? null);
  const { data: sessionRow } = await supabase.from("sessions").select("campaign_id").eq("id", input.sessionId).single();
  const campaignId = sessionRow?.campaign_id ?? "";
  const { rules } = await getCampaignRules(campaignId);
  if (cmd) {
    const r = rollDice(cmd[2]!);
    if (!r) return { error: "주사위 식을 읽을 수 없습니다. 예: /r 2d6+3" };
    kind = "system";
    payload = { type: "dice", ...r };
    text = `${r.expr} = [${r.rolls.join(", ")}]${r.mod ? (r.mod > 0 ? ` + ${r.mod}` : ` - ${-r.mod}`) : ""} = ${r.total}`;
  } else if (coin) {
    // /coin <수|능력치> [난이도] [+보너스] [빛]
    let ch: CharacterData | null = null;
    if (input.characterId) {
      const { data } = await supabase.from("characters").select("data").eq("id", input.characterId).single();
      ch = (data?.data as unknown as CharacterData | null) ?? null;
    }
    const statSin = sinOf(coin[1]!);
    const n = Math.min(30, Math.max(0, statSin ? (ch?.stats[statSin] ?? 0) : Number(coin[1])));
    const difficulty = coin[2] ? Number(coin[2]) : 0;
    let bonus = coin[3] ? Number(coin[3]) : 0;
    let lightNote = "";
    if (coin[4]) {
      if (!ch || !input.characterId) return { error: "빛을 쓰려면 캐릭터를 선택하세요" };
      if ((ch.light ?? 0) < 1) return { error: "빛이 없습니다" };
      bonus += 1; lightNote = " +빛";
      await supabase.from("characters").update({ data: JSON.parse(JSON.stringify({ ...ch, light: ch.light - 1 })) }).eq("id", input.characterId);
    }
    const sanity = ch?.sanity ?? 0;
    const j = judge(n, bonus, difficulty, sanity, rules, createRng((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0));
    kind = "system";
    payload = { type: "coin", coins: j.coins, heads: j.heads, difficulty, sanity, success: difficulty > 0 ? j.success : null };
    const label = statSin ? `${SIN_LABEL[statSin]} ${n}` : `코인 ${n}개`;
    text = `${label}${bonus ? ` +${bonus}${lightNote}` : ""} (정신력 ${sanity >= 0 ? "+" : ""}${sanity}) → 앞면 ${j.heads}` + (difficulty > 0 ? ` / 난이도 ${difficulty} → ${j.success ? "성공" : "실패"}` : "");
  } else if (vs) {
    // /vs <내 능력치|수> <상대 캐릭터 이름> <상대 능력치|수>  — 대립 판정, 동률은 방어(상대) 승
    let me: CharacterData | null = null;
    if (input.characterId) { const { data } = await supabase.from("characters").select("data").eq("id", input.characterId).single(); me = (data?.data as unknown as CharacterData | null) ?? null; }
    const { data: opp } = await supabase.from("characters").select("name, data").eq("campaign_id", campaignId).ilike("name", vs[2]!).maybeSingle();
    const mySin = sinOf(vs[1]!), opSin = sinOf(vs[3]!);
    const myStat = mySin ? (me?.stats[mySin] ?? 0) : Number(vs[1]);
    const opData = opp?.data as unknown as CharacterData | null;
    const opStat = opSin ? (opData?.stats[opSin] ?? 0) : Number(vs[3]);
    if (opSin && !opp) return { error: `상대 캐릭터 "${vs[2]}"를 찾지 못했습니다` };
    const r = judgeOpposed({ stat: myStat, bonus: 0, sanity: me?.sanity ?? 0 }, { stat: opStat, bonus: 0, sanity: opData?.sanity ?? 0 }, rules, createRng((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0));
    kind = "system";
    payload = { type: "vs", attacker: r.attacker, defender: r.defender, winner: r.winner };
    text = `대립 판정: ${mySin ? SIN_LABEL[mySin] : "코인"} ${myStat} → 앞면 ${r.attacker.heads}  vs  ${opp?.name ?? vs[2]} ${opSin ? SIN_LABEL[opSin] : "코인"} ${opStat} → 앞면 ${r.defender.heads}  ⇒ ${r.winner === "attacker" ? "공격 측 승리" : "방어 측 승리"}`;
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

export async function deleteMessage(sessionId: string, messageId: number): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("messages").delete().eq("id", messageId).eq("session_id", sessionId);
  return error ? { error: error.message } : {};
}
