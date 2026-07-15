import { NextRequest } from "next/server";
import { getConnectionFromRequest } from "@/lib/auth";
import { jsonWithCors, optionsResponse } from "@/lib/cors";
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

    const emojiMap = await fetchEmojiMap(
      connection.access_token,
      connection.team_id
    );
    const url = resolveEmojiUrl(emojiMap, name);
    if (!url) {
      return jsonWithCors(
        { error: `No custom emoji named :${name}:` },
        { status: 404 }
      );
    }

    return jsonWithCors({ name, url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonWithCors({ error: message }, { status: 500 });
  }
}
