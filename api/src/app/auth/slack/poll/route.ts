import { NextRequest } from "next/server";
import { jsonWithCors, optionsResponse, withCors } from "@/lib/cors";
import { pollOAuthPending } from "@/lib/sessions";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function OPTIONS() {
  return optionsResponse();
}

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (!key) {
    return jsonWithCors({ error: "Missing key" }, { status: 400 });
  }

  try {
    const result = await pollOAuthPending(key);

    if (result === "pending") {
      return withCors(new NextResponse(null, { status: 202 }));
    }

    if (result === "expired") {
      return jsonWithCors(
        { error: "OAuth session expired. Try connecting again." },
        { status: 410 }
      );
    }

    return jsonWithCors({
      teamId: result.teamId,
      teamName: result.teamName,
      sessionToken: result.sessionToken,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonWithCors({ error: message }, { status: 500 });
  }
}
