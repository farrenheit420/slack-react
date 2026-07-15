import { bearerFromHeader, hashToken } from "./crypto";
import { getSupabase, SlackConnection } from "./supabase";

export async function getConnectionFromRequest(
  request: Request
): Promise<SlackConnection | null> {
  const token =
    bearerFromHeader(request.headers.get("authorization")) ||
    new URL(request.url).searchParams.get("session");
  if (!token) return null;

  return getConnectionFromSessionToken(token);
}

export async function getConnectionFromSessionToken(
  token: string
): Promise<SlackConnection | null> {
  const supabase = getSupabase();
  const tokenHash = hashToken(token);
  const { data, error } = await supabase
    .from("slack_connections")
    .select("team_id, team_name, access_token, session_token_hash, tier")
    .eq("session_token_hash", tokenHash)
    .maybeSingle();

  if (error || !data) return null;
  return data as SlackConnection;
}

export async function upsertConnection(input: {
  teamId: string;
  teamName: string;
  accessToken: string;
  sessionTokenHash: string;
}): Promise<void> {
  const supabase = getSupabase();

  // Preserve existing tier on reconnect; default new workspaces to free.
  const { data: existing } = await supabase
    .from("slack_connections")
    .select("tier")
    .eq("team_id", input.teamId)
    .maybeSingle();

  const { error } = await supabase.from("slack_connections").upsert(
    {
      team_id: input.teamId,
      team_name: input.teamName,
      access_token: input.accessToken,
      session_token_hash: input.sessionTokenHash,
      tier: existing?.tier === "pro" ? "pro" : "free",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "team_id" }
  );

  if (error) {
    throw new Error(`Failed to save connection: ${error.message}`);
  }
}
