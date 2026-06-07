# Fortis FM Site Inspector

Branded site inspection app for Fortis FM. Built with Express, React, Tailwind,
shadcn/ui, SQLite (via Drizzle ORM), Puppeteer for PDFs, and Claude (Anthropic)
for the optional AI features.

## What it does

- Site directory with per-site custom checklists
- Inspection flow: Pass / Fail / N/A with severity, photos, notes, observations
- Photo upload with camera or gallery, in-app annotation, voice to text notes
- Branded PDF reports with executive summary
- Issues tracker auto-created from failed items, with contractor email composer
- Recurring inspection scheduler
- PWA install with offline mode
- Push notifications (when VAPID keys configured)
- Dashboard analytics and CSV/Excel exports
- AI features (when ANTHROPIC_API_KEY configured): photo analysis with severity
  suggestion, rough note polish, executive summary on the PDF

## Stack

- Node 20, Express 4
- React 18, Vite, Tailwind CSS, shadcn/ui, Radix UI
- SQLite via better-sqlite3 + Drizzle ORM
- Puppeteer for PDF rendering
- Anthropic SDK for AI features

## Local development

```bash
npm install
cp .env.example .env
# Edit .env, set ANTHROPIC_API_KEY if you want AI features.
npm run dev
```

Open http://localhost:5000

Default login: `admin@fortisfm.com.au` / `Password123`

## Production deployment (Railway)

See `DEPLOY.md` for the full step-by-step.

Quick version:

1. Push this repo to GitHub.
2. Create a new Railway project, connect it to the GitHub repo.
3. Add a persistent volume mounted at `/data`.
4. Set env vars: `ANTHROPIC_API_KEY`, `VAPID_*` (optional).
5. Add the custom domain `inspect.fortisfm.com.au`, copy the CNAME target
   Railway gives you, paste it into SiteGround DNS.
6. Done. Railway redeploys on every `git push` to main.

## Environment variables

| Name | Required | Notes |
|------|----------|-------|
| `PORT` | yes | Railway sets this automatically. Local dev defaults to 5000. |
| `DATA_DIR` | yes | `/data` on Railway. Falls back to project root locally. |
| `NODE_ENV` | yes | `production` in production, `development` locally. |
| `ANTHROPIC_API_KEY` | no | Enables AI features. Get one at [console.anthropic.com](https://console.anthropic.com/settings/keys). |
| `VAPID_PUBLIC_KEY` | no | Enables web push. Generate with `npx web-push generate-vapid-keys`. |
| `VAPID_PRIVATE_KEY` | no | Same. |
| `VAPID_SUBJECT` | no | `mailto:` URL. Defaults to `mailto:admin@fortisfm.com.au`. |

## Project layout

```
client/         React app (Vite)
server/         Express server, route handlers, AI, PDF rendering
shared/         TypeScript types and Zod schemas shared by both sides
script/         Build script (esbuild bundling)
attached_assets/ Brand assets (logos) shipped inside the app bundle
data.db         SQLite database (gitignored, lives in DATA_DIR in prod)
uploads/        Photo storage (gitignored, lives in DATA_DIR in prod)
Dockerfile      Production container image
railway.json    Railway build and deploy config
```

## How updates work

After the first Railway deploy, every push to the `main` branch on GitHub
triggers an automatic Railway build and deploy. Zero downtime, takes about
60 seconds. Database and uploaded photos persist across deploys because they
live on the mounted volume, not in the container image.
