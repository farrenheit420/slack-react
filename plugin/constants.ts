/** Backend base URL. Change to your Vercel deployment URL when deployed. */
export const API_BASE_URL = "http://localhost:3000";

export const FREE_TIER_LIMIT = 50;

export const STORAGE_KEYS = {
  TEAM_ID: "teamId",
  TEAM_NAME: "teamName",
  SESSION_TOKEN: "sessionToken",
} as const;

export const MESSAGE_TYPES = {
  // UI → main
  CONNECT_RESULT: "connect-result",
  DISCONNECT: "disconnect",
  IMPORT_ONE: "import-one",
  IMPORT_ALL: "import-all",
  GET_CONNECTION: "get-connection",
  UI_READY: "ui-ready",
  // main → UI
  CONNECTION_STATE: "connection-state",
  IMPORT_RESULT: "import-result",
  STATUS: "status",
} as const;

export const EMOJI_SIZE = 64;
