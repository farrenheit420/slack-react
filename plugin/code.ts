import {
  API_BASE_URL,
  EMOJI_SIZES,
  MESSAGE_TYPES,
  STAMP_MASK_TIMEOUT_MS,
  STAMP_PADDING_RATIO,
  STAMP_ROTATION_MAX_DEG,
  STORAGE_KEYS,
  type EmojiStyleKey,
  type ImportOptions,
} from "./constants";
import { MESSAGES } from "./messages";
import { getImportOptions, normalizeImportOptions, saveImportOptions } from "./options";
import {
  clearEmojiCatalogCache,
  buildEmojiSuggestions,
  filterEmojiCatalog,
  getEmojiCatalog,
} from "./emojiCatalog";

type Connection = {
  teamId: string;
  teamName: string;
  sessionToken: string;
};

type StampPathPoint = { x: number; y: number };

type UiToMainMessage =
  | { type: typeof MESSAGE_TYPES.UI_READY }
  | { type: typeof MESSAGE_TYPES.GET_CONNECTION }
  | { type: typeof MESSAGE_TYPES.DISCONNECT }
  | { type: typeof MESSAGE_TYPES.IMPORT_ONE; name: string; style?: EmojiStyleKey }
  | {
      type: typeof MESSAGE_TYPES.RUN_OAUTH;
      authUrl: string;
      readKey: string;
    }
  | {
      type: typeof MESSAGE_TYPES.SAVE_OPTIONS;
      size: ImportOptions["size"];
    }
  | {
      type: typeof MESSAGE_TYPES.STAMP_MASK_PATH;
      paths: StampPathPoint[][];
    }
  | {
      type: typeof MESSAGE_TYPES.STAMP_MASK_ERROR;
      message?: string;
    };

/** When set, Connect runs in a hidden UI then imports this emoji. */
let pendingImportName: string | null = null;
/** Style used for `pendingImportName` after a hidden Connect flow. */
let pendingImportStyle: EmojiStyleKey = "default";
/** Canvas point captured when the import was requested (cursor / viewport). */
let pendingImportAnchor: Vector | null = null;
/** When true, UI auto-starts OAuth on UI_READY (hidden connect flow). */
let autoStartOauth = false;
/** Close the plugin after a hidden Connect flow finishes (success or fail). */
let closeAfterHiddenConnect = false;
/** Bumped to cancel an in-flight main-thread OAuth poll. */
let oauthPollGeneration = 0;

/** Resolves when the plugin UI iframe has posted UI_READY. */
let uiReady = false;
let uiReadyWaiters: Array<() => void> = [];

/** One-shot waiter for stamp silhouette extraction. */
let pendingStampMask: {
  resolve: (paths: StampPathPoint[][]) => void;
  reject: (err: Error) => void;
} | null = null;

const OAUTH_POLL_INTERVAL_MS = 1000;
const OAUTH_POLL_TIMEOUT_MS = 3 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function markUiNotReady(): void {
  uiReady = false;
}

function markUiReady(): void {
  uiReady = true;
  for (const resolve of uiReadyWaiters) resolve();
  uiReadyWaiters = [];
}

function waitForUiReady(): Promise<void> {
  if (uiReady) return Promise.resolve();
  return new Promise((resolve) => {
    uiReadyWaiters.push(resolve);
  });
}

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
  await clearEmojiCatalogCache();
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

async function postOptionsState(): Promise<void> {
  const options = await getImportOptions();
  figma.ui.postMessage({
    type: MESSAGE_TYPES.OPTIONS_STATE,
    ...options,
  });
}

function fitInBox(
  width: number,
  height: number,
  box: number
): { nodeWidth: number; nodeHeight: number } {
  const scale = Math.min(box / width, box / height);
  return {
    nodeWidth: Math.max(1, Math.round(width * scale)),
    nodeHeight: Math.max(1, Math.round(height * scale)),
  };
}

/** Canvas point under the cursor, or viewport center if the mouse isn't on the canvas. */
function getPlacementAnchor(): Vector {
  try {
    const cursor = figma.activeUsers[0]?.position;
    if (cursor) return { x: cursor.x, y: cursor.y };
  } catch {
    // Missing "activeusers" permission (or API unavailable) — fall back below.
  }
  return figma.viewport.center;
}

