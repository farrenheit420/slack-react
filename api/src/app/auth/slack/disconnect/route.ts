import { NextRequest } from "next/server";
import {
  getConnectionFromRequest,
} from "@/lib/auth";
import { hashToken, randomToken } from "@/lib/crypto";
import { jsonWithCors, optionsResponse } from "@/lib/cors";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

export function OPTIONS() {
  return optionsResponse();
}

/**
 * Invalidate the plugin session for this workspace (Disconnect).
 * Keeps the Slack access token so reconnect can refresh the session without
 * needing to delete the app from Slack.
 */
export async function POST(request: NextRequest) {
  try {
    const connection = await getConnectionFromRequest(request);
    if (!connection) {
      return jsonWithCors({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabase();
    // Rotate to a unique unusable hash so the previous plugin session stops working.
    const revokedHash = hashToken(`revoked:${connection.team_id}:${randomToken(16)}`);
    const { error } = await supabase
      .from("slack_connections")
      .update({
        session_token_hash: revokedHash,
        updated_at: new Date().toISOString(),
      })
      .eq("team_id", connection.team_id);

    if (error) {
      throw new Error(`Failed to disconnect: ${error.message}`);
    }

    return jsonWithCors({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonWithCors({ error: message }, { status: 500 });
  }
}
