import { NextRequest } from "next/server";
import { getConnectionFromRequest } from "@/lib/auth";
import { jsonWithCors, optionsResponse } from "@/lib/cors";
import { fetchEmojiMap, resolveEmojiUrl } from "@/lib/slack";

export const runtime = "nodejs";

export function OPTIONS() {
  return optionsResponse();
}

export async function GET(request: NextRequest) {
  try {
    const connection = await getConnectionFromRequest(request);
    if (!connection) {
      return jsonWithCors({ error: "Unauthorized" }, { status: 401 });
    }

    if (connection.tier !== "pro") {
      return jsonWithCors(
        {
          error: "Import All is a Pro feature — coming soon.",
          upgrade: true,
        },
        { status: 402 }
      );
    }

    const emojiMap = await fetchEmojiMap(connection.access_token);
    const resolved: Record<string, string> = {};

    for (const name of Object.keys(emojiMap)) {
      const url = resolveEmojiUrl(emojiMap, name);
      if (url) resolved[name] = url;
    }

    return jsonWithCors({ emoji: resolved });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonWithCors({ error: message }, { status: 500 });
  }
}
