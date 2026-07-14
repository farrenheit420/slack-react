# Slack React API

Small Next.js backend for the [Slack React](../plugin) Figma plugin.

Handles Slack OAuth (with Figma-style read/write key polling), stores workspace tokens in Supabase, and serves filtered emoji lookups.

## Setup

1. Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps)
   - **OAuth & Permissions → Redirect URLs**: `http://localhost:3000/auth/slack/callback`
   - **User Token Scopes**: `emoji:read`
2. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor.
3. Copy env vars:

```bash
cp .env.example .env.local
```

Fill in Slack + Supabase values (use the **service role** key for `SUPABASE_SERVICE_ROLE_KEY`).

4. Install and run:

```bash
cd api
npm install
npm run dev
```

API: `http://localhost:3000`

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/auth/slack/start` | Create read/write keys; return Slack authorize URL |
| `GET` | `/auth/slack/callback` | Slack redirects here; stores token; marks poll ready |
| `GET` | `/auth/slack/poll?key=` | Plugin polls until `{ teamId, teamName, sessionToken }` |
| `GET` | `/api/emoji/one?name=` | Auth session → one emoji `{ name, url }` (quota checked) |
| `GET` | `/api/emoji/list` | Pro only; free tier gets `402` + `{ upgrade: true }` |

CORS allows `*` so Figma’s null-origin plugin UI can call these routes.

## Deploy (Vercel)

1. Import the `api/` folder as a Vercel project (or deploy from repo root with Root Directory set to `api`).
2. Set the same env vars (with production `APP_BASE_URL` / `SLACK_REDIRECT_URI`).
3. Add the production callback URL in the Slack app Redirect URLs.
4. Add the Vercel hostname to the plugin’s `manifest.json` → `networkAccess.allowedDomains`.
