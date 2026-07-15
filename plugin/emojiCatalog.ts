import {
  API_BASE_URL,
  EMOJI_CATALOG_SEARCH_REFRESH_MS,
  EMOJI_CATALOG_TTL_MS,
  EMOJI_SUGGESTION_LIMIT,
  STORAGE_KEYS,
} from "./constants";

export type CatalogEmoji = { name: string; url: string };

export type EmojiSuggestion = {
  name: string;
  data: string;
  iconUrl?: string;
};

type CatalogCache = {
  teamId: string;
  fetchedAt: number;
  emoji: CatalogEmoji[];
};

let memoryCache: CatalogCache | null = null;
let inflight: Promise<CatalogEmoji[]> | null = null;

function isFresh(cache: CatalogCache, teamId: string): boolean {
  return (
    cache.teamId === teamId &&
    Date.now() - cache.fetchedAt < EMOJI_CATALOG_TTL_MS &&
    Array.isArray(cache.emoji)
  );
}

function isUsable(cache: CatalogCache, teamId: string): boolean {
  return cache.teamId === teamId && Array.isArray(cache.emoji);
}

async function readStoredCatalog(
  teamId: string,
  options: { allowStale?: boolean } = {}
): Promise<CatalogCache | null> {
  const raw = await figma.clientStorage.getAsync(STORAGE_KEYS.EMOJI_CATALOG);
  if (!raw || typeof raw !== "object") return null;
  const cache = raw as CatalogCache;
  if (
    typeof cache.teamId !== "string" ||
    typeof cache.fetchedAt !== "number" ||
    !Array.isArray(cache.emoji)
  ) {
    return null;
  }
  if (options.allowStale) {
    return isUsable(cache, teamId) ? cache : null;
  }
  return isFresh(cache, teamId) ? cache : null;
}

async function writeStoredCatalog(cache: CatalogCache): Promise<void> {
  await figma.clientStorage.setAsync(STORAGE_KEYS.EMOJI_CATALOG, cache);
}

export async function clearEmojiCatalogCache(): Promise<void> {
  memoryCache = null;
  inflight = null;
  await figma.clientStorage.setAsync(STORAGE_KEYS.EMOJI_CATALOG, null);
}

export function filterEmojiCatalog(
  emoji: CatalogEmoji[],
  query: string,
  limit = EMOJI_SUGGESTION_LIMIT
): CatalogEmoji[] {
  const q = query.trim().replace(/^:+|:+$/g, "").toLowerCase();
  if (!q) return emoji.slice(0, limit);

  const prefix: CatalogEmoji[] = [];
  const contains: CatalogEmoji[] = [];

  for (const item of emoji) {
    const name = item.name.toLowerCase();
    if (name.startsWith(q)) prefix.push(item);
    else if (name.includes(q)) contains.push(item);
  }

  return [...prefix, ...contains].slice(0, limit);
}

/** CORS-friendly preview URL via our API (Figma iconUrl cannot send Auth headers). */
export function emojiPreviewIconUrl(sessionToken: string, name: string): string {
  return `${API_BASE_URL}/api/emoji/icon?name=${encodeURIComponent(name)}&session=${encodeURIComponent(sessionToken)}`;
}

export function buildEmojiSuggestions(
  matches: CatalogEmoji[],
  sessionToken: string
): EmojiSuggestion[] {
  return matches.map((emoji) => ({
    name: emoji.name,
    data: emoji.name,
    iconUrl: emojiPreviewIconUrl(sessionToken, emoji.name),
  }));
}

async function fetchCatalogFromApi(
  sessionToken: string,
  teamId: string
): Promise<CatalogEmoji[]> {
  const res = await fetch(`${API_BASE_URL}/api/emoji/search?catalog=1`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  const data = (await res.json().catch(() => ({}))) as {
    emoji?: CatalogEmoji[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || `Catalog failed (${res.status})`);
  }
  const emoji = Array.isArray(data.emoji) ? data.emoji : [];
  const cache: CatalogCache = { teamId, fetchedAt: Date.now(), emoji };
  memoryCache = cache;
  await writeStoredCatalog(cache);
  return emoji;
}

/**
 * Return a previously fetched catalog for this team, even if past the TTL.
 * Used for instant search suggestions while a refresh is in flight.
 */
export async function peekEmojiCatalog(
  teamId: string
): Promise<CatalogEmoji[] | null> {
  if (memoryCache && isUsable(memoryCache, teamId)) {
    return memoryCache.emoji;
  }
  const stored = await readStoredCatalog(teamId, { allowStale: true });
  if (stored) {
    memoryCache = stored;
    return stored.emoji;
  }
  return null;
}

/** Always refetch from Slack (deduped). Updates the cache on success. */
export async function refreshEmojiCatalog(
  teamId: string,
  sessionToken: string
): Promise<CatalogEmoji[]> {
  if (inflight) return inflight;

  const request = fetchCatalogFromApi(sessionToken, teamId);
  inflight = request;
  void request.then(
    () => {
      if (inflight === request) inflight = null;
    },
    () => {
      if (inflight === request) inflight = null;
    }
  );
  return request;
}

/**
 * For Quick Action search: return a catalog refreshed within the search
 * cooldown window, refetching from Slack when older so new emoji show up.
 */
export async function ensureSearchEmojiCatalog(
  teamId: string,
  sessionToken: string
): Promise<CatalogEmoji[]> {
  if (
    memoryCache &&
    isUsable(memoryCache, teamId) &&
    Date.now() - memoryCache.fetchedAt < EMOJI_CATALOG_SEARCH_REFRESH_MS
  ) {
    return memoryCache.emoji;
  }
  return refreshEmojiCatalog(teamId, sessionToken);
}

export async function getEmojiCatalog(
  teamId: string,
  sessionToken: string
): Promise<CatalogEmoji[]> {
  if (memoryCache && isFresh(memoryCache, teamId)) {
    return memoryCache.emoji;
  }

  const stored = await readStoredCatalog(teamId);
  if (stored) {
    memoryCache = stored;
    return stored.emoji;
  }

  return refreshEmojiCatalog(teamId, sessionToken);
}
