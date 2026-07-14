import { API_BASE_URL, MESSAGE_TYPES } from "./constants";
import { MESSAGES } from "./messages";

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 3 * 60 * 1000;

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

const connectBtn = $("connect-btn") as HTMLButtonElement;
const disconnectBtn = $("disconnect-btn") as HTMLButtonElement;
const importOneBtn = $("import-one-btn") as HTMLButtonElement;
const importAllBtn = $("import-all-btn") as HTMLButtonElement;
const emojiInput = $("emoji-name") as HTMLInputElement;
const disconnectedEl = $("disconnected");
const connectedEl = $("connected");
const teamNameEl = $("team-name");
const teamIdEl = $("team-id");
const messageEl = $("message");

let apiBaseUrl = API_BASE_URL;
let pollTimer: number | null = null;
let connecting = false;

function setMessage(text: string, kind: "ok" | "error" | "" = ""): void {
  messageEl.textContent = text;
  messageEl.classList.remove("ok", "error");
  if (kind) messageEl.classList.add(kind);
}

function setConnected(connected: boolean, teamName?: string | null, teamId?: string | null): void {
  disconnectedEl.classList.toggle("hidden", connected);
  connectedEl.classList.toggle("hidden", !connected);
  connectBtn.classList.toggle("hidden", connected);
  disconnectBtn.classList.toggle("hidden", !connected);
  if (connected) {
    teamNameEl.textContent = teamName ? `Connected to ${teamName}` : "Connected";
    teamIdEl.textContent = teamId ? `team_id: ${teamId}` : "";
  }
}

function postToPlugin(pluginMessage: Record<string, unknown>): void {
  parent.postMessage({ pluginMessage }, "*");
}

async function startOAuth(): Promise<void> {
  if (connecting) return;
  connecting = true;
  connectBtn.disabled = true;
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

    window.open(data.authUrl, "_blank");
    setMessage("Waiting for Slack authorization…");
    await pollForSession(data.readKey);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setMessage(message, "error");
  } finally {
    connecting = false;
    connectBtn.disabled = false;
    if (pollTimer != null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  }
}

function pollForSession(readKey: string): Promise<void> {
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (Date.now() - started > POLL_TIMEOUT_MS) {
        reject(new Error(MESSAGES.AUTH_TIMEOUT));
        return;
      }

      try {
        const res = await fetch(
          `${apiBaseUrl}/auth/slack/poll?key=${encodeURIComponent(readKey)}`
        );

        if (res.status === 202) return;

        const data = (await res.json()) as {
          teamId?: string;
          teamName?: string;
          sessionToken?: string;
          error?: string;
        };

        if (!res.ok) {
          reject(new Error(data.error || MESSAGES.AUTH_FAILED));
          return;
        }

        if (!data.teamId || !data.sessionToken) {
          reject(new Error(MESSAGES.AUTH_FAILED));
          return;
        }

        postToPlugin({
          type: MESSAGE_TYPES.CONNECT_RESULT,
          teamId: data.teamId,
          teamName: data.teamName || data.teamId,
          sessionToken: data.sessionToken,
        });
        setMessage(MESSAGES.CONNECTED(data.teamName || data.teamId), "ok");
        resolve();
      } catch (err) {
        // Ignore transient network errors while polling.
        if (Date.now() - started > POLL_TIMEOUT_MS) {
          reject(err instanceof Error ? err : new Error(MESSAGES.AUTH_FAILED));
        }
      }
    };

    void tick();
    pollTimer = window.setInterval(() => {
      void tick();
    }, POLL_INTERVAL_MS);
  });
}

connectBtn.addEventListener("click", () => {
  void startOAuth();
});

disconnectBtn.addEventListener("click", () => {
  postToPlugin({ type: MESSAGE_TYPES.DISCONNECT });
  setMessage(MESSAGES.DISCONNECTED);
});

importOneBtn.addEventListener("click", () => {
  const name = emojiInput.value;
  if (!name.trim()) {
    setMessage(MESSAGES.ENTER_EMOJI_NAME, "error");
    return;
  }
  setMessage(MESSAGES.IMPORTING(name.replace(/^:+|:+$/g, "")));
  postToPlugin({ type: MESSAGE_TYPES.IMPORT_ONE, name });
});

emojiInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    importOneBtn.click();
  }
});

importAllBtn.addEventListener("click", () => {
  // Locked Pro stub — still hits the API so free workspaces get a clear upgrade response.
  setMessage(MESSAGES.PRO_REQUIRED, "error");
  postToPlugin({ type: MESSAGE_TYPES.IMPORT_ALL });
});

window.onmessage = (event: MessageEvent) => {
  const msg = event.data && event.data.pluginMessage;
  if (!msg || !msg.type) return;

  if (msg.type === MESSAGE_TYPES.CONNECTION_STATE) {
    if (typeof msg.apiBaseUrl === "string" && msg.apiBaseUrl) {
      apiBaseUrl = msg.apiBaseUrl;
    }
    setConnected(!!msg.connected, msg.teamName, msg.teamId);
    return;
  }

  if (msg.type === MESSAGE_TYPES.IMPORT_RESULT) {
    setMessage(msg.message || "", msg.ok ? "ok" : "error");
  }
};

postToPlugin({ type: MESSAGE_TYPES.UI_READY });
