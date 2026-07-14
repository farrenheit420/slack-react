import { NextRequest } from "next/server";
import {
  countMonthlyOneImports,
  getConnectionFromRequest,
  recordUsage,
} from "@/lib/auth";
import { jsonWithCors, optionsResponse } from "@/lib/cors";
import { getFreeTierLimit } from "@/lib/env";
import { fetchEmojiMap, resolveEmojiUrl } from "@/lib/slack";

export const runtime = "nodejs";

export function OPTIONS() {
  return optionsResponse();
}

function normalizeName(raw: string): string {
  return raw.trim().replace(/^:+|:+$/g, "").toLowerCase();
}

export async function GET(request: NextRequest) {
  try {
    const connection = await getConnectionFromRequest(request);
    if (!connection) {
      return jsonWithCors({ error: "Unauthorized" }, { status: 401 });
    }

    const nameParam = request.nextUrl.searchParams.get("name");
    if (!nameParam) {
      return jsonWithCors({ error: "Missing name" }, { status: 400 });
    }

    const name = normalizeName(nameParam);
    if (!name) {
      return jsonWithCors({ error: "Invalid emoji name" }, { status: 400 });
    }

    if (connection.tier === "free") {
      const used = await countMonthlyOneImports(connection.team_id);
      if (used >= getFreeTierLimit()) {
        return jsonWithCors(
          {
            error: "Free tier monthly limit reached",
            code: "quota_exceeded",
            limit: getFreeTierLimit(),
            used,
          },
          { status: 429 }
        );
      }
    }

    const emojiMap = await fetchEmojiMap(connection.access_token);
    const url = resolveEmojiUrl(emojiMap, name);
    if (!url) {
      return jsonWithCors(
        { error: `No custom emoji named :${name}:` },
        { status: 404 }
      );
    }

    await recordUsage(connection.team_id, "one", name);

    return jsonWithCors({ name, url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonWithCors({ error: message }, { status: 500 });
  }
}
