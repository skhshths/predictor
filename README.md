# RAR Predictor

A password-locked web app that predicts whether the **RowAmerica Rye (RAR)** team will practice **on the water or on land**. It looks at the weather and the light during practice at the boathouse on Milton Harbor, Rye, NY.

**Practice times:** **6:00–8:15 PM**, except **Saturdays, 10:00 AM–12:15 PM**. Every day is measured over its own practice window.

You log what actually happened each day. The app collects that day's weather by itself, retrains its AI model on your history, and shows each prediction with an **accuracy** and a **certainty**.

A second view, **Conditions**, lets you rate how it was on the water from 1 to 5, with a short note. Each day it finds the logged day most similar to today. If nothing is close enough, it shows a plain summary of today's forecast.

- **Shared:** every device sees the same data, kept on the server (a Cloudflare Worker with a Durable Object).
- **Password:** `rar` (lowercase), checked on the server. See [Security](#security).
- **Location:** the Rye City Boat Basin at 668 Milton Road, home of the RAR boathouse, at 40.9578° N, 73.6897° W.
- **No accounts and no build step.** The model trains in the browser. The server only stores the shared data.

---

## Contents

- [Quick start](#quick-start)
- [Daily use](#daily-use)
- [Land days, half & half, and plans](#land-days-half--half-and-plans)
- [What the model looks at](#what-the-model-looks-at)
- [Accuracy and certainty](#accuracy-and-certainty)
- [How the AI model works](#how-the-ai-model-works)
- [Managing training data](#managing-training-data)
- [Conditions: ratings and similar days](#conditions-ratings-and-similar-days)
- [Weather data and location](#weather-data-and-location)
- [Deploying on Cloudflare](#deploying-on-cloudflare)
- [Other hosting](#other-hosting)
- [Data, backups and privacy](#data-backups-and-privacy)
- [Security](#security)
- [Project structure](#project-structure)
- [Customising](#customising)
- [Troubleshooting](#troubleshooting)

---

## Quick start

```bash
git clone https://github.com/skhshths/predictor.git
```

```bash
cd predictor/public && python3 -m http.server 8000
```

Then open http://localhost:8000 and enter the password `rar`.

That runs the site in **local mode**: data is kept in that browser only, and the status line says so. To run the full app with shared data locally, use the Worker:

```bash
npm install
```

```bash
npx wrangler dev
```

Then open http://localhost:8787. It uses a local copy of the Durable Object, separate from your live data.

**First run:**
1. Use **Add past days** to backfill recent practices. Pick a date range and mark each day **Water**, **Land**, **None** (no practice) or **Skip**. You can mark days one by one or with **Set all to**, and **Skip weekends** helps if you don't practice then. The weather for every day is fetched automatically.
2. Once there are at least **6 logged days, with 2 or more water days and 2 or more land days**, the AI model trains. Until then, sensible starter rules make the predictions.
3. To explore first, use **Try with demo data**. It adds 75 weekdays of real weather with made-up outcomes, marked "demo". Click **Remove demo days** to delete them.

---

## Daily use

1. Open the app. It refreshes the forecast for today's practice window and for the next 7 days, and shows the prediction. Saturdays use the morning window and are marked "AM" in the 7-day strip.
2. After practice, tap **On the water**, **Half & half**, **On land** or **No practice** on the main card. After **On land**, pick **Because of the weather** or **Planned land day**. On water days, also tap a **1–5 rating** for how it was and add a short note.
3. That's it. The app does the rest:
   - stores today's weather with your answer
   - replaces the forecast with the observed weather the next time you open it (forecast days show a `~` until then)
   - retrains the model
   - records how its pre-practice prediction compared with what happened

Forgot a day? Use **Add past days**, or edit any row in the data table.

### On a phone

The layout adapts below 600 px wide (most phones in portrait):

- **Tables become cards.** Each training day shows its date, outcome, edit and delete buttons, then a one-line weather summary and the held-out and live guesses. Each water day on the Conditions view shows its weather, five full-width rating buttons and a full-width note box.
- **Next 7 days** is a single row you swipe sideways.
- **The training-data filter** is one row that scrolls sideways.
- **Dialogs** open as bottom sheets. The Save and Cancel buttons stay pinned at the bottom while the list scrolls. In **Add past days**, each day's buttons sit on their own row under the date.
- **Text boxes use 16 px text**, so iOS Safari doesn't zoom in when you tap them. Buttons are at least 34 px tall.
- **Notches and home bars** are respected (safe-area insets).

Below 370 px wide (iPhone SE and smaller), the From/To dates stack and each day's buttons in **Add past days** split into two rows of three.

---

## Land days, half & half, and plans

Not every land practice is about the weather, and some practices are both. The app tracks four kinds of practice:

| Practice | What it means | How the model uses it |
| --- | --- | --- |
| **On the water** | The whole practice rowed | Water |
| **Half & half** | Half the team rows while the other half is on land, then they swap | Water: the water half went ahead, so conditions allowed rowing |
| **On land, because of the weather** | Wind, cold, dark, rain or storms kept the team off the water | Land |
| **Planned land day** | A land practice for its own sake (erg test, circuit, team day) | **Not used**, since it says nothing about the weather |
| **No practice** | Cancelled | Not used |

**Planning ahead:** tap any day in **Next 7 days**, or **Set plan** on today's card, to mark it:
- **Weather decides:** the default.
- **Planned land day:** today's card shows *On land (planned)* and, for reference, the chance conditions alone would have allowed rowing.
- **Half & half:** the card shows the chance the **water half** can go ahead, with its certainty.

Planned days get a dashed outline in the 7-day strip. When you later log a day that was planned as land, **On land** defaults to *Planned land day*. You can switch it with one tap (*Why on land?*), or later in the edit dialog.

**Where these show up:**
- **Training data table:** filters for each kind, with badges *Half & half*, *Land · weather* and *Land · planned*. The **Use** box is greyed out for planned land and no-practice days, because they're never used.
- **Model panel:** a note says how many half & half days count as water and how many planned land days were left out.
- **Live record:** only days that are weather decisions count.
- **Conditions view:** half & half days are water days, so you can rate how the water half went.
- **CSV export:** outcome `split` for half & half, and a `land_reason` column (`weather` or `planned`).

---

## What the model looks at

All weather features use the hours of that day's practice:

| Day | Practice | Weather hours | Thunderstorm check |
| --- | --- | --- | --- |
| Saturday | 10:00 AM–12:15 PM | 10 AM, 11 AM and noon | 9 AM to noon |
| Every other day | 6:00–8:15 PM | 6, 7 and 8 PM | 5 to 8 PM |

The table below uses the evening hours as the example.

| Feature | How it's measured |
| --- | --- |
| Temperature | Average °F over the practice hours; the low is shown too |
| Wind speed | Average mph over the practice hours |
| Wind gusts | Highest gust in mph during practice |
| Wind direction | Average direction the wind blows from, weighted by speed. The model gets it as two signed components (north/south and east/west), so it can learn things like "a strong southerly is worse than a light northerly". |
| Daylight | Minutes with the sun above the horizon during practice (6:00–8:15 PM, or 10:00 AM–12:15 PM on Saturdays) |
| Twilight | Minutes of civil twilight (sun 0–6° below the horizon) in the same window |
| Cloud cover | Average % during practice |
| Rain | Inches of precipitation during practice |
| Thunderstorms | Whether any thunderstorm weather code appears from an hour before practice until it ends |
| Saturday morning | Whether it's a Saturday morning practice, so the model can learn whether coaches decide differently then |

Light is **calculated from the sun's position** for the boathouse's coordinates and date, so it's exact for any day, past or future, and needs no internet. For example, an evening practice gets 135 daylight minutes in late June but none by early November. Saturday morning practices always get the full 135 minutes of daylight. Sunset times match published values for the area, including the daylight-saving changes.

---

## Accuracy and certainty

- **Certainty** is how sure the model is about one prediction: the model's probability for the outcome it predicts. "On land, 87% certainty" means it gives a 13% chance of rowing on the water. Labels: ≥85% *very confident*, ≥70% *fairly confident*, ≥60% *somewhat confident*, otherwise *uncertain*.
- **After every change** (logging today, adding past days, editing, excluding or deleting a day), the model retrains on its own. A toast and a **Model updated** box at the top of the model panel then show the before → after accuracy, the number of days trained on, and today's prediction with its certainty. The 7-day forecast and each day's held-out guess refresh at the same time.
- **Accuracy** is how often the model is right on **days it has not seen**. Every day is predicted by a version of the model trained without that day (cross-validation). This is an honest estimate, not a score on the training data.
- **Live record** counts the predictions the app actually showed before practice that turned out right. A snapshot is taken whenever the app is opened before practice (before 6 PM, or 10 AM on Saturdays) and frozen once practice starts.
- **Baseline** is the accuracy of always guessing the most common outcome. A useful model should beat it, and the app tells you whether it does.

With fewer than about 25 logged days, expect the accuracy number to move around.

---

## How the AI model works

The model runs **in your browser**, in a background Web Worker, so the page never freezes. On each retrain:

1. **Prepare the data:** every included day with a Water or Land outcome becomes a row of the 10 features above. Features are standardised; missing values are filled with the average.
2. **Try five models:**
   - logistic regression at three regularisation strengths (0.01, 0.1, 1)
   - a small neural network: one hidden layer of 6 tanh units, trained with Adam, at two regularisation strengths
3. **Score each model** with cross-validation on days it didn't train on: leave-one-out for 30 days or fewer, 10-fold otherwise. It **keeps the one with the lowest held-out log loss**, the measure that rewards well-calibrated certainty, and retrains it on all days.
4. **Report** accuracy, the baseline, each day's held-out guess, and **what drives the prediction**. That last part is permutation importance (how much worse predictions get when a feature is scrambled), plus the direction each feature pushes, such as "higher → land".

Retraining happens **automatically whenever the data changes**. The **Retrain** button forces a run and reports the result.

**Starter rules** are used until there is enough data. They lean towards land when:
- wind is over about 10 mph, or gusts are over about 18 mph
- it's below about 45°F
- there's little light during practice
- there's rain or thunder

On a synthetic test with a hidden rule and 10% label noise, the trained model reached 77–79% on held-out and fresh days with 150 days of data, compared with a 65% baseline.

---

## Managing training data

The **Training data** table lists every logged day with the following columns:

| Column | What it shows |
| --- | --- |
| Use | Uncheck to leave a day out of training without deleting it |
| Date, Practice | The day and its outcome |
| Temp, Wind, Gusts, From, Light min, Clouds, Rain | The day's weather |
| Held-out guess | The model's prediction for that day from cross-validation, with ✓/✗ |
| Live guess | What the app predicted on the day itself |

Markers in the table:
- `~` the weather is still a forecast
- `✎` the weather was entered by hand
- `no weather` the weather couldn't be fetched

Actions:
- **Filter** by All, Water, Land, No practice or Excluded.
- **Edit** (pencil): change the outcome, toggle training use, add a note, or **override any weather value by hand**. Manual values are kept and never overwritten. **Re-fetch** gets fresh weather from the service.
- **Delete** (bin): removes a day, with Undo.
- **No practice** days are stored but never used for training.

---

## Conditions: ratings and similar days

Switch with the **Water or land? | Conditions** tabs, or go straight to `/#conditions`. Both views share the same password and data.

**Rating a day:** after logging a day as **On the water**, tap **1–5** and add a short note (up to 140 characters).

| Rating | Meaning |
| --- | --- |
| 1 | Very rough |
| 2 | Rough |
| 3 | OK |
| 4 | Good |
| 5 | Glassy |

You can rate in three places:
- on today's card in either view
- in the **Water days** table on the Conditions view, which has inline buttons and a note box for every water day
- in the edit dialog for any day

Tapping the same number again clears the rating. Ratings and notes sync to every device.

**Today's card shows:**
- **Expected conditions:** a 1–5 estimate. It's a similarity-weighted average of the 7 most similar *rated* water days, blended with a weather-only estimate when there are few close matches. The card says which it used.
- **Most similar day:** when a past water day is at least 65% similar, you see its date, how similar it is, its rating and note, and a side-by-side comparison with today (wind, gusts, direction, temperature, light, sky).
- **Forecast summary:** when nothing is similar enough, the app lists today's forecast in plain terms instead:
  - wind strength (calm, light, moderate, strong, very strong), speed and direction
  - how the wind meets Milton Harbor: southerly winds blow up the harbor from Long Island Sound (usually rougher near the harbor mouth), northerly winds blow off the land (usually calmer near the boathouse), and others blow across the harbor
  - gusts, temperature, how much light is left, and rain or storms

  This is replaced by a real similar day once one exists.
- **Also similar:** up to 3 more close days.

**Next 7 days** shows the expected rating for each forecast day and the closest past day it resembles.

**How similarity works:** two days are compared on the weather during their practice hours. Each feature is put on a natural scale (5 mph of wind ≈ 7 mph of gusts ≈ 10°F ≈ 40 minutes of light) and weighted by how much it matters on the water:
- wind ×3
- gusts ×2
- wind direction ×1.5 for each of its two components
- rain ×1.5, thunder ×2
- temperature ×1, light ×1
- clouds ×0.4

The result is turned into a 0–100% similarity. Only days on the water are candidates, since land days have no on-water conditions.

---

## Weather data and location

- **Source:** [Open-Meteo](https://open-meteo.com/), which is free, needs no API key, and allows browser requests.
- **Location:** requests use the Rye City Boat Basin on Milton Harbor, home of the RAR boathouse, at 40.9578° N, 73.6897° W. Two extra settings make the data as local as possible:
  - `elevation=2`: temperatures are for sea level, where the boats are, not the grid cell's average height.
  - `cell_selection=nearest`: the grid cell closest to the harbor is used, instead of Open-Meteo's default preference for a land cell, which could be further inland.
- **Units:** °F, mph and inches. Times are `America/New_York`, so "6 PM" is always 6 PM in Rye, including across daylight-saving changes.
- **Recent and future days** (back about 80 days, ahead 15 days) come from the forecast API. **Older days** come from the historical archive (ERA5 reanalysis), so you can backfill whole past seasons.
- **Refreshing:** the forecast refreshes every 30 minutes while the app is open, and when you come back to the tab. **Refresh weather** forces it.

Gridded weather models represent an area a few kilometres across, not a single dock. Conditions right on the water, such as gusts funnelling into the harbor, can differ a little. The model learns your team's real thresholds from those same numbers, which compensates for consistent differences.

---

## Deploying on Cloudflare

This repo includes `wrangler.jsonc`, which deploys `public/` as a static-assets Worker with no build step.

1. In Cloudflare: **Workers & Pages → your Worker (`misty-hill-53e8`) → Settings → Builds → Connect**, or **Create → Import a repository**.
2. Choose Git account **skhshths**, repository **predictor** and production branch **main**.
3. Leave **Build command** empty, and keep **Deploy command** as `npx wrangler deploy`.
4. Click **Connect**. Every push to `main` now deploys automatically.

The `"name"` in `wrangler.jsonc` must match the Worker's name in the dashboard. It's currently `misty-hill-53e8`; change it if you rename or recreate the Worker.

**Shared data:** `wrangler.jsonc` declares the Worker script (`src/index.js`) and a SQLite-backed Durable Object class (`TeamStore`) using the `exports` field. Cloudflare creates the storage automatically on the first deploy. Durable Objects with SQLite storage are included on the **Workers Free** plan. `/api/*` requests run the Worker first; everything else is served straight from `public/`.

**"Missing git connection" or "internal error" when connecting:**

| Cause | Fix |
| --- | --- |
| The repository has no commits or branches yet | Push at least one commit. The Production branch list is empty until a branch exists. |
| The Cloudflare GitHub app can't see the repo | Go to https://github.com/settings/installations → **Cloudflare Workers and Pages** → **Configure**. Under **Repository access**, add `predictor` or choose All repositories. |
| A broken or stale install | Uninstall **Cloudflare Workers and Pages** on that same page. Then in Cloudflare, go to **Create → Import a repository → + Add account → Install & Authorize**. |
| The GitHub account is linked to a different Cloudflare account | A GitHub account can only be linked to one Cloudflare account. Uninstall the app as above and reconnect from the right account. |

---

## Other hosting

Any static host works; point it at the `public/` folder.

- **GitHub Pages:** go to Settings → Pages → Deploy from branch `main`. Pages serves from the root or `/docs`, so either move `public/` to `/docs` or use a GitHub Actions workflow.
- **Netlify or Vercel:** set the publish directory to `public`, with no build command.

---

## Data, backups and privacy

- **Shared data:** when the site runs on the Cloudflare Worker, every logged day is stored once, on the server, in a SQLite-backed Durable Object. That includes outcomes, weather, inclusion, ratings, notes and pre-practice predictions.
- **Each device keeps a local copy** so the app works instantly and offline. It sends its edits and fetches everyone else's:
  - within a second of a change
  - every 30 seconds
  - when you return to the tab
  - when the connection comes back

  The status line under the title shows *Shared with every device · synced …*.
- **Edits on different days by different people merge.** If two devices change the *same* day before syncing, the last one to sync wins.
- **Offline edits** are kept on the device (they survive reloads) and are sent when you reconnect. The first time a device signs in, any days it already had saved locally are added to the shared data.
- **Per device:** the trained model and the cached forecast are kept separately on each device. Every device trains on the same shared data and gets the same model.
- **Without the Worker** (`file://`, `python3 -m http.server`, GitHub Pages), the app runs in **local mode**, with data in that browser only, and says so in the status line.
- **⋯ → Export backup** and **Import backup** still work. Import can **Merge** (adds days, and the backup wins on clashes) or **Replace**. In shared mode, either one changes the data for everyone.
- **⋯ → Export data as CSV** gives a spreadsheet of every day: weather, outcome, and the live and held-out predictions.
- **⋯ → Erase all data** deletes everything. In shared mode it erases the data **for every device**, after asking you to confirm.
- The only network requests are to your own Worker (for the shared data), Open-Meteo (for weather) and Google Fonts. Nothing about your team is sent anywhere else.

---

## Security

- **Server-side check:** the password is checked by the Worker, not the page. Signing in sends it to `/api/login`, which returns a signed token, and every data request must carry that token. Without the password, nobody can read or change the team's data, even with the page's code.
- **Default password:** `rar`. To change it without editing code, add a secret named `APP_PASSWORD`: Cloudflare dashboard → **Workers & Pages → misty-hill-53e8 → Settings → Variables and Secrets → Add → Type: Secret**. Changing it signs everyone out on their next sync.
- **Staying signed in:** **Keep signed in on this device** keeps the token after the browser closes. Otherwise it lasts until the tab is closed. The 🔒 button signs out.
- **Brute force:** failed sign-ins are slowed down to make guessing harder. A three-letter password is still easy to guess, though, so use a longer `APP_PASSWORD` if the data matters.
- **Public page:** the static page itself (HTML, CSS, JS) is public; only the data is protected. To hide the whole site, put it behind **Cloudflare Access** (Zero Trust) with an email or one-time-PIN policy. This needs no code changes.
- **Search engines:** `robots.txt` and a `noindex` tag keep the site out of search results.

---

## Project structure

```
predictor/
├── wrangler.jsonc        Cloudflare config: static assets, Worker script, Durable Object
├── package.json          Pins Wrangler (npm run dev / npm run deploy)
├── src/
│   └── index.js          Worker API: login, shared data (TeamStore Durable Object, SQLite)
├── README.md
└── public/
    ├── index.html        Page shell, theme bootstrap, script tags
    ├── css/styles.css    Design tokens (light/dark) and all components
    └── js/
        ├── sun.js        Boathouse location, Rye time zone helpers, solar position, practice light
        ├── weather.js    Open-Meteo fetching (forecast + archive) → practice-time features
        ├── model.js      Features, logistic regression, neural network, cross-validation,
        │                 model selection, importance, starter rules (also runs in a Web Worker)
        ├── conditions.js Ratings, similar-day matching, expected rating, forecast summary text
        └── app.js        Lock screen, shared-data sync, weather sync, training, both views
```

---

## Customising

| What | Where |
| --- | --- |
| Password | The `APP_PASSWORD` secret in Cloudflare (default `rar` in `src/index.js`; local mode uses `PASSWORD` in `public/js/app.js`) |
| How similar days are compared | `FEATS` (scales and weights) and `MATCH` (the 65% threshold) in `public/js/conditions.js` |
| How fast devices sync | the `30000` ms interval in `start()` in `public/js/app.js` |
| Location | `PLACE` in `public/js/sun.js` (lat, lon, elevation, time zone) |
| Practice times (light window and weather hours, per day) | `SCHEDULE` and `practice()` in `public/js/sun.js` |
| Minimum data before training | `MIN_DAYS` and `MIN_EACH` in `public/js/model.js` |
| Models tried | `CANDIDATES` in `public/js/model.js` |
| Starter rules | `starter()` in `public/js/model.js` |
| Forecast refresh interval | `FORECAST_TTL` in `public/js/app.js` |

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Could not reach the weather service" | Check your connection and click **Refresh weather**. You can still log days, and weather fills in on the next successful refresh. |
| A day shows `no weather` | It may be too far in the past or future for the service. Edit the day and enter the values by hand, or click **Re-fetch**. |
| "Local mode: data is saved in this browser only" | The page isn't being served by the Worker (for example, a local file or a plain static host). Open the Worker's URL instead. |
| "You were signed out" | The password (`APP_PASSWORD`) changed, or the token was cleared. Sign in again. |
| A change hasn't appeared on another device | Wait up to 30 seconds, or switch away from the tab and back. Check the status line for an offline message. |
| Data disappeared | In local mode, you're probably in a different browser or a private window. In shared mode, check whether someone erased or replaced it. Import your latest backup. |
| Accuracy isn't better than the baseline | Log more days, especially varied ones (windy days on the water, calm days on land). Exclude days where the decision wasn't about the weather, such as erg tests or regatta travel. |
| Cloudflare build fails with a name mismatch | Make `"name"` in `wrangler.jsonc` match your Worker's name. |
