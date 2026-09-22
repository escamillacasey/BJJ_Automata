# Worksheet recovery (2026-09-21)

Your good data was **not deleted**. Empty Create/Load rows with PIN `6238` collided with a legacy row that still stored the PIN as plaintext `6238`, so Load returned a 0-move sheet.

## Load these in the app

### Prototype 1 — 48 moves
| Field | Value |
|-------|-------|
| Athlete | `Casey` |
| Email | `ecaseclosed5@gmail.com` |
| PIN | `6238` |

Then click **Load saved sheet**.

### Primary — 44 moves
| Field | Value |
|-------|-------|
| Athlete | `Casey` |
| Email | `escamilllacasey@gmail.com` (three L’s — typo in the original row) |
| PIN | `1492` |

Then click **Load saved sheet**.

## Local backup JSON
- [`src/data/recovery/casey-prototype-48.json`](casey-prototype-48.json)
- [`src/data/recovery/casey-primary-44.json`](casey-primary-44.json)

## What we fixed in the database
- Restored the 48-move payload onto the hashed-PIN identity Load already uses for `6238`
- Set the blank-pin Primary row’s `pin_hash` to the hash of `1492`
- Demoted obsolete empty / plaintext-duplicate rows so they no longer win Load

## Cleanup tip
In Supabase Table Editor you can delete any row whose `athlete_name` starts with `__obsolete__` (anon DELETE may be blocked by RLS).
