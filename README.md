# Fortis FM Site Inspector

A branded, mobile-first web app for **Fortis FM** (Facilities Management Specialists, Brisbane) to run on-site facility inspections, capture photos, auto-generate branded PDF reports, and track maintenance issues across multiple sites.

Built on Express + Vite + React + TypeScript + Tailwind + shadcn/ui, with a server-side **SQLite** database (via `better-sqlite3`) for persistence. Branded with the Fortis FM navy palette (`#090b38`), Georgia serif headings, and Montserrat body text.

---

## 1. Login

The app opens to a sign-in screen. A single administrator account is pre-seeded:

| Field | Value |
|-------|-------|
| Email | `admin@fortisfm.com.au` |
| Password | `Password123` |

The email field is pre-filled for convenience — just enter the password and click **Sign in**.

> **Security note:** Authentication uses a server-issued bearer token held **only in React memory** (no `localStorage`, `sessionStorage`, `IndexedDB`, or cookies are used in the browser, by design). Refreshing the page signs you out and you log back in. Passwords are stored bcrypt-hashed in SQLite. Change the seeded password before production use (see *Changing the admin password* below).

---

## 2. Add a site

1. From the **Sites** list (home screen), click **Add site**.
2. Enter the site name, address, and optional client contact (name / email / phone) and notes.
3. Save. The new site appears in the list with counts for checklist items, inspections, and open issues.

Each site card shows a red **"N open"** indicator when it has unresolved maintenance issues.

---

## 3. Build a checklist for a site

Open a site, then use the **Checklist** tab:

- **Add item** — create a checklist line. Set its **section** (e.g. *Fire Safety*, *Common Areas*, *Exterior*), a **label**, and whether a **photo is required** when the item is not marked N/A.
- **Reorder** items within a section using the up/down arrows.
- **Edit / delete** any item with the inline icons.
- **Duplicate from another site** — copy an existing site's checklist as a starting point (handy when standardising inspections across the portfolio).

Items are grouped by section, and the section headings flow through to both the live inspection form and the PDF report.

---

## 4. Run an inspection

1. Open a site and click **Start inspection** (top right). This creates a draft inspection and opens the mobile-optimised inspection form.
2. The form lists every checklist item grouped by section. For each item, tap **Pass**, **Fail**, or **N/A**.
   - When you mark an item **Fail**, a **Severity** selector appears (*Info / Minor / Moderate / Urgent*) — this is required.
   - Add an optional **note** and tap **Add photo** to capture or upload one or more photos (the device camera opens on mobile). Photos are resized server-side to max 1600px JPEG.
   - Items flagged *photo required* must have a photo before you can submit (unless marked N/A).
3. Add free-form **Observations** at the bottom — these are issues not tied to a specific checklist line (give each a short title and severity).
4. Optionally record **Weather / conditions**, **General notes**, and confirm the **Inspector** name.
5. **Save draft** to come back later, or **Submit** to finalise.

On submit the app:
- Locks the inspection,
- **Auto-creates maintenance issues** for every failed item and observation with severity *Minor* or higher (Info-level items are recorded but do not raise an issue), and
- **Generates the branded PDF report**.

---

## 5. View and download the PDF report

