# BJJ Automata

A-game worksheet → flowchart → finish-path analysis. Model your jiu-jitsu as a finite automaton (positions = states, techniques = transitions) and see strongest chains, limiting factors, and dead ends.

**Live (GitHub Pages):** https://escamillacasey.github.io/BJJ_Automata/

## Beta testers (friends)

1. Open the live URL.
2. **Sign in with Google** (use the Gmail you were invited with if the OAuth app is in Testing mode).
3. Fill top moves per seat + belt weight — it **autosaves**.
4. Open **Flowchart** for best path / weak links.
5. Avoid **New sheet** unless you intend to wipe your cloud save.
6. Ignore **Admin** — that’s coach-only.

Sheets are a trusted-gym notebook, not a private vault (the site key can read all rows). Don’t put secrets in notes.

## Local development

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
npm install
cp .env.example .env.local   # Supabase URL + publishable key + admin password
npm run dev
```

Without `.env.local`, the app still runs and autosaves in **localStorage** only.

## Deploy (GitHub Pages)

1. Repo secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_ADMIN_PASSWORD`
2. Pages → Source = **GitHub Actions**
3. Push to `main`

## Supabase + Google Auth (one time)

1. SQL Editor → [`supabase/schema.sql`](supabase/schema.sql), then [`supabase/google-auth.sql`](supabase/google-auth.sql)
2. Before sharing: run [`supabase/beta-harden.sql`](supabase/beta-harden.sql) (blocks anonymous writes)
3. Auth → Providers → **Google** + Client ID/Secret from Google Cloud
4. Google OAuth client redirect: `https://<project-ref>.supabase.co/auth/v1/callback`
5. Auth → URL configuration Site URL = Pages URL; Redirect URLs include that path `/**`
6. Google Cloud consent screen → **Testing** → add tester Gmail addresses

Each Google account maps to one worksheet via `user_id`.

## Admin (coach)

Toolbar → **Admin**. Unlock with `VITE_ADMIN_PASSWORD` (light gate — password is in the client build). Don’t share it with testers.

## Analysis (flowchart view)

1. **Best path** — highest minimum belt on a chain to Submission.
2. **Limiting factors** — weak links, funnels, missing bridges.
3. **Weaknesses** — seats with no outbound or no finish path.
