import { NextRequest } from "next/server";
import { getConnectionFromRequest } from "@/lib/auth";
import { jsonWithCors, optionsResponse } from "@/lib/cors";
import {
  fetchEmojiMap,
  listResolvedEmoji,
  searchResolvedEmoji,
} from "@/lib/slack";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

export function OPTIONS() {
  return optionsResponse();
}

/**
 * Search custom emoji for Quick Actions autocomplete.
 * Free for all tiers — does not count toward import quota.
 *
 * GET /api/emoji/search?q=wave&limit=25
 * - q empty → returns a small alphabetical sample (for empty-state suggestions)
 * - catalog=1 → returns the full resolved list (for client-side caching)
 */
export async function GET(request: NextRequest) {
  try {
    const connection = await getConnectionFromRequest(request);
    if (!connection) {
      return jsonWithCors({ error: "Unauthorized" }, { status: 401 });
    }

    const q = request.nextUrl.searchParams.get("q") ?? "";
    const wantCatalog = request.nextUrl.searchParams.get("catalog") === "1";
    const limitRaw = Number(request.nextUrl.searchParams.get("limit") || DEFAULT_LIMIT);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : DEFAULT_LIMIT)
    );

    const emojiMap = await fetchEmojiMap(connection.access_token);
    const resolved = listResolvedEmoji(emojiMap);

    if (wantCatalog) {
      return jsonWithCors({ emoji: resolved, teamId: connection.team_id });
    }

    return jsonWithCors({
      emoji: searchResolvedEmoji(resolved, q, limit),
      teamId: connection.team_id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonWithCors({ error: message }, { status: 500 });
  }
}
