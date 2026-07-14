# Slack React plugin

Figma plugin that imports custom Slack emoji into a file as image layers.

## Load in Figma (development)

1. Install deps and build:

```bash
cd plugin
npm install
npm run build
```

2. In Figma Desktop: **Plugins → Development → Import plugin from manifest…**
3. Select `plugin/manifest.json`.
4. Run **Plugins → Development → Slack React → Open Slack React**.

## Quick Actions import

1. Press **⌘/** (Mac) or **Ctrl+/** (Windows).
2. Choose **Slack React → Import emoji…**
3. Type an exact custom emoji name (`this` or `:this:`) and press Enter.

## Backend

The plugin talks to [`../api`](../api). For local development the API is expected at `http://localhost:3000` (see `constants.ts`).

Connect flow: the plugin opens Slack OAuth in a browser tab, then polls the backend until authorization finishes.

## Network access

`manifest.json` allows:

- Your API host (`localhost:3000` in development via `devAllowedDomains`)
- Slack emoji CDNs (`emoji.slack-edge.com`, `a.slack-edge.com`)

Add your production Vercel domain to `networkAccess.allowedDomains` before publishing.
