import { API_BASE_URL, EMOJI_SIZE, MESSAGE_TYPES, STORAGE_KEYS } from "./constants";
import { MESSAGES } from "./messages";

type Connection = {
  teamId: string;
  teamName: string;
  sessionToken: string;
};

type UiToMainMessage =
  | { type: typeof MESSAGE_TYPES.UI_READY }
  | { type: typeof MESSAGE_TYPES.GET_CONNECTION }
  | {
      type: typeof MESSAGE_TYPES.CONNECT_RESULT;
      teamId: string;
      teamName: string;
      sessionToken: string;
    }
  | { type: typeof MESSAGE_TYPES.DISCONNECT }
  | { type: typeof MESSAGE_TYPES.IMPORT_ONE; name: string }
  | { type: typeof MESSAGE_TYPES.IMPORT_ALL };

function normalizeEmojiName(raw: string): string {
  return raw.trim().replace(/^:+|:+$/g, "").toLowerCase();
}

async function getConnection(): Promise<Connection | null> {
  const teamId = await figma.clientStorage.getAsync(STORAGE_KEYS.TEAM_ID);
  const teamName = await figma.clientStorage.getAsync(STORAGE_KEYS.TEAM_NAME);
  const sessionToken = await figma.clientStorage.getAsync(STORAGE_KEYS.SESSION_TOKEN);
  if (
    typeof teamId === "string" &&
    teamId &&
    typeof teamName === "string" &&
    typeof sessionToken === "string" &&
    sessionToken
  ) {
    return { teamId, teamName, sessionToken };
  }
  return null;
}

async function saveConnection(conn: Connection): Promise<void> {
  await figma.clientStorage.setAsync(STORAGE_KEYS.TEAM_ID, conn.teamId);
  await figma.clientStorage.setAsync(STORAGE_KEYS.TEAM_NAME, conn.teamName);
  await figma.clientStorage.setAsync(STORAGE_KEYS.SESSION_TOKEN, conn.sessionToken);
}

async function clearConnection(): Promise<void> {
  await figma.clientStorage.setAsync(STORAGE_KEYS.TEAM_ID, "");
  await figma.clientStorage.setAsync(STORAGE_KEYS.TEAM_NAME, "");
  await figma.clientStorage.setAsync(STORAGE_KEYS.SESSION_TOKEN, "");
}

function postConnectionState(conn: Connection | null): void {
  figma.ui.postMessage({
    type: MESSAGE_TYPES.CONNECTION_STATE,
    connected: !!conn,
    teamId: conn?.teamId ?? null,
    teamName: conn?.teamName ?? null,
    apiBaseUrl: API_BASE_URL,
  });
}

async function placeEmojiOnCanvas(name: string, url: string): Promise<void> {
  const image = await figma.createImageAsync(url);
  const size = await image.getSizeAsync();
  const width = size.width || EMOJI_SIZE;
  const height = size.height || EMOJI_SIZE;

  // Prefer a square visual size while preserving aspect ratio within the box.
  const scale = Math.min(EMOJI_SIZE / width, EMOJI_SIZE / height);
  const nodeWidth = Math.max(1, Math.round(width * scale));
  const nodeHeight = Math.max(1, Math.round(height * scale));

  const rect = figma.createRectangle();
  rect.name = `:${name}:`;
  rect.resize(nodeWidth, nodeHeight);
  rect.fills = [
    {
      type: "IMAGE",
      scaleMode: "FIT",
      imageHash: image.hash,
    },
  ];

  const center = figma.viewport.center;
  rect.x = center.x - nodeWidth / 2;
  rect.y = center.y - nodeHeight / 2;

  figma.currentPage.appendChild(rect);
  figma.currentPage.selection = [rect];
  figma.viewport.scrollAndZoomIntoView([rect]);
}

async function fetchEmojiOne(
  conn: Connection,
  name: string
): Promise<{ name: string; url: string }> {
  const params = new URLSearchParams({ name });
  const res = await fetch(`${API_BASE_URL}/api/emoji/one?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${conn.sessionToken}`,
    },
  });

  const data = (await res.json().catch(() => ({}))) as {
    name?: string;
    url?: string;
    error?: string;
    code?: string;
  };

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(MESSAGES.NOT_FOUND(name));
    }
    if (res.status === 429 || data.code === "quota_exceeded") {
      throw new Error(MESSAGES.QUOTA_EXCEEDED);
    }
    if (res.status === 401) {
      await clearConnection();
      throw new Error(MESSAGES.NOT_CONNECTED);
    }
    throw new Error(data.error || `Request failed (${res.status})`);
  }

  if (!data.name || !data.url) {
    throw new Error(MESSAGES.NOT_FOUND(name));
  }

  return { name: data.name, url: data.url };
}

