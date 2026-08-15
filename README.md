# BJJ Automata

A-game worksheet → flowchart → finish-path analysis. Model your jiu-jitsu as a finite automaton (positions = states, techniques = transitions) and see strongest chains, limiting factors, and dead ends.

**Live (GitHub Pages):** https://escamillacasey.github.io/BJJ_Automata/

Repo is **public** (required for GitHub Pages on free accounts).

## For testers

1. Open the Pages URL.
2. Enter **your name** (required) and optional **email** so the sheet syncs to the cloud.
3. Fill top moves per seat + belt weight → **Generate flowchart**.
4. Hard reload is safe: the browser cache keeps your work; cloud restores it on another device if you use the same name + email.

Data is stored for coaching review (Supabase). Do not put secrets in the sheet.

## Local development

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
npm install
cp .env.example .env.local   # add Supabase URL + anon key
npm run dev
```

Without `.env.local`, the app still runs and autosaves in **localStorage** only.

## Deploy (GitHub Pages)

1. Repo secrets (Settings → Secrets and variables → Actions):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
2. Enable Pages: Settings → Pages → Source = **GitHub Actions**.
3. Push to `main` (or run the **Deploy GitHub Pages** workflow).
4. Site: `https://<user>.github.io/BJJ_Automata/`

CI sets `VITE_BASE_PATH=/BJJ_Automata/` so asset URLs resolve on the project site.

## Supabase setup (one time)

1. Create a free project at [supabase.com](https://supabase.com).
2. Project Settings → API: copy **Project URL** and **anon public** key into `.env.local` and GitHub Actions secrets.
3. SQL Editor → run [`supabase/schema.sql`](supabase/schema.sql).
4. Confirm Table Editor shows `worksheets`.

Identity key: `(athlete_name, athlete_email)`. Empty email is allowed; same name + email upserts the latest payload.

Browse / export all tester sheets in the Supabase dashboard (Table Editor → `worksheets`).

### Security note

v1 uses open anon RLS (select/insert/update) for a small trusted tester group. Add Auth and stricter policies before a public launch.

## Analysis (flowchart view)

1. **Best path** — highest minimum belt on a chain to Submission (widest path).
2. **Limiting factors** — weak links, funnels, missing bridges.
3. **Weaknesses** — seats with no outbound or no finish path.

Leg Entanglements and fine-grained open-guard / standing variants are intentionally coarse for now.
