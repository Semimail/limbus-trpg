import { NextResponse } from "next/server";
import { createClient, getUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** 세션 전체를 JSON으로 내보낸다. GM만. */
export async function GET(_req: Request, ctx: { params: Promise<{ sid: string }> }) {
  const { sid } = await ctx.params;
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: session } = await supabase.from("sessions").select("*").eq("id", sid).single();
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { data: me } = await supabase.from("campaign_members").select("role").eq("campaign_id", session.campaign_id).eq("user_id", user.id).maybeSingle();
  if (!me || (me.role !== "gm" && me.role !== "temp_gm")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [{ data: campaign }, { data: members }, { data: scenes }, { data: messages }, { data: combats }, { data: characters }, { data: enemies }] = await Promise.all([
    supabase.from("campaigns").select("id, name, notice").eq("id", session.campaign_id).single(),
    supabase.from("campaign_members").select("user_id, role, profiles(username, avatar_url)").eq("campaign_id", session.campaign_id),
    supabase.from("scenes").select("*").eq("session_id", sid).order("order_index"),
    supabase.from("messages").select("*").eq("session_id", sid).order("id"),
    supabase.from("combats").select("*").eq("session_id", sid).order("created_at"),
    supabase.from("characters").select("id, name, owner_id, portrait_url, data, approved").eq("campaign_id", session.campaign_id),
    supabase.from("enemies").select("id, name, portrait_url, data").eq("campaign_id", session.campaign_id),
  ]);
  const combatIds = (combats ?? []).map((c) => c.id);
  const { data: events } = combatIds.length
    ? await supabase.from("combat_events").select("combat_id, seq, event, created_at").in("combat_id", combatIds).order("seq")
    : { data: [] as { combat_id: string; seq: number; event: unknown; created_at: string }[] };

  const out = {
    format: "limbus-trpg-replay", version: 1, exportedAt: new Date().toISOString(),
    campaign, session,
    members: (members ?? []).map((m) => { const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles; return { user_id: m.user_id, role: m.role, username: p?.username ?? "", avatar_url: p?.avatar_url ?? null }; }),
    scenes: scenes ?? [], messages: messages ?? [],
    combats: (combats ?? []).map((c) => ({ ...c, events: (events ?? []).filter((e) => e.combat_id === c.id).map((e) => ({ seq: e.seq, created_at: e.created_at, ...(e.event as object) })) })),
    characters: characters ?? [], enemies: enemies ?? [],
  };
  const safe = (session.title || "session").replace(/[^\w가-힣\-]+/g, "_");
  const date = new Date(session.started_at).toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(out, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`limbus_${date}_${safe}.json`)}` },
  });
}
