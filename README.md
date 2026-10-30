# RAR Predictor

A password-locked web app that predicts whether the **RowAmerica Rye (RAR)** team will practice **on the water or on land**. It looks at the 6–8 PM weather and the light during practice (6:00–8:15 PM) at the boathouse on Milton Harbor, Rye, NY.

You log what actually happened each day. The app collects that day's weather by itself, retrains its AI model on your history, and shows each prediction with an **accuracy** and a **certainty**.

- **Password:** `rar` (lowercase). See [Security](#security) for what this lock does and doesn't protect.
- **Location:** the Rye City Boat Basin at 668 Milton Road, home of the RAR boathouse, at 40.9578° N, 73.6897° W.
- **No accounts, no server, no build step.** Everything runs in the browser.

---

## Contents

- [Quick start](#quick-start)
- [Daily use](#daily-use)
- [What the model looks at](#what-the-model-looks-at)
- [Accuracy and certainty](#accuracy-and-certainty)
- [How the AI model works](#how-the-ai-model-works)
- [Managing training data](#managing-training-data)
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

Opening `public/index.html` directly also works in most browsers. A local server avoids browser restrictions on `file://` pages.

**First run:**
1. Use **Add past days** to backfill recent practices. Pick a date range and mark each day **Water**, **Land**, **None** (no practice) or **Skip**. You can mark days one by one or with **Set all to**, and **Skip weekends** helps if you don't practice then. The weather for every day is fetched automatically.
2. Once there are at least **6 logged days, with 2 or more water days and 2 or more land days**, the AI model trains. Until then, sensible starter rules make the predictions.
3. To explore first, use **Try with demo data**. It adds 75 weekdays of real weather with made-up outcomes, marked "demo". Click **Remove demo days** to delete them.

---

## Daily use

1. Open the app. It refreshes the forecast for today's 6–8 PM window and for the next 7 days, and shows the prediction.
2. After practice, tap **On the water**, **On land** or **No practice** on the main card.
3. That's it. The app does the rest:
   - stores today's weather with your answer
   - replaces the forecast with the observed weather the next time you open it (forecast days show a `~` until then)
   - retrains the model
   - records how its pre-practice prediction compared with what happened

Forgot a day? Use **Add past days**, or edit any row in the data table.

---

## What the model looks at

| Feature | How it's measured |
| --- | --- |
| Temperature | Average °F at 6, 7 and 8 PM; the low is shown too |
| Wind speed | Average mph at 6, 7 and 8 PM |
| Wind gusts | Highest gust in mph, 6–8 PM |
| Wind direction | Average direction the wind blows from, weighted by speed. The model gets it as two signed components (north/south and east/west), so it can learn things like "a strong southerly is worse than a light northerly". |
| Daylight | Minutes with the sun above the horizon between 6:00 and 8:15 PM |
| Twilight | Minutes of civil twilight (sun 0–6° below the horizon) in the same window |
| Cloud cover | Average %, 6–8 PM |
| Rain | Inches of precipitation, 6–8 PM |
| Thunderstorms | Whether any thunderstorm weather code appears from 5 to 8 PM |

Light is **calculated from the sun's position** for the boathouse's coordinates and date, so it's exact for any day, past or future, and needs no internet. For example, it gives 135 daylight minutes in late June but none by early November. Sunset times match published values for the area, including the daylight-saving changes.

---

## Accuracy and certainty

- **Certainty** is how sure the model is about one prediction: the model's probability for the outcome it predicts. "On land, 87% certainty" means it gives a 13% chance of rowing on the water. Labels: ≥85% *very confident*, ≥70% *fairly confident*, ≥60% *leaning*, otherwise *toss-up*.
- **Accuracy** is how often the model is right on **days it has not seen**. Every day is predicted by a version of the model trained without that day (cross-validation). This is an honest estimate, not a score on the training data.
- **Live record** counts the predictions the app actually showed before practice that turned out right. A snapshot is taken whenever the app is opened before 6 PM and frozen once practice starts.
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

- All data lives in your browser's `localStorage` under `rar-predictor/v1`. **Different browsers and devices don't share data.** Use **⋯ → Export backup** and **Import backup** to move or share it. Import can **Merge** (adds days, and the backup wins on clashes) or **Replace**.
- **⋯ → Export data as CSV** gives a spreadsheet of every day: weather, outcome, and the live and held-out predictions.
- **⋯ → Erase all data** deletes everything from this browser.
- The only network requests are to Open-Meteo (for weather) and Google Fonts. Nothing about your team is sent anywhere.

---

## Security

The password screen keeps casual visitors out, but it is **not real security**. Here's why:
- The site is static, so the check runs in the browser, and anyone who reads the page source can find or bypass it.
- The data itself is stored in the viewer's own browser, so there is no shared team data on the server to steal.

If you need real access control, put the site behind **Cloudflare Access** (Zero Trust): add an Access application for the Worker's URL with an email or one-time-PIN policy. This requires no code changes.

- **Keep unlocked on this device** remembers the unlock in `localStorage`.
- Otherwise the unlock lasts until the tab is closed.
- The 🔒 button in the top bar locks again.
- The page also asks search engines not to index it (`noindex`).

---

## Project structure

```
predictor/
├── wrangler.jsonc        Cloudflare Workers config (static assets from ./public)
├── README.md
└── public/
    ├── index.html        Page shell, theme bootstrap, script tags
    ├── css/styles.css    Design tokens (light/dark) and all components
    └── js/
        ├── sun.js        Boathouse location, Rye time zone helpers, solar position, practice light
        ├── weather.js    Open-Meteo fetching (forecast + archive) → 6–8 PM features
        ├── model.js      Features, logistic regression, neural network, cross-validation,
        │                 model selection, importance, starter rules (also runs in a Web Worker)
        └── app.js        Lock screen, storage, weather sync, training, predictions, UI
```

---

## Customising

| What | Where |
| --- | --- |
| Password | `PASSWORD` in `public/js/app.js` |
| Location | `PLACE` in `public/js/sun.js` (lat, lon, elevation, time zone) |
| Practice window for light | `PRACTICE` in `public/js/sun.js` |
| Hours used for weather | `PRACTICE_HOURS` in `public/js/weather.js` |
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
| Data disappeared | You're probably in a different browser, a private window, or on a different site address. Import your latest backup. |
| Accuracy isn't better than the baseline | Log more days, especially varied ones (windy days on the water, calm days on land). Exclude days where the decision wasn't about the weather, such as erg tests or regatta travel. |
| Cloudflare build fails with a name mismatch | Make `"name"` in `wrangler.jsonc` match your Worker's name. |
