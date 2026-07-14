import { getSlackConfig } from "./env";

export type SlackTokenResponse = {
  ok: boolean;
  error?: string;
  access_token?: string;
  token_type?: string;
  scope?: string;
  team?: { id: string; name: string };
  authed_user?: { id: string; access_token?: string; scope?: string };
};

export function buildSlackAuthorizeUrl(writeKey: string): string {
  const { clientId, redirectUri } = getSlackConfig();
  // User token scope only — emoji.list needs emoji:read on a user token.
  const params = new URLSearchParams({
    client_id: clientId,
    user_scope: "emoji:read",
    redirect_uri: redirectUri,
    state: writeKey,
  });
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

export async function exchangeSlackCode(code: string): Promise<{
  accessToken: string;
  teamId: string;
  teamName: string;
}> {
  const { clientId, clientSecret, redirectUri } = getSlackConfig();

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = (await res.json()) as SlackTokenResponse;
  if (!data.ok) {
    throw new Error(data.error || "Slack token exchange failed");
  }

  // Prefer user token for emoji.list (workspace custom emoji).
  const userToken = data.authed_user?.access_token;
  const botToken = data.access_token;
  const accessToken = userToken || botToken;
  if (!accessToken) {
    throw new Error("Slack did not return an access token");
  }

  const teamId = data.team?.id;
  const teamName = data.team?.name || teamId || "Slack workspace";
  if (!teamId) {
    throw new Error("Slack did not return a team id");
  }

  return { accessToken, teamId, teamName };
}

export async function fetchEmojiMap(
  accessToken: string
): Promise<Record<string, string>> {
  const res = await fetch("https://slack.com/api/emoji.list", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json()) as {
    ok: boolean;
    error?: string;
    emoji?: Record<string, string>;
  };

  if (!data.ok || !data.emoji) {
    throw new Error(data.error || "emoji.list failed");
  }

  return data.emoji;
}

/**
 * Resolve alias:othername chains to a concrete image URL.
 */
export function resolveEmojiUrl(
  emojiMap: Record<string, string>,
  name: string
): string | null {
  const key = name.toLowerCase();
  let current = emojiMap[key];
  const seen = new Set<string>();

  while (current) {
    if (seen.has(current)) return null;
    seen.add(current);

    if (current.startsWith("alias:")) {
      const aliasOf = current.slice("alias:".length).toLowerCase();
      current = emojiMap[aliasOf];
      continue;
    }

    return current;
  }

  return null;
}
