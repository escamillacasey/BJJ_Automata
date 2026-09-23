# BJJ Automata

A-game worksheet → flowchart → finish-path analysis. Model your jiu-jitsu as a finite automaton (positions = states, techniques = transitions) and see strongest chains, limiting factors, and dead ends.

**Live (GitHub Pages):** https://escamillacasey.github.io/BJJ_Automata/

Repo is **public** (required for GitHub Pages on free accounts).

## For testers

1. Open the Pages URL.
2. Click **Sign in with Google**.
3. Fill top moves per seat + belt weight — the sheet **autosaves** to your Google account.
4. On another device, sign in with the same Google account to restore.

## Local development

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
npm install
cp .env.example .env.local   # Supabase URL + publishable key + admin password
npm run dev
```

Without `.env.local`, the app still runs and autosaves in **localStorage** only.

## Deploy (GitHub Pages)

1. Repo secrets (Settings → Secrets and variables → Actions):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_ADMIN_PASSWORD`
2. Enable Pages: Settings → Pages → Source = **GitHub Actions**.
3. Push to `main` (or run **Deploy GitHub Pages**).
4. Site: `https://<user>.github.io/BJJ_Automata/`

## Supabase + Google Auth (one time)

1. SQL Editor → run [`supabase/schema.sql`](supabase/schema.sql) (or at least [`supabase/google-auth.sql`](supabase/google-auth.sql) for `user_id`).
2. **Authentication → Providers → Google**: enable and paste Client ID + Client Secret from Google Cloud.
3. Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client:
   - Application type: Web
   - Authorized JavaScript origins:
     - `http://127.0.0.1:5173`
     - `https://escamillacasey.github.io`
   - Authorized redirect URIs:
     - `https://<project-ref>.supabase.co/auth/v1/callback`
4. Supabase → Authentication → URL configuration:
   - Site URL: `https://escamillacasey.github.io/BJJ_Automata/`
   - Redirect URLs: include `https://escamillacasey.github.io/BJJ_Automata/**` and `http://127.0.0.1:5173/**`

Each Google account maps to one worksheet row via `user_id`.

## Admin (coach)

Toolbar → **Admin**. Unlock with `VITE_ADMIN_PASSWORD`.

- Dropdown of every cloud sheet
- Submissions + full gameplan
- **Open flowchart** for that athlete

## Analysis (flowchart view)

1. **Best path** — highest minimum belt on a chain to Submission.
2. **Limiting factors** — weak links, funnels, missing bridges.
3. **Weaknesses** — seats with no outbound or no finish path.