async function importOneEmoji(rawName: string, notifyUi: boolean): Promise<void> {
  const name = normalizeEmojiName(rawName);
  if (!name) {
    figma.notify(MESSAGES.ENTER_EMOJI_NAME);
    if (notifyUi) {
      figma.ui.postMessage({
        type: MESSAGE_TYPES.IMPORT_RESULT,
        ok: false,
        message: MESSAGES.ENTER_EMOJI_NAME,
      });
    }
    return;
  }

  const conn = await getConnection();
  if (!conn) {
    figma.notify(MESSAGES.NOT_CONNECTED);
    if (notifyUi) {
      figma.ui.postMessage({
        type: MESSAGE_TYPES.IMPORT_RESULT,
        ok: false,
        message: MESSAGES.NOT_CONNECTED,
      });
    }
    return;
  }

  figma.notify(MESSAGES.IMPORTING(name));
  try {
    const emoji = await fetchEmojiOne(conn, name);
    await placeEmojiOnCanvas(emoji.name, emoji.url);
    figma.notify(MESSAGES.IMPORTED(emoji.name));
    if (notifyUi) {
      figma.ui.postMessage({
        type: MESSAGE_TYPES.IMPORT_RESULT,
        ok: true,
        message: MESSAGES.IMPORTED(emoji.name),
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    figma.notify(MESSAGES.ERROR_PREFIX + message);
    if (notifyUi) {
      figma.ui.postMessage({
        type: MESSAGE_TYPES.IMPORT_RESULT,
        ok: false,
        message,
      });
    }
  }
}

async function handleImportAll(): Promise<void> {
  const conn = await getConnection();
  if (!conn) {
    figma.notify(MESSAGES.NOT_CONNECTED);
    figma.ui.postMessage({
      type: MESSAGE_TYPES.IMPORT_RESULT,
      ok: false,
      message: MESSAGES.NOT_CONNECTED,
    });
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/emoji/list`, {
      headers: { Authorization: `Bearer ${conn.sessionToken}` },
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      upgrade?: boolean;
    };
    if (res.status === 402 || data.upgrade) {
      figma.notify(MESSAGES.PRO_REQUIRED);
      figma.ui.postMessage({
        type: MESSAGE_TYPES.IMPORT_RESULT,
        ok: false,
        message: MESSAGES.PRO_REQUIRED,
      });
      return;
    }
    figma.notify(data.error || MESSAGES.PRO_REQUIRED);
    figma.ui.postMessage({
      type: MESSAGE_TYPES.IMPORT_RESULT,
      ok: false,
      message: data.error || MESSAGES.PRO_REQUIRED,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    figma.notify(MESSAGES.ERROR_PREFIX + message);
  }
}

function showPanel(): void {
  figma.showUI(__html__, { width: 320, height: 420, title: "Slack React" });
}

figma.ui.onmessage = async (msg: UiToMainMessage) => {
  if (!msg || !msg.type) return;

  if (msg.type === MESSAGE_TYPES.UI_READY || msg.type === MESSAGE_TYPES.GET_CONNECTION) {
    postConnectionState(await getConnection());
    return;
  }

  if (msg.type === MESSAGE_TYPES.CONNECT_RESULT) {
    await saveConnection({
      teamId: msg.teamId,
      teamName: msg.teamName,
      sessionToken: msg.sessionToken,
    });
    figma.notify(MESSAGES.CONNECTED(msg.teamName));
    postConnectionState(await getConnection());
    return;
  }

  if (msg.type === MESSAGE_TYPES.DISCONNECT) {
    await clearConnection();
    figma.notify(MESSAGES.DISCONNECTED);
    postConnectionState(null);
    return;
  }

  if (msg.type === MESSAGE_TYPES.IMPORT_ONE) {
    await importOneEmoji(msg.name, true);
    return;
  }

  if (msg.type === MESSAGE_TYPES.IMPORT_ALL) {
    await handleImportAll();
  }
};

figma.on("run", async (event) => {
  const command = event.command || "open";

  if (command === "import-emoji") {
    const name =
      event.parameters && typeof event.parameters.name === "string"
        ? event.parameters.name
        : "";
    // Hidden UI is still required for some environments; keep plugin open briefly.
    figma.showUI(__html__, { visible: false });
    await importOneEmoji(name, false);
    figma.closePlugin();
    return;
  }

  showPanel();
});
