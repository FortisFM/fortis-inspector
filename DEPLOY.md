# Deployment runbook - Fortis FM Site Inspector

This is the step-by-step to get the app live at `inspect.fortisfm.com.au` on
Railway. Plan for about 45 minutes start to finish.

## Before you start

You need:

- A GitHub account (free at [github.com](https://github.com/signup))
- A Railway account (sign up with GitHub at [railway.com](https://railway.com))
- A fresh Anthropic API key (the one shared earlier in chat is compromised and
  must be revoked - see step 4)
- Access to the SiteGround DNS panel for `fortisfm.com.au`
- A credit card for Railway (they bill in USD, ~$5 USD per month)

## Step 1 - Push the code to GitHub (10 min)

1. Go to [github.com/new](https://github.com/new).
2. Repository name: `fortis-inspector` (or whatever you prefer).
3. Set it to **Private**.
4. Do not tick any of the "Initialize with" boxes. We want an empty repo.
5. Click **Create repository**.
6. GitHub shows you commands like `git remote add origin git@github.com:...`. Copy that remote URL.
7. Reply in this chat with "ready to push to github, repo url is [paste url]". I will push the code for you and confirm when done.

## Step 2 - Create the Railway project (10 min)

1. Go to [railway.com/new](https://railway.com/new).
2. Click **Deploy from GitHub repo**.
3. Authorise Railway to access your GitHub if prompted.
4. Pick the `fortis-inspector` repo you just created.
5. Railway will start building immediately. The first build takes about 5 minutes (installing Chrome takes the longest).
6. While it builds, click **Settings** in the top right of the service.
7. Under **Networking**, click **Generate Domain**. Railway gives you a `*.up.railway.app` URL. The app will be reachable here once the build finishes.

## Step 3 - Add the persistent volume (5 min)

This is what keeps photos and the database safe across deploys.

1. In your Railway project, click **+ New** in the top right.
2. Choose **Volume**.
3. Connect it to the `fortis-inspector` service.
4. Mount path: `/data`
5. Size: 1 GB to start (you can grow it later in two clicks).
6. Click **Add**.
7. Railway will redeploy the service. Wait for the green tick.

## Step 4 - Add environment variables (5 min)

1. **Revoke the old Anthropic key first**: go to [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys), find the key shared earlier in chat, click Disable.
2. Click **Create Key**. Name it "Fortis Inspector Production". Copy it immediately, you will not see it again.
3. Add billing: [console.anthropic.com/settings/billing](https://console.anthropic.com/settings/billing). Add $10 to start.
4. In Railway, click your service, then **Variables** tab.
5. Click **+ New Variable**. Add these one at a time:

   | Name | Value |
   |------|-------|
   | `ANTHROPIC_API_KEY` | the new key from step 2 |
   | `DATA_DIR` | `/data` |
   | `NODE_ENV` | `production` |

6. Railway redeploys automatically after each variable. Wait for the green tick.

## Step 5 - Test on the Railway URL (5 min)

1. Click the `*.up.railway.app` URL Railway gave you.
2. You should see the Fortis FM login screen.
3. Log in with `admin@fortisfm.com.au` / `Password123`.
4. **Immediately change the admin password** via Settings.
5. Create a test site, run a quick inspection, generate a PDF. Confirm everything works.
6. If the AI buttons appear (they only show when the key is set), test the photo analysis on a photo.

If anything looks broken, send me a screenshot in chat and I will fix it before we move to the custom domain.

## Step 6 - Wire up the custom domain (10 min)

### In Railway

1. In your service, click **Settings**, then **Networking**.
2. Click **Custom Domain**.
3. Enter `inspect.fortisfm.com.au`.
4. Railway shows you a CNAME target like `something.up.railway.app`. Copy this exactly.

### In SiteGround

1. Log into SiteGround.
2. Go to **Websites** > select fortisfm.com.au > **Site Tools** > **Domain** > **DNS Zone Editor**.
3. Click **Add Record**.
4. Type: **CNAME**
5. Name: `inspect`
6. Points to: (paste the Railway CNAME target)
7. TTL: leave default
8. Save.

### Wait for DNS

DNS propagation usually takes 5 to 30 minutes. Sometimes up to a few hours. You can check progress at [dnschecker.org](https://dnschecker.org/) by searching for `inspect.fortisfm.com.au`.

Once Railway shows a green tick next to the custom domain, the app is live at `https://inspect.fortisfm.com.au` with automatic HTTPS.

## Step 7 - Install the app on phones

For yourself and each staff member:

### iPhone

1. Open Safari and go to `inspect.fortisfm.com.au`.
2. Log in.
3. Tap the **Share** icon (square with up arrow).
4. Tap **Add to Home Screen**.
5. The Fortis FM icon now sits on the home screen like any app.

### Android

1. Open Chrome and go to `inspect.fortisfm.com.au`.
2. Log in.
3. Tap the **three dot menu** (top right).
4. Tap **Add to Home Screen** or **Install app**.

## Step 8 - Create user accounts for staff

1. Log in as admin.
2. Go to **Settings** > **Users** (or wherever the user management lives, ask me if you cannot find it - we may need to add a UI for this).
3. Create a user for each inspector with their email and a starting password.
4. Send them the login URL and credentials.

## Ongoing - making updates

Day to day operation (sites, checklists, inspections, users) all happens through the app, no developer needed.

For code changes (new features, layout tweaks, bug fixes):

1. You ask me what you want changed.
2. I make the change in the code.
3. I commit and push to the GitHub repo.
4. Railway sees the push and deploys automatically within 60 seconds.
5. Done, no action needed from you.

## Troubleshooting

### Build fails on Railway

Most common cause: the Dockerfile build runs out of memory on Railway's free trial. Upgrade to Hobby plan ($5/month) and it builds fine. You will likely need this anyway for the volume.

### Custom domain shows "not secure" or fails to load

DNS has not propagated yet. Wait 30 minutes and try again. If still broken after a few hours, check the CNAME record at SiteGround matches what Railway showed you exactly, no typos.

### App loads but login fails

Check the Railway logs (click your service > **Deployments** > latest > **View Logs**). The login route logs every attempt. If you see "Unauthorized" the password is wrong. If you see a 500 error, send me the log.

### Photos do not save

Volume is probably not mounted. In Railway, click the service > **Settings** > **Volumes** and confirm `/data` is mounted. Re-deploy if you just added the volume.

### AI buttons do not appear

`ANTHROPIC_API_KEY` is not set or is wrong. Re-check the Variables tab in Railway. The app logs `[ai] AI features enabled` on boot when the key is detected, check the deploy logs.

## What this costs you monthly

| Item | Cost (USD) | Cost (AUD approx) |
|------|------------|-------------------|
| Railway Hobby plan | $5 | $8 |
| Anthropic API (typical usage) | $5 to $15 | $8 to $25 |
| Domain (already owned) | $0 | $0 |
| **Total** | **$10 to $20 USD** | **$15 to $33 AUD** |

Railway gives you $5 of usage credit each month included in the $5 Hobby plan, so for normal traffic the $5 covers everything. You only pay more if usage spikes.