After submitting (or from a site's **Inspections** tab → open an inspection) you land on the **Inspection Report** page:

- **Web report** — opens the full HTML report in a new tab (`/api/inspections/:id/report.html`).
- **Download PDF** — downloads the branded PDF (`/api/inspections/:id/pdf`), filename `fortis-fm-inspection-<site>-<YYYY-MM-DD>.pdf`.

The PDF is a multi-page document: a branded cover page, site details, the full checklist with Pass/Fail/Severity badges and embedded photos, observations, and a final **"Maintenance Items Requiring Attention"** summary with signature lines. Every page footer shows:

> **Fortis FM · (07) 3472 7579 · admin@fortisfm.com.au**

(No postal address is included, by design.)

PDF rendering uses headless Chromium via Puppeteer on the server.

---

## 6. Manage issues

The **Issues** tab is a portfolio-wide dashboard of every maintenance item raised across all sites.

- **Filter** by site, severity, and status (*Open & in progress* / *All* / *Resolved*).
- **Urgent issues older than 7 days** are highlighted with a red ring so nothing slips.
- Click any issue to open its **detail** page, where you can:
  - See the site, section, details, photos, severity, and age.
  - **Update status** (Open → In progress → Resolved) via the status selector.
  - **Mark resolved** with a resolution note.
  - **Email contractor** — opens a composer pre-filled with a professional message (site, address, item, severity, details). See the next section about wiring real email.

---

## 7. Wiring real Microsoft 365 email (currently a placeholder)

The **Email contractor** dialog currently lets you **Copy** the drafted message or **Open in mail app** (a `mailto:` link). Real automated sending is **not** wired in this MVP. To enable server-side sending via your Microsoft 365 / Outlook account, choose one of:

### Option A — SMTP with an app password (simplest)
1. In Microsoft 365, enable SMTP AUTH for the mailbox and create an **app password** (requires MFA on the account).
2. Install nodemailer: `npm install nodemailer`.
3. Add a server route, e.g. `POST /api/issues/:id/email`, that uses:
   ```ts
   import nodemailer from "nodemailer";
   const transporter = nodemailer.createTransport({
     host: "smtp.office365.com",
     port: 587,
     secure: false,
     auth: { user: process.env.M365_USER, pass: process.env.M365_APP_PASSWORD },
   });
   await transporter.sendMail({ from: process.env.M365_USER, to, subject, text });
   ```
4. Set `M365_USER` (e.g. `admin@fortisfm.com.au`) and `M365_APP_PASSWORD` as environment variables.
5. In `client/src/pages/IssueDetail.tsx`, replace the Copy/mailto buttons in the email dialog with a call to the new endpoint.

### Option B — Microsoft Graph API (recommended for org-wide use)
1. Register an app in **Entra ID (Azure AD)** and grant the application permission **Mail.Send**.
2. Install `@azure/identity` and `@microsoft/microsoft-graph-client`.
3. Acquire a token with `ClientSecretCredential` (`TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET`) and call:
   ```
   POST https://graph.microsoft.com/v1.0/users/admin@fortisfm.com.au/sendMail
   ```
   with the message JSON body.
4. Wire the same `POST /api/issues/:id/email` route to call Graph, and update the front-end dialog as above.

Graph is preferred for production because it avoids storing a mailbox password and supports proper sender identity and audit logging.

---

## 8. Local development

```bash
npm install
npm run dev        # starts Vite + Express on http://localhost:5000
```

The SQLite database file (`data.db`) is created automatically on first run and the admin user is seeded. To reset all data, stop the server and delete `data.db`, `data.db-wal`, `data.db-shm`.

### Changing the admin password
The admin is seeded in `server/storage.ts` (`seedAdmin()`). To change it, update the password there before first run, or add a small one-off script that calls `storage.updateUserPassword(...)`. For a deployed instance, change it via a server script and redeploy.

### Production build
```bash
npm run build      # builds client → dist/public and server → dist/index.cjs
NODE_ENV=production node dist/index.cjs   # serve on port 5000
```

---

## 9. Deploying to your own Vercel + DNS (inspect.fortisfm.com.au)

This app has a **stateful Node/Express server** with a local SQLite file and headless-Chromium PDF generation. That combination does **not** run on Vercel's default serverless functions (no persistent disk, no bundled Chromium, execution time limits). You have two realistic paths:

### Path A — Run the full app on a persistent host, point DNS at it (recommended)
Use a host that gives you a long-running Node process and a disk, e.g. **Railway**, **Render**, **Fly.io**, or a small VPS.

1. Push this repo to GitHub.
2. Create a new service on the host from the repo. Build command `npm run build`, start command `node dist/index.cjs`, and set `NODE_ENV=production`.
3. Ensure the host allows Puppeteer's Chromium (most do; on slim images you may need `apt-get install -y chromium` and set `PUPPETEER_EXECUTABLE_PATH`, or keep the bundled Chromium that `npm install` downloads).
4. Attach a **persistent volume** so `data.db` and uploaded photos survive restarts.
5. The host gives you a public URL. In your DNS provider for **fortisfm.com.au**, add a **CNAME** record:
   ```
   inspect   CNAME   <your-host-target>.   (e.g. your-app.up.railway.app)
   ```
   (or an **A** record pointing to the host's IP if it gives you one).
6. Add `inspect.fortisfm.com.au` as a custom domain in the host's dashboard so it provisions an HTTPS certificate.

### Path B — Static front-end on Vercel + API elsewhere
If you specifically want Vercel for the front-end:
1. Deploy `dist/public` as a static site on Vercel (framework preset *Other*, output dir `dist/public`).
2. Host the Express API + SQLite + PDF service on a persistent host (as in Path A).
3. Point the front-end's `API_BASE` at the API host, and set CORS on the server.
4. Add the **CNAME** for `inspect.fortisfm.com.au` to whichever surface you want users to hit (Vercel for the SPA, or the API host).

> **Tip:** Because the front-end deliberately keeps the auth token in memory (no cookies/localStorage), it is iframe- and embed-safe and has no cross-site cookie concerns.

---

## 10. Project structure

```
fortis-inspector/
├── shared/schema.ts          # Drizzle/SQLite schema + zod insert schemas + severity helpers
├── server/
│   ├── storage.ts            # SQLite CRUD layer + seedAdmin() (bcrypt)
│   ├── routes.ts             # Auth, sites, checklists, inspections, photos, issues, PDF + syncIssues()
│   └── report.ts             # buildReportHtml() + PDF header/footer templates
├── client/src/
│   ├── lib/{auth.tsx,queryClient.ts,badges.tsx}
│   ├── components/{AppLayout,PageHeader,PhotoUploader}.tsx
│   ├── pages/{Login,Sites,SiteDetail,SiteEdit,RunInspection,ViewInspection,Issues,IssueDetail,Settings}.tsx
│   ├── index.css             # Brand theme (navy #090b38, white bg, Montserrat/Georgia)
│   └── App.tsx               # AuthProvider + hash router
├── attached_assets/          # logo-navy-on-white.jpg, logo-white-on-navy.jpg
└── uploads/                  # inspection photos (created at runtime)
```

---

*Fortis FM · (07) 3472 7579 · admin@fortisfm.com.au*
