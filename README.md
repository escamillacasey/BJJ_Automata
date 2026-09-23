# BJJ Automata

A-game worksheet → flowchart → finish-path analysis. Model your jiu-jitsu as a finite automaton (positions = states, techniques = transitions) and see strongest chains, limiting factors, and dead ends.

**Live (GitHub Pages):** https://escamillacasey.github.io/BJJ_Automata/

Repo is **public** (required for GitHub Pages on free accounts).

## For testers

1. Open the Pages URL.
2. Enter **name**, optional **email**, and a **4–6 digit PIN**.
3. Click **Create cloud sheet** (new) or **Load saved sheet** (returning). Cloud does nothing until then.
4. After Create/Load, edits **autosave** to that name + PIN only. Changing name/PIN pauses cloud save until you Create/Load again.
5. Browser cache still keeps the page across refresh; it will not overwrite someone else’s cloud sheet just by typing their name.

PIN is hashed in the browser before sync. Do not reuse a bank PIN.

## Local development

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
npm install
cp .env.example .env.local   # add Supabase URL + publishable key
npm run dev
```

Without `.env.local`, the app still runs and autosaves in **localStorage** only.

## Deploy (GitHub Pages)

1. Repo secrets (Settings → Secrets and variables → Actions):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` (Publishable key from Supabase API Keys)
   - `VITE_ADMIN_PASSWORD` (shared coach password for the Admin tab)
2. Enable Pages: Settings → Pages → Source = **GitHub Actions**.
3. Push to `main` (or run the **Deploy GitHub Pages** workflow).
4. Site: `https://<user>.github.io/BJJ_Automata/`

CI sets `VITE_BASE_PATH=/BJJ_Automata/` so asset URLs resolve on the project site.

## Supabase setup (one time)

1. Create a free project at [supabase.com](https://supabase.com).
2. SQL Editor → run [`supabase/schema.sql`](supabase/schema.sql).
3. **Project Settings → API Keys** (or API):
   - **Project URL** → `VITE_SUPABASE_URL`
   - **Publishable** key (`sb_publishable_...`) → `VITE_SUPABASE_PUBLISHABLE_KEY`
   - Do **not** put the **Secret** key in the frontend or GitHub Pages secrets (it bypasses RLS).
4. Add those two values as GitHub Actions secrets and (optionally) to `.env.local`.
5. Re-run **Deploy GitHub Pages** so the live build includes the keys.

Confirm Table Editor shows `worksheets` with a `pin_hash` column.

Identity key: `(athlete_name, athlete_email, pin_hash)`. **Create** inserts a new row (refuses if it exists). **Load** is the only way to pull a row into the form. Autosave runs only after a successful Create/Load bind.

Browse / export all tester sheets in the Supabase dashboard (Table Editor → `worksheets`).

### Security note

PIN is a light gate (4–6 digits, hashed client-side) so one tester cannot casually Load another’s sheet by name alone. The publishable key + open anon RLS still allow API-level reads — fine for a small trusted group, not a public lockbox. Add Auth and stricter policies before a wide launch.

## Admin (coach)

Toolbar → **Admin**. Unlocks with `VITE_ADMIN_PASSWORD` (session lasts for the tab).

- Dropdown of every cloud sheet (including blank-PIN / empty rows)
- Submissions list + full gameplan table
- Best-path summary and **Open flowchart** for that athlete

Shared password is the achievable gate on static GitHub Pages. GitHub/Gmail OAuth would need Supabase Auth + redirect setup — we can add that later if you want.

## Analysis (flowchart view)

1. **Best path** — highest minimum belt on a chain to Submission (widest path).
2. **Limiting factors** — weak links, funnels, missing bridges.
3. **Weaknesses** — seats with no outbound or no finish path.

Leg Entanglements and fine-grained open-guard / standing variants are intentionally coarse for now.
