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

## Quick Actions

Press **⌘/** (Mac) or **Ctrl+/** (Windows), then choose:

| Command | What it does |
| --- | --- |
| **Import emoji…** | Search your Slack custom emoji as you type, then import as a plain image layer. If no workspace is connected, Slack OAuth starts first. |
| **Import as stamp…** | Same search, but places a FigJam-style stamp (white matte + slight random tilt). |
| **Plugin Options** | Connect / disconnect, and default import size |

## Backend

The plugin talks to [`../api`](../api). For local development the API is expected at `http://localhost:3000` (see `constants.ts`).

## Network access

`manifest.json` allows:

- Your API host (`localhost:3000` in development via `devAllowedDomains`)
- Slack emoji CDNs (`emoji.slack-edge.com`, `a.slack-edge.com`)

Add your production Vercel domain to `networkAccess.allowedDomains` before publishing.
