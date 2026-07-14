import { NextRequest, NextResponse } from "next/server";
import { upsertConnection } from "@/lib/auth";
import { hashToken, randomToken } from "@/lib/crypto";
import { getAppBaseUrl } from "@/lib/env";
import { completeOAuthPending } from "@/lib/sessions";
import { exchangeSlackCode } from "@/lib/slack";

export const runtime = "nodejs";

function errorHtml(message: string): NextResponse {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Slack React</title></head>
<body style="font-family:system-ui;padding:40px;max-width:480px">
  <h1>Connection failed</h1>
  <p>${message.replace(/[<>&]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string)
  )}</p>
  <p>You can close this tab and try again from Figma.</p>
</body></html>`;
  return new NextResponse(html, {
    status: 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return errorHtml(`Slack returned an error: ${oauthError}`);
  }
  if (!code || !state) {
    return errorHtml("Missing code or state from Slack.");
  }

  try {
    const { accessToken, teamId, teamName } = await exchangeSlackCode(code);
    const sessionToken = randomToken(32);
    const sessionTokenHash = hashToken(sessionToken);

    await upsertConnection({
      teamId,
      teamName,
      accessToken,
      sessionTokenHash,
    });

    await completeOAuthPending(state, {
      teamId,
      teamName,
      sessionToken,
    });

    return NextResponse.redirect(`${getAppBaseUrl()}/auth/success`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorHtml(message);
  }
}
