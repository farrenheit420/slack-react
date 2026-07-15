import { NextRequest, NextResponse } from "next/server";
import { getConnectionFromRequest } from "@/lib/auth";
import { corsHeaders, jsonWithCors, optionsResponse } from "@/lib/cors";
import { fetchEmojiMap, resolveEmojiUrl } from "@/lib/slack";

export const runtime = "nodejs";

function normalizeName(raw: string): string {
  return raw.trim().replace(/^:+|:+$/g, "").toLowerCase();
}

export function OPTIONS() {
  return optionsResponse();
}

/**
 * Proxies a custom emoji image with CORS so Figma Quick Actions can use iconUrl.
 * Auth via Authorization bearer or ?session= (iconUrl cannot send headers).
 */
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

    const emojiMap = await fetchEmojiMap(connection.access_token);
    const imageUrl = resolveEmojiUrl(emojiMap, name);
    if (!imageUrl) {
      return jsonWithCors({ error: "Not found" }, { status: 404 });
    }

    const upstream = await fetch(imageUrl);
    if (!upstream.ok) {
      return jsonWithCors(
        { error: `Upstream image failed (${upstream.status})` },
        { status: 502 }
      );
    }

    const contentType = upstream.headers.get("content-type") || "image/png";
    const bytes = await upstream.arrayBuffer();
    const headers = new Headers(corsHeaders());
    headers.set("Content-Type", contentType);
    headers.set("Cache-Control", "private, max-age=3600");

    return new NextResponse(bytes, { status: 200, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonWithCors({ error: message }, { status: 500 });
  }
}
