# Cross Core Ops Suite v8

The unified operations portal for Cross Core. It gives employees, PMs, HR and leadership one portal, with logins and real-time updates.

```
public/index.html                   the portal
public/config.js                    written automatically by Vercel (leave as is)
scripts/write-config.js             turns Vercel environment variables into config.js
supabase/schema.sql                 one-time database setup
supabase/functions/cc-admin/        account helper (HR creates logins and temporary passwords)
vercel.json, package.json           deploy settings
```

## Go live with GitHub, Vercel and Supabase (about 20 minutes, done once)

### A. Database (Supabase)
1. Go to supabase.com and click **New project**. The free plan is fine. Choose the **Singapore** region.
2. Open **SQL Editor → New query**, paste all of `supabase/schema.sql`, and click **Run**.
3. Open **Edge Functions → Deploy a new function → Via Editor**. Name it `cc-admin`, paste `supabase/functions/cc-admin/index.ts`, and click **Deploy**.
4. Open **Authentication → Sign In / Providers** and switch off **Allow new users to sign up**.
5. Open **Authentication → Users → Add user**. Enter `paul.crosscore@gmail.com` and a temporary password, and tick **Auto confirm**.
6. Open **Project Settings → API** and keep the **Project URL** and the **anon public** key handy for step C.

### B. Code (GitHub)
1. On github.com, click **New repository**. Name it `crosscore-ops-suite`, set it to **Private**, and click **Create**.
2. Click **uploading an existing file**. Drag in everything from this folder: `public`, `scripts`, `supabase`, `package.json`, `vercel.json`, `README.md`.
3. Click **Commit changes**.

### C. Hosting (Vercel)
1. On vercel.com, click **Add New → Project** and **Import** `crosscore-ops-suite`.
2. Leave Framework Preset as **Other**. The build settings come from `vercel.json`.
3. Open **Environment Variables** and add both of these:
   - `SUPABASE_URL` = your Project URL
   - `SUPABASE_ANON_KEY` = your anon public key
4. Click **Deploy**. Your portal will be at an address like `crosscore-ops-suite.vercel.app`. You can add your own domain under **Settings → Domains**.

### D. First sign-in
1. Pau signs in with the temporary password and sets his own password.
2. The portal offers to load the v7.2 records. Choose **Team, clients & brand kits**.
3. In **Employees & Accounts**, Pau clicks **Temp password** for Luane (HR). From then on, HR issues temporary passwords to everyone. Each person must change theirs the first time they sign in.

## What's new
- **Every chat** (groups, client chats and private messages) can now share photos, screenshots (paste with Ctrl/⌘+V or drag them in), documents and videos. Photos and videos show and play inside the chat.
- **📹 Built-in video calls** in every chat, with mute, camera and screen sharing. The call window floats, so the chat stays usable. A call moves to **Google Meet** automatically when it reaches the time limit, when too many people join, or when the connection isn't reliable. Everyone gets a **Join Google Meet** button and a notification.
- **Company group chats:** Core Team, Marketing Team, Company Executive Heads and Finance. System administrators and HR can edit members or create new groups in Messages. The groups are pinned in the sidebar and at the top of Messages for the core team and company heads. Anyone can pin or unpin a chat.
- **JA is a System Administrator,** alongside Pau (Super Administrator). Both can open Administration.
- **Lead Generation is organized by client.** Each client has its own search criteria, automatic search, LinkedIn links, uploaded files, lead list and standard connection note.
- **Search Automatic Leads.** Finds public LinkedIn profiles that match the client's criteria (free with a Tavily key, see step E).
- **Upload LinkedIn links.** Upload an Excel, CSV, Word, PDF or text file, or paste links.
- **Connection note on every lead.** Each lead has an editable note, and each client has a standard template. Clicking a lead opens its LinkedIn profile and copies the note.
- **New client registration → Endorse to HR → HR onboarding.** HR can adjust the team before onboarding. Completing onboarding creates the group chat with a welcome message that tags the PM and each team member.
- **@tags in group chats.** Type @ to tag someone. Tagged people are notified.

If you already ran `schema.sql` and deployed `cc-admin` before this update, run `schema.sql` again (it is safe to re-run) and redeploy `cc-admin` with the new file. Otherwise just follow the steps below.

### E. Automatic lead search (optional, free, about 5 minutes)
1. Go to **tavily.com**, sign up (no credit card needed), and copy your **API key** (it starts with `tvly-`). You get 1,000 free searches every month.
2. In the portal, Pau opens **Administration → Automatic lead search**, chooses **Tavily**, pastes the key, and clicks **Save**.
3. VAs can now click **🔍 Search Automatic Leads** in Lead Generation. Without a key, they can still run the same search on Google and paste the results, which is also free.

The key is stored in Supabase and never sent to anyone's browser. Serper (Google results, 2,500 free once) and Brave are also supported if you ever want to switch.

### F. Automatic Google Meet links for video calls (optional, about 10 minutes)
Built-in calls work without this step. This step lets the portal create a Google Meet link by itself when a call needs to move. Without it, the portal uses the standby Meet links you list in Administration, or asks someone to paste a link.
1. Go to **console.cloud.google.com** and create a project (for example "Cross Core Portal").
2. Open **APIs & Services → Library**, search for **Google Meet REST API**, and click **Enable**.
3. Open **APIs & Services → OAuth consent screen**:
   - Pick **External** (or **Internal** if you use Google Workspace).
   - Enter an app name and your email.
   - Add the scope `.../auth/meetings.space.created`.
   - Click **Publish app** so the connection doesn't expire after 7 days.
4. Open **Credentials → Create credentials → OAuth client ID → Web application**. Under **Authorized redirect URIs**, add your portal address exactly as Administration shows it, for example `https://crosscore-ops-suite.vercel.app/`.
5. Copy the **Client ID** and **Client secret**. In the portal, Pau or JA opens **Administration → Video calls**, pastes both, clicks **Save client**, then **Connect Google account**, and signs in with the company Google account.
   - Google may warn that the app isn't verified. Click **Advanced → Continue**. Only the person connecting sees this, and only once.

Meet links are created by that account and set so anyone with the link can join, so nobody waits to be let in.

## Updating the portal later
Replace `public/index.html` in GitHub (**Add file → Upload files**, then commit). Vercel redeploys automatically within a minute. Everyone keeps their data, because it lives in Supabase and not in the file.

## Demo mode
If the environment variables are missing, or the file is opened straight from a computer, the portal runs in demo mode. No password is needed, data stays in that one browser, and **Preview as** switches between people.
