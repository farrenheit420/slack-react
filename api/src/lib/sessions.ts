import { randomToken } from "./crypto";
import { getSupabase } from "./supabase";

const OAUTH_TTL_MS = 10 * 60 * 1000;

export type OAuthPayload = {
  teamId: string;
  teamName: string;
  sessionToken: string;
};

export async function createOAuthPending(): Promise<{
  readKey: string;
  writeKey: string;
}> {
  const supabase = getSupabase();
  const readKey = randomToken(24);
  const writeKey = randomToken(24);
  const expiresAt = new Date(Date.now() + OAUTH_TTL_MS).toISOString();

  const { error } = await supabase.from("oauth_pending").insert({
    read_key: readKey,
    write_key: writeKey,
    payload: null,
    expires_at: expiresAt,
  });

  if (error) {
    throw new Error(`Failed to create oauth pending: ${error.message}`);
  }

  return { readKey, writeKey };
}

export async function completeOAuthPending(
  writeKey: string,
  payload: OAuthPayload
): Promise<void> {
  const supabase = getSupabase();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("oauth_pending")
    .update({ payload })
    .eq("write_key", writeKey)
    .gt("expires_at", nowIso)
    .is("payload", null)
    .select("read_key")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to complete oauth pending: ${error.message}`);
  }
  if (!data) {
    // Distinguish already-consumed vs unknown state for clearer reconnect errors.
    const { data: existing } = await supabase
      .from("oauth_pending")
      .select("payload, expires_at")
      .eq("write_key", writeKey)
      .maybeSingle();

    if (!existing) {
      throw new Error(
        "This Slack login link is no longer valid. Close the browser tab, then click Connect in Figma again."
      );
    }
    if (new Date(existing.expires_at).getTime() < Date.now()) {
      throw new Error("Slack login expired. Click Connect in Figma again.");
    }
    if (existing.payload) {
      // Already completed — treat as success so a double-callback doesn't fail the user.
      return;
    }
    throw new Error("Invalid or expired OAuth state");
  }
}

export async function pollOAuthPending(
  readKey: string
): Promise<"pending" | "expired" | OAuthPayload> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("oauth_pending")
    .select("payload, expires_at")
    .eq("read_key", readKey)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to poll oauth pending: ${error.message}`);
  }
  if (!data) {
    return "expired";
  }

  if (new Date(data.expires_at).getTime() < Date.now()) {
    await supabase.from("oauth_pending").delete().eq("read_key", readKey);
    return "expired";
  }

  if (!data.payload) {
    return "pending";
  }

  const payload = data.payload as OAuthPayload;

  // One-time read: delete after successful poll.
  await supabase.from("oauth_pending").delete().eq("read_key", readKey);

  return payload;
}
