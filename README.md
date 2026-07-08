# Flight Log — multi-user web app

A personal flight tracker people can sign up for. Each user logs in, adds flights
by hand or by uploading a boarding-pass photo (read automatically by Claude), and
gets a live dashboard: world map, country map, monthly heatmap, records, charts,
and a natural-language "ask the log" box.

It is a static front end (`index.html` + two data files) plus two small serverless
functions and a Supabase database. It runs on free tiers. You will need to create
two free accounts (Supabase and Vercel) and paste in a few keys. It does **not** run
by opening `index.html` locally — it needs the database and the functions.

---

## What is in this folder

```
index.html          the whole front end (auth + dashboard + upload)
airports.json       6,000+ airports: IATA -> coordinates, city, country
world.geo.json      country shapes for the map
api/parse-photo.js  serverless: photo -> Claude vision -> flight rows
api/ask.js          serverless: question -> Claude -> answer
schema.sql          the database table + security rules
package.json        tells Vercel this is a Node project
.env.example        the one secret you set in Vercel
```

---

## Step 1 — Supabase (accounts + database), ~5 min

1. Go to supabase.com, sign up, and create a new project. Pick any password and region.
2. In the project, open **SQL Editor -> New query**, paste the entire contents of
   `schema.sql`, and click **Run**. This creates the `flights` table with per-user
   security (each person only ever sees their own rows).
3. Open **Project Settings -> API** and copy two values:
   - **Project URL** (looks like `https://abcd1234.supabase.co`)
   - **anon public** key (a long string; it is safe to expose in the browser)
4. (Optional, for quick testing) Open **Authentication -> Providers -> Email** and
   turn **off** "Confirm email" so new accounts work without an email round-trip.
   Leave it on if you want real email confirmation.

## Step 2 — paste your keys into the front end

Open `index.html`, find the `CONFIG` block near the bottom of the file, and replace
the two placeholders with the values from Step 1:

```js
const CONFIG = {
  SUPABASE_URL: "https://abcd1234.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...your anon key..."
};
```

Save the file.

## Step 3 — deploy to Vercel, ~5 min

1. Put this folder in a GitHub repository (create a repo, upload these files).
2. Go to vercel.com, sign up, click **Add New -> Project**, and import that repo.
3. Before deploying, open **Environment Variables** and add one:
   - Name: `ANTHROPIC_API_KEY`
   - Value: your Anthropic API key (from console.anthropic.com)
4. Click **Deploy**. Vercel serves `index.html` and turns the two files in `api/`
   into live endpoints at `/api/parse-photo` and `/api/ask`.

That is it. Visit your Vercel URL, create an account, and start adding flights.

---

## Using it

- **Add flight**: click *+ Add flight*, enter the date, the from/to airport codes
  (3-letter IATA, e.g. `BEY`, `DXB`), and optionally the airline.
- **Upload photo(s)**: click *Upload photo(s)*, pick one or more boarding passes,
  tickets, or itinerary screenshots. Claude reads them, you confirm or correct the
  extracted rows, and they save to your account.
- Everything on the dashboard recomputes from your own flights.

---

## Notes and knobs

- **Cost**: reading a photo and answering a question each make one Anthropic API
  call on your key. Typical cost is a fraction of a cent to a few cents per image.
  To lower it, change the model in `api/parse-photo.js` from `claude-sonnet-5` to
  `claude-haiku-4-5-20251001`.
- **Photo size**: the browser shrinks images before upload to stay under Vercel's
  request limit. Very large multi-page PDFs should be split into images first.
- **Airport codes**: the map and country stats rely on IATA codes being in
  `airports.json`. Almost all commercial airports are included; a missing code just
  will not plot on the map but still counts as a flight.
- **Flags** load from flagcdn.com at runtime; **country shapes** and **airports**
  are served from this repo, so the app has no other external data dependencies.
- **Privacy**: row-level security means one user can never read another user's
  flights, even though everyone shares one database.

## Making it your own

- The design lives entirely in the `<style>` block of `index.html`.
- To seed your own account with the 175 flights from the PDF version, add them via
  the form or upload your tickets once the app is live.
