# Slack React

Import custom Slack emoji into Figma as image layers.

| Folder | What it is |
| --- | --- |
| [`plugin/`](plugin/) | Figma plugin (TypeScript, plain HTML UI) |
| [`api/`](api/) | Next.js backend (Slack OAuth + emoji APIs, Vercel + Supabase) |

## Quick start

### 1. Backend

```bash
cd api
cp .env.example .env.local
# Fill Slack + Supabase values, run supabase/schema.sql in Supabase
npm install
npm run dev
```

### 2. Plugin

```bash
cd plugin
npm install
npm run build
```

In Figma Desktop: **Plugins → Development → Import plugin from manifest…** → select `plugin/manifest.json`.

## Docs

- Plugin details: [`plugin/README.md`](plugin/README.md)
- API + Slack/Supabase setup: [`api/README.md`](api/README.md)
