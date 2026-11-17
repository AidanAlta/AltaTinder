# AltaTinder

Upload any CSV, swipe yes/no through it, see where people agree and disagree.
Static HTML/JS on GitHub Pages + Supabase Postgres.

## Setup

1. **GitHub** — push this repo, then Settings → Pages → deploy from the `main` branch, root folder.
2. **Supabase** — Project Settings → Integrations → GitHub → connect this repo, Supabase directory `supabase`, production branch `main`. On the next push to `main` it runs everything in `supabase/migrations/`.
   (Or skip the integration and paste `supabase/migrations/20261117000000_init.sql` into the SQL editor.)
3. **Config** — copy the project URL and anon (publishable) key from Project Settings → API into `config.js`, commit, push.

Schema changes later: add a new file in `supabase/migrations/` (e.g. `20261201000000_add_tags.sql`). Never edit a migration that has already run.

## Trying it without Supabase

Set `window.DEMO = true` in `config.js`, run `python3 -m http.server` in this folder, open http://localhost:8000. Data is kept in that browser only; change your name on the swipe page to act as a second person. Set it back to `false` before pushing.

## Pages

- `index.html` — swipe. → yes, ← no, Z undo, or drag the card. Web addresses on a card are clickable.
- `admin.html` — upload a CSV, pick title/detail columns, archive/unarchive decks.
- `results.html` — filter by deck/user/vote/verdict, comment threads, CSV export.

## Notes

- No login. Anyone with the site URL can swipe, upload decks, and read results.
- Names are matched case-insensitively to whoever swiped first ("aidan" → "Aidan").
- The database refuses deletes on decks, items and comments. Archiving is the only way to retire a deck.
- Verdicts: *disputed* = at least one yes and one no; *consensus* = two or more votes, all the same.
