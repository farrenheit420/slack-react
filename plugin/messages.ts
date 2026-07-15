export const MESSAGES = {
  NOT_CONNECTED: "Connect a Slack workspace in Plugin Options first.",
  CONNECT_TO_IMPORT: "Connect to Slack to import…",
  CONNECTED: (team: string) => `Connected to ${team}`,
  DISCONNECTED: "Disconnected from Slack.",
  IMPORTING: (name: string) => `Importing :${name}:…`,
  IMPORTED: (name: string) => `Imported :${name}:`,
  NOT_FOUND: (name: string) => `No custom emoji named :${name}:`,
  AUTH_FAILED: "Slack connection failed. Try again.",
  AUTH_TIMEOUT: "Slack connection timed out. Try again.",
  ERROR_PREFIX: "Error: ",
  ENTER_EMOJI_NAME: "Enter an emoji name (e.g. this or :this:).",
} as const;