function placeAtAnchor(
  node: SceneNode,
  width: number,
  height: number,
  anchor: Vector
): void {
  node.x = anchor.x - width / 2;
  node.y = anchor.y - height / 2;
}

function stampDropShadow(): DropShadowEffect {
  return {
    type: "DROP_SHADOW",
    color: { r: 0, g: 0, b: 0, a: 0.18 },
    offset: { x: 0, y: 3 },
    radius: 8,
    spread: 0,
    visible: true,
    blendMode: "NORMAL",
  };
}

function randomStampRotation(): number {
  return Math.random() * STAMP_ROTATION_MAX_DEG * 2 - STAMP_ROTATION_MAX_DEG;
}

function pointsToPathData(points: StampPathPoint[]): string {
  if (points.length === 0) return "";
  const first = points[0];
  let data = `M ${first.x} ${first.y}`;
  for (let i = 1; i < points.length; i++) {
    data += ` L ${points[i].x} ${points[i].y}`;
  }
  data += " Z";
  return data;
}

function pathBounds(paths: StampPathPoint[][]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;
  for (const path of paths) {
    for (const p of path) {
      any = true;
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!any) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * Ask the UI iframe to dilate + trace the emoji silhouette.
 * Requires showUI to have been called; waits for UI_READY first.
 */
async function requestStampMask(args: {
  imageBytes: Uint8Array;
  nodeWidth: number;
  nodeHeight: number;
  padding: number;
}): Promise<StampPathPoint[][]> {
  await waitForUiReady();

  return new Promise((resolve, reject) => {
    if (pendingStampMask) {
      pendingStampMask.reject(new Error("Stamp mask request superseded"));
      pendingStampMask = null;
    }

    const timer = setTimeout(() => {
      if (pendingStampMask) {
        pendingStampMask = null;
        reject(new Error("Stamp mask timed out"));
      }
    }, STAMP_MASK_TIMEOUT_MS);

    pendingStampMask = {
      resolve: (paths) => {
        clearTimeout(timer);
        pendingStampMask = null;
        resolve(paths);
      },
      reject: (err) => {
        clearTimeout(timer);
        pendingStampMask = null;
        reject(err);
      },
    };

    figma.ui.postMessage({
      type: MESSAGE_TYPES.PROCESS_STAMP_MASK,
      imageBytes: Array.from(args.imageBytes),
      nodeWidth: args.nodeWidth,
      nodeHeight: args.nodeHeight,
      padding: args.padding,
    });
  });
}

/** Legacy square white matte — used when silhouette extraction fails. */
function placeSquareStamp(
  name: string,
  imageFill: ImagePaint,
  emojiBox: number,
  nodeWidth: number,
  nodeHeight: number,
  padding: number,
  anchor: Vector
): SceneNode {
  const stampW = emojiBox + padding * 2;
  const stampH = emojiBox + padding * 2;
  const cornerRadius = Math.round(stampW * 0.18);

  const frame = figma.createFrame();
  frame.name = `:${name}:`;
  frame.resize(stampW, stampH);
  frame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  frame.strokes = [{ type: "SOLID", color: { r: 0.88, g: 0.88, b: 0.9 } }];
  frame.strokeWeight = 1.5;
  frame.cornerRadius = cornerRadius;
  frame.clipsContent = true;
  frame.effects = [stampDropShadow()];

  const rect = figma.createRectangle();
  rect.name = "emoji";
  rect.resize(nodeWidth, nodeHeight);
  rect.x = padding + (emojiBox - nodeWidth) / 2;
  rect.y = padding + (emojiBox - nodeHeight) / 2;
  rect.fills = [imageFill];
  frame.appendChild(rect);

  placeAtAnchor(frame, stampW, stampH, anchor);
  frame.rotation = randomStampRotation();
  return frame;
}

/** Silhouette matte: white EVENODD vector + IMAGE rect, grouped and tilted. */
function placeShapedStamp(
  name: string,
  imageFill: ImagePaint,
  nodeWidth: number,
  nodeHeight: number,
  paths: StampPathPoint[][],
  anchor: Vector
): SceneNode {
  const bounds = pathBounds(paths);
  if (!bounds) {
    throw new Error("Empty stamp paths");
  }

  const { minX, minY } = bounds;

  const shiftedPaths = paths.map((path) =>
    path.map((p) => ({ x: p.x - minX, y: p.y - minY }))
  );

  const vector = figma.createVector();
  vector.name = "matte";
  vector.vectorPaths = shiftedPaths.map((points) => ({
    windingRule: "EVENODD" as const,
    data: pointsToPathData(points),
  }));
  vector.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  vector.strokes = [{ type: "SOLID", color: { r: 0.88, g: 0.88, b: 0.9 } }];
  vector.strokeWeight = 1.5;
  vector.effects = [stampDropShadow()];

  const rect = figma.createRectangle();
  rect.name = "emoji";
  rect.resize(nodeWidth, nodeHeight);
  rect.x = -minX;
  rect.y = -minY;
  rect.fills = [imageFill];

  figma.currentPage.appendChild(vector);
  figma.currentPage.appendChild(rect);
  const group = figma.group([vector, rect], figma.currentPage);
  group.name = `:${name}:`;

  placeAtAnchor(group, group.width, group.height, anchor);
  group.rotation = randomStampRotation();
  return group;
}

async function placeEmojiOnCanvas(
  name: string,
  url: string,
  style: EmojiStyleKey,
  anchor: Vector = getPlacementAnchor()
): Promise<void> {
  const options = await getImportOptions();
  const emojiBox = EMOJI_SIZES[options.size];

  const image = await figma.createImageAsync(url);
  const size = await image.getSizeAsync();
  const srcW = size.width || emojiBox;
  const srcH = size.height || emojiBox;
  const { nodeWidth, nodeHeight } = fitInBox(srcW, srcH, emojiBox);

  const imageFill: ImagePaint = {
    type: "IMAGE",
    scaleMode: "FIT",
    imageHash: image.hash,
  };

  let placed: SceneNode;

  if (style === "stamp") {
    const padding = Math.max(4, Math.round(emojiBox * STAMP_PADDING_RATIO));

    try {
      const imageBytes = await image.getBytesAsync();
      const paths = await requestStampMask({
        imageBytes,
        nodeWidth,
        nodeHeight,
        padding,
      });
      if (!paths.length) {
        throw new Error("No opaque pixels");
      }
      placed = placeShapedStamp(
        name,
        imageFill,
        nodeWidth,
        nodeHeight,
        paths,
        anchor
      );
    } catch {
      placed = placeSquareStamp(
        name,
        imageFill,
        emojiBox,
        nodeWidth,
        nodeHeight,
        padding,
        anchor
      );
    }
  } else {
    const rect = figma.createRectangle();
    rect.name = `:${name}:`;
    rect.resize(nodeWidth, nodeHeight);
    rect.fills = [imageFill];
    placeAtAnchor(rect, nodeWidth, nodeHeight, anchor);
    placed = rect;
  }

  // Shaped stamps are already on the page via figma.group; square/default may not be.
  if (!placed.parent) {
    figma.currentPage.appendChild(placed);
  }
  figma.currentPage.selection = [placed];
}

async function fetchEmojiOne(
  conn: Connection,
  name: string
): Promise<{ name: string; url: string }> {
  const res = await fetch(
    `${API_BASE_URL}/api/emoji/one?name=${encodeURIComponent(name)}`,
    {
      headers: {
        Authorization: `Bearer ${conn.sessionToken}`,
      },
    }
  );

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

async function importOneEmoji(
  rawName: string,
  notifyUi: boolean,
  style: EmojiStyleKey = "default",
  anchor: Vector = getPlacementAnchor()
): Promise<void> {
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
    await placeEmojiOnCanvas(emoji.name, emoji.url, style, anchor);
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

function showPanel(): void {
  pendingImportName = null;
  pendingImportStyle = "default";
  pendingImportAnchor = null;
  autoStartOauth = false;
  closeAfterHiddenConnect = false;
  markUiNotReady();
  figma.showUI(__html__, { width: 320, height: 240, title: "Plugin Options" });
}

/** Hidden UI for OAuth (and optional import after connect). */
function showHiddenConnectUi(
  importName?: string,
  style: EmojiStyleKey = "default",
  anchor: Vector = getPlacementAnchor()
): void {
  pendingImportName = importName ?? null;
  pendingImportStyle = style;
  pendingImportAnchor = anchor;
  autoStartOauth = true;
  closeAfterHiddenConnect = true;
  markUiNotReady();
  figma.showUI(__html__, { visible: false });
}

function postAuthError(error: string): void {
  figma.ui.postMessage({ type: MESSAGE_TYPES.AUTH_ERROR, error });
  figma.notify(MESSAGES.ERROR_PREFIX + error);
}

/**
 * Poll OAuth completion on the main thread. Figma suspends UI-iframe timers while
 * the user is in the system browser, which previously broke reconnect.
 */
async function pollOAuthOnMain(
  readKey: string,
  generation: number
): Promise<{ teamId: string; teamName: string; sessionToken: string }> {
  const started = Date.now();

  while (generation === oauthPollGeneration) {
    if (Date.now() - started > OAUTH_POLL_TIMEOUT_MS) {
      throw new Error(MESSAGES.AUTH_TIMEOUT);
    }

    const res = await fetch(
      `${API_BASE_URL}/auth/slack/poll?key=${encodeURIComponent(readKey)}`
    );

    if (generation !== oauthPollGeneration) {
      throw new Error("Connect cancelled");
    }

    if (res.status === 202) {
      await sleep(OAUTH_POLL_INTERVAL_MS);
      continue;
    }

    const data = (await res.json().catch(() => ({}))) as {
      teamId?: string;
      teamName?: string;
      sessionToken?: string;
      error?: string;
    };

    if (!res.ok) {
      throw new Error(data.error || MESSAGES.AUTH_FAILED);
    }
    if (!data.teamId || !data.sessionToken) {
      throw new Error(MESSAGES.AUTH_FAILED);
    }

    return {
      teamId: data.teamId,
      teamName: data.teamName || data.teamId,
      sessionToken: data.sessionToken,
    };
  }

  throw new Error("Connect cancelled");
}

async function finishOAuthSuccess(conn: Connection): Promise<void> {
  await saveConnection(conn);
  figma.notify(MESSAGES.CONNECTED(conn.teamName));

  const importName = pendingImportName;
  const importStyle = pendingImportStyle;
  const importAnchor = pendingImportAnchor ?? getPlacementAnchor();
  const shouldClose = closeAfterHiddenConnect;
  pendingImportName = null;
  pendingImportStyle = "default";
  pendingImportAnchor = null;
  autoStartOauth = false;
  closeAfterHiddenConnect = false;

  if (importName) {
    await importOneEmoji(importName, false, importStyle, importAnchor);
  }

  if (shouldClose) {
    figma.closePlugin();
    return;
  }

  postConnectionState(conn);
}

async function runOAuthFlow(authUrl: string, readKey: string): Promise<void> {
  const generation = ++oauthPollGeneration;
  figma.openExternal(authUrl);

  try {
    const conn = await pollOAuthOnMain(readKey, generation);
    if (generation !== oauthPollGeneration) return;
    await finishOAuthSuccess(conn);
  } catch (err) {
    if (generation !== oauthPollGeneration) return;
    const message = err instanceof Error ? err.message : String(err);
    if (closeAfterHiddenConnect) {
      pendingImportName = null;
      pendingImportStyle = "default";
      pendingImportAnchor = null;
      autoStartOauth = false;
      closeAfterHiddenConnect = false;
      figma.closePlugin(MESSAGES.ERROR_PREFIX + message);
      return;
    }
    postAuthError(message);
  }
}

figma.ui.onmessage = async (msg: UiToMainMessage) => {
  if (!msg || !msg.type) return;

  if (msg.type === MESSAGE_TYPES.STAMP_MASK_PATH) {
    pendingStampMask?.resolve(
      Array.isArray(msg.paths) ? msg.paths : []
    );
    return;
  }

  if (msg.type === MESSAGE_TYPES.STAMP_MASK_ERROR) {
    pendingStampMask?.reject(
      new Error(msg.message || "Stamp mask failed")
    );
    return;
  }

  if (msg.type === MESSAGE_TYPES.UI_READY || msg.type === MESSAGE_TYPES.GET_CONNECTION) {
    if (msg.type === MESSAGE_TYPES.UI_READY) {
      markUiReady();
    }
    postConnectionState(await getConnection());
    await postOptionsState();
    if (autoStartOauth && msg.type === MESSAGE_TYPES.UI_READY) {
      figma.ui.postMessage({ type: MESSAGE_TYPES.START_OAUTH });
    }
    return;
  }

  if (msg.type === MESSAGE_TYPES.SAVE_OPTIONS) {
    const options = normalizeImportOptions({ size: msg.size });
    await saveImportOptions(options);
    await postOptionsState();
    return;
  }

  if (msg.type === MESSAGE_TYPES.RUN_OAUTH) {
    await runOAuthFlow(msg.authUrl, msg.readKey);
    return;
  }

  if (msg.type === MESSAGE_TYPES.DISCONNECT) {
    oauthPollGeneration += 1;
    const conn = await getConnection();
    if (conn) {
      try {
        await fetch(`${API_BASE_URL}/auth/slack/disconnect`, {
          method: "POST",
          headers: { Authorization: `Bearer ${conn.sessionToken}` },
        });
      } catch {
        // Local disconnect should still proceed if the API is unreachable.
      }
    }
    await clearConnection();
    figma.notify(MESSAGES.DISCONNECTED);
    postConnectionState(null);
    return;
  }

  if (msg.type === MESSAGE_TYPES.IMPORT_ONE) {
    const style = msg.style === "stamp" ? "stamp" : "default";
    await importOneEmoji(msg.name, true, style, getPlacementAnchor());
  }
};

/** Ignore stale autocomplete responses when the user types quickly. */
let suggestionRequestId = 0;

figma.parameters.on("input", async ({ key, query, result }) => {
  if (key !== "name") return;

  const requestId = ++suggestionRequestId;

  const conn = await getConnection();
  if (!conn) {
    result.setSuggestions([
      { name: "Connect to Slack…", data: "__connect__" },
    ]);
    return;
  }

  try {
    result.setLoadingMessage("Loading emoji…");
    const catalog = await getEmojiCatalog(conn.teamId, conn.sessionToken);
    if (requestId !== suggestionRequestId) return;

    const matches = filterEmojiCatalog(catalog, query);
    if (matches.length === 0) {
      const q = normalizeEmojiName(query);
      result.setError(q ? `No emoji matching “${q}”` : "Type to search custom emoji");
      return;
    }

    // Set names + CORS-proxied iconUrl in one shot (Slack CDN blocks direct iconUrl).
    result.setSuggestions(buildEmojiSuggestions(matches, conn.sessionToken));
  } catch (err) {
    if (requestId !== suggestionRequestId) return;
    const message = err instanceof Error ? err.message : String(err);
    result.setError(message || MESSAGES.AUTH_FAILED);
  }
});

figma.on("run", async (event) => {
  const command = event.command || "open";
  // Capture immediately — the Quick Action UI keeps the mouse off the canvas.
  const anchor = getPlacementAnchor();
  pendingImportName = null;
  pendingImportStyle = "default";
  pendingImportAnchor = null;
  autoStartOauth = false;
  closeAfterHiddenConnect = false;

  if (command === "import-emoji" || command === "import-stamp") {
    const style: EmojiStyleKey = command === "import-stamp" ? "stamp" : "default";
    const name =
      event.parameters && typeof event.parameters.name === "string"
        ? event.parameters.name
        : "";

    if (name === "__connect__") {
      figma.notify(MESSAGES.CONNECT_TO_IMPORT);
      showHiddenConnectUi(undefined, style, anchor);
      return;
    }

    const conn = await getConnection();
    if (!conn) {
      figma.notify(MESSAGES.CONNECT_TO_IMPORT);
      showHiddenConnectUi(normalizeEmojiName(name) || undefined, style, anchor);
      return;
    }

    markUiNotReady();
    figma.showUI(__html__, { visible: false });
    await importOneEmoji(name, false, style, anchor);
    figma.closePlugin();
    return;
  }

  showPanel();
});
