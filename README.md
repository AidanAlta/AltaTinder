# AltaTinder

Upload any CSV, swipe yes/no through it, see where people agree and disagree.
Static HTML/JS on GitHub Pages + Supabase Postgres.

## Setup

1. **GitHub Pages** — Settings → Pages → deploy from the `main` branch, root folder. The site will be at `https://aidanalta.github.io/AltaTinder/`.
2. **Database** — Supabase → Project Settings → Integrations → GitHub → connect this repo, Supabase directory `supabase`, production branch `main`. On the next push to `main` it runs everything in `supabase/migrations/`.
   (Or skip the integration and paste each file in `supabase/migrations/` into the SQL editor, oldest first.)
3. **Config** — copy the project URL and anon (publishable) key from Project Settings → API into `config.js`, commit, push.
4. **Sign-in settings** (Supabase dashboard → Authentication):
   - **Sign In / Providers** → turn **Allow new users to sign up** off. Logins are created by the admin only.
   - **Users → Add user → Create new user** for each person: their `@altatechnologies.com` email, a temporary password, and tick **Auto Confirm User**. Send them the password; they can change it from the header after signing in.
   - Forgot password: delete their login under **Users** and add it again with a new temporary password. Votes and comments are stored by email, so nothing is lost.

No sign-in emails are sent, so Supabase's email limits don't apply.

Schema changes later: add a new file in `supabase/migrations/` (e.g. `20261201000000_add_tags.sql`). Never edit a migration that has already run.

## Trying it without Supabase

Set `window.DEMO = true` in `config.js`, run `python3 -m http.server` in this folder, open http://localhost:8000. Any @altatechnologies.com address and any password signs you in. Data is kept in that browser only; sign out and back in with another address to act as a second person. Set it back to `false` before pushing.

## Pages

- `index.html` — swipe. → yes, ← no, Z undo, or drag the card. Web addresses on a card are clickable.
- `admin.html` — upload a CSV, pick title/detail columns, archive/unarchive decks.
- `results.html` — filter by deck/user/vote/verdict, comment threads, CSV export.

## Notes

- Sign-in (email + password) is required on every page. Only `@altatechnologies.com` logins can exist, and only signed-in users can read anything; the public key on its own gets nothing.
- Votes and comments are saved under the signed-in email, and the database refuses a vote or comment under anyone else's. People show by the part before the @ (e.g. `aknicely`).
- The database refuses deletes on decks, items and comments. Archiving is the only way to retire a deck. People can only undo their own swipes.
- Verdicts: *disputed* = at least one yes and one no; *consensus* = two or more votes, all the same.
