/** Backend base URL. Change to your Vercel deployment URL when deployed. */
export const API_BASE_URL = "https://emojibridge-api.farrenworks.com";

export const STORAGE_KEYS = {
  TEAM_ID: "teamId",
  TEAM_NAME: "teamName",
  SESSION_TOKEN: "sessionToken",
  EMOJI_SIZE: "emojiSize",
  EMOJI_CATALOG: "emojiCatalog",
} as const;

export const MESSAGE_TYPES = {
  // UI → main
  DISCONNECT: "disconnect",
  IMPORT_ONE: "import-one",
  GET_CONNECTION: "get-connection",
  UI_READY: "ui-ready",
  SAVE_OPTIONS: "save-options",
  RUN_OAUTH: "run-oauth",
  STAMP_MASK_PATH: "stamp-mask-path",
  STAMP_MASK_ERROR: "stamp-mask-error",
  // main → UI
  CONNECTION_STATE: "connection-state",
  OPTIONS_STATE: "options-state",
  IMPORT_RESULT: "import-result",
  STATUS: "status",
  START_OAUTH: "start-oauth",
  AUTH_ERROR: "auth-error",
  PROCESS_STAMP_MASK: "process-stamp-mask",
} as const;

/** Timeout waiting for the UI iframe to extract a stamp silhouette. */
export const STAMP_MASK_TIMEOUT_MS = 15_000;

/** Canvas box for the emoji artwork (px). Stamp adds padding around this. */
export const EMOJI_SIZES = {
  small: 48,
  medium: 96,
  large: 128,
} as const;

export type EmojiSizeKey = keyof typeof EMOJI_SIZES;

/** Placement style chosen by the Quick Action (not a Plugin Options setting). */
export type EmojiStyleKey = "default" | "stamp";

export type ImportOptions = {
  size: EmojiSizeKey;
};

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  size: "medium",
};

/** Padding on each side of stamp matte, as a fraction of the emoji box. */
export const STAMP_PADDING_RATIO = 0.1;

/** Max absolute rotation (degrees) applied to every stamp import. */
export const STAMP_ROTATION_MAX_DEG = 8;

/** How long to reuse a cached workspace emoji catalog before refetching. */
export const EMOJI_CATALOG_TTL_MS = 10 * 60 * 1000;

/**
 * While searching, refetch at most this often so newly added Slack emoji
 * appear without hammering the API on every keystroke.
 */
export const EMOJI_CATALOG_SEARCH_REFRESH_MS = 30 * 1000;

/** Max Quick Action suggestions shown while typing. */
export const EMOJI_SUGGESTION_LIMIT = 25;
