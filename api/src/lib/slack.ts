import { getSlackConfig } from "./env";

/** In-memory per-team cache for emoji.list (shared across warm serverless invocations). */
const EMOJI_MAP_TTL_MS = 2 * 60 * 1000;

type EmojiMapCacheEntry = {
  emoji: Record<string, string>;
  fetchedAt: number;
  inflight?: Promise<Record<string, string>>;
};

const emojiMapCache = new Map<string, EmojiMapCacheEntry>();

export type SlackTokenResponse = {
  ok: boolean;
  error?: string;
  access_token?: string;
  token_type?: string;
  scope?: string;
  team?: { id: string; name: string };
  authed_user?: {
    id: string;
    access_token?: string;
    scope?: string;
    token_type?: string;
  };
};

export function buildSlackAuthorizeUrl(writeKey: string): string {
  const { clientId, redirectUri } = getSlackConfig();
  // User token scope only — emoji.list needs emoji:read on a user token.
  // Cache-bust so reconnect doesn't reuse a stale authorize page in the browser.
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
    throw new Error(
      "Slack did not return an access token. Try removing the app from your Slack workspace and connecting again."
    );
  }

  const teamId = data.team?.id;
  const teamName = data.team?.name || teamId || "Slack workspace";
  if (!teamId) {
    throw new Error("Slack did not return a team id");
  }

  return { accessToken, teamId, teamName };
}

export async function fetchEmojiMap(
  accessToken: string,
  teamId?: string
): Promise<Record<string, string>> {
  if (teamId) {
    const hit = emojiMapCache.get(teamId);
    if (hit) {
      if (Date.now() - hit.fetchedAt < EMOJI_MAP_TTL_MS) {
        return hit.emoji;
      }
      if (hit.inflight) {
        return hit.inflight;
      }
    }
  }

  const request = (async () => {
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
  })();

  if (teamId) {
    const prev = emojiMapCache.get(teamId);
    emojiMapCache.set(teamId, {
      emoji: prev?.emoji ?? {},
      fetchedAt: prev?.fetchedAt ?? 0,
      inflight: request,
    });
  }

  try {
    const emoji = await request;
    if (teamId) {
      emojiMapCache.set(teamId, { emoji, fetchedAt: Date.now() });
    }
    return emoji;
  } catch (err) {
    if (teamId) {
      const prev = emojiMapCache.get(teamId);
      if (prev?.inflight === request) {
        if (prev.fetchedAt > 0 && Object.keys(prev.emoji).length > 0) {
          emojiMapCache.set(teamId, {
            emoji: prev.emoji,
            fetchedAt: prev.fetchedAt,
          });
        } else {
          emojiMapCache.delete(teamId);
        }
      }
    }
    throw err;
  }
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

export type ResolvedEmoji = { name: string; url: string };

/** All custom emoji names with concrete image URLs (aliases included under their own names). */
export function listResolvedEmoji(emojiMap: Record<string, string>): ResolvedEmoji[] {
  const out: ResolvedEmoji[] = [];
  for (const name of Object.keys(emojiMap)) {
    const url = resolveEmojiUrl(emojiMap, name);
    if (url) out.push({ name, url });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export function searchResolvedEmoji(
  emoji: ResolvedEmoji[],
  query: string,
  limit = 25
): ResolvedEmoji[] {
  const q = query.trim().replace(/^:+|:+$/g, "").toLowerCase();
  if (!q) return emoji.slice(0, limit);

  const prefix: ResolvedEmoji[] = [];
  const contains: ResolvedEmoji[] = [];

  for (const item of emoji) {
    if (item.name.startsWith(q)) prefix.push(item);
    else if (item.name.includes(q)) contains.push(item);
  }

  return [...prefix, ...contains].slice(0, limit);
}
