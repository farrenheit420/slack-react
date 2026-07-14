import { jsonWithCors, optionsResponse } from "@/lib/cors";
import { createOAuthPending } from "@/lib/sessions";
import { buildSlackAuthorizeUrl } from "@/lib/slack";

export const runtime = "nodejs";

export function OPTIONS() {
  return optionsResponse();
}

export async function POST() {
  try {
    const { readKey, writeKey } = await createOAuthPending();
    const authUrl = buildSlackAuthorizeUrl(writeKey);
    return jsonWithCors({ authUrl, readKey });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonWithCors({ error: message }, { status: 500 });
  }
}
