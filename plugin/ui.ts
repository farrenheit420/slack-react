import { API_BASE_URL, MESSAGE_TYPES, type EmojiSizeKey } from "./constants";
import { MESSAGES } from "./messages";

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

const connectBtn = $("connect-btn") as HTMLButtonElement;
const disconnectBtn = $("disconnect-btn") as HTMLButtonElement;
const disconnectedEl = $("disconnected");
const connectedEl = $("connected");
const teamNameEl = $("team-name");
const messageEl = $("message");
const sizeButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-size]")
);

let apiBaseUrl = API_BASE_URL;
let connecting = false;
let currentSize: EmojiSizeKey = "medium";

function setMessage(text: string, kind: "ok" | "error" | "" = ""): void {
  messageEl.textContent = text;
  messageEl.classList.remove("ok", "error");
  if (kind) messageEl.classList.add(kind);
}

function setConnected(connected: boolean, teamName?: string | null): void {
  disconnectedEl.classList.toggle("hidden", connected);
  connectedEl.classList.toggle("hidden", !connected);
  if (connected) {
    teamNameEl.textContent = teamName ? `Connected to ${teamName}` : "Connected";
    connecting = false;
    connectBtn.disabled = false;
  }
}

function setConnectingUi(isConnecting: boolean): void {
  connecting = isConnecting;
  connectBtn.disabled = isConnecting;
}

function postToPlugin(pluginMessage: Record<string, unknown>): void {
  parent.postMessage({ pluginMessage }, "*");
}

function saveOptions(): void {
  postToPlugin({
    type: MESSAGE_TYPES.SAVE_OPTIONS,
    size: currentSize,
  });
}

function syncOptionsUi(): void {
  for (const btn of sizeButtons) {
    btn.setAttribute("aria-pressed", String(btn.dataset.size === currentSize));
  }
}

async function startOAuth(): Promise<void> {
  if (connecting) return;
  setConnectingUi(true);
  setMessage("Opening Slack…");

  try {
    const res = await fetch(`${apiBaseUrl}/auth/slack/start`, { method: "POST" });
    const data = (await res.json()) as {
      authUrl?: string;
      readKey?: string;
      error?: string;
    };

    if (!res.ok || !data.authUrl || !data.readKey) {
      throw new Error(data.error || MESSAGES.AUTH_FAILED);
    }

    setMessage("Waiting for Slack authorization…");
    // Main thread opens browser + polls (iframe timers are suspended while Figma is in background).
    postToPlugin({
      type: MESSAGE_TYPES.RUN_OAUTH,
      authUrl: data.authUrl,
      readKey: data.readKey,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setMessage(message, "error");
    setConnectingUi(false);
  }
}

for (const btn of sizeButtons) {
  btn.addEventListener("click", () => {
    const size = btn.dataset.size as EmojiSizeKey;
    if (!size || size === currentSize) return;
    currentSize = size;
    syncOptionsUi();
    saveOptions();
  });
}

disconnectBtn.addEventListener("click", () => {
  setConnectingUi(false);
  postToPlugin({ type: MESSAGE_TYPES.DISCONNECT });
  setMessage("");
  setConnected(false);
});

connectBtn.addEventListener("click", () => {
  void startOAuth();
});

window.onmessage = (event: MessageEvent) => {
  const msg = event.data && event.data.pluginMessage;
  if (!msg || !msg.type) return;

  if (msg.type === MESSAGE_TYPES.CONNECTION_STATE) {
    if (typeof msg.apiBaseUrl === "string" && msg.apiBaseUrl) {
      apiBaseUrl = msg.apiBaseUrl;
    }
    setConnected(!!msg.connected, msg.teamName);
    if (msg.connected) {
      setMessage("");
    }
    return;
  }

  if (msg.type === MESSAGE_TYPES.OPTIONS_STATE) {
    if (msg.size === "small" || msg.size === "medium" || msg.size === "large") {
      currentSize = msg.size;
    }
    syncOptionsUi();
    return;
  }

  if (msg.type === MESSAGE_TYPES.START_OAUTH) {
    void startOAuth();
    return;
  }

  if (msg.type === MESSAGE_TYPES.AUTH_ERROR) {
    setConnectingUi(false);
    setMessage(msg.error || MESSAGES.AUTH_FAILED, "error");
    return;
  }

  if (msg.type === MESSAGE_TYPES.IMPORT_RESULT) {
    setMessage(msg.message || "", msg.ok ? "ok" : "error");
  }
};

syncOptionsUi();
postToPlugin({ type: MESSAGE_TYPES.UI_READY });
