# Magic Money - Web App

A Progressive Web App version of Magic Money. Works in Safari on iPhone and
in any browser on Mac. Installs to the home screen and works offline once loaded.

---

## STEP 1 - Make your data public (one-time setup, ~10 minutes)

The web app reads rankings.json and prices.json from a public URL. Your main
repo is private, so you need to publish just the data files. Here is how:

### 1a. Create a /docs folder in your repo

In your magic-formula repo, create a folder called `docs` at the root and add
a placeholder file called `docs/.gitkeep` (empty file, just to commit the folder).

### 1b. Update your GitHub Actions workflow

Open `.github/workflows/refresh.yml`. Find the step that commits the data files
and add these two lines BEFORE the git add / git commit lines:

    - name: Publish data to GitHub Pages
      run: |
        cp data/rankings.json docs/rankings.json
        cp data/prices.json   docs/prices.json

### 1c. Enable GitHub Pages

In your magic-formula repo on GitHub:
- Go to Settings > Pages
- Source: Deploy from a branch
- Branch: main, folder: /docs
- Save

After the next pipeline run (or trigger it manually from Actions), your data
will be live at:

    https://YOUR_GITHUB_USERNAME.github.io/magic-formula/rankings.json
    https://YOUR_GITHUB_USERNAME.github.io/magic-formula/prices.json

Test those URLs in a browser to confirm they work before going further.

---

## STEP 2 - Configure the web app

Open `config.js` in this folder and replace `YOUR_GITHUB_USERNAME` with your
actual GitHub username on the two URL lines. Save.

---

## STEP 3 - Host the web app on GitHub Pages

You can host the web app in the same repo under a sub-path, or in a separate
repo. Simplest option: a new public repo called `magic-money-web`.

1. Create a new PUBLIC repo on GitHub called `magic-money-web`
2. Drag and drop all the files in this folder into it (or push via git)
3. Go to Settings > Pages on that repo
4. Source: Deploy from a branch, Branch: main, folder: / (root), Save

Your app will be live at:
    https://YOUR_GITHUB_USERNAME.github.io/magic-money-web/

That is the link you send to your mate. Done.

---

## How your mate accesses it

### On iPhone (installs like a real app)

1. Open Safari and go to the URL above
2. Tap the Share button (box with arrow at the bottom of Safari)
3. Scroll down and tap "Add to Home Screen"
4. Tap "Add"
5. Magic Money now appears on the home screen with its icon
6. Tap it to open - it runs full screen like a native app

Important: this MUST be done in Safari, not Chrome or Firefox on iPhone.
Other browsers cannot install PWAs on iOS.

### On Mac (browser)

Just open the URL in any browser. For the best experience:
- In Safari: File > Add to Dock (makes it open as a standalone window)
- In Chrome: click the install icon in the address bar (looks like a monitor
  with a down arrow) to install as a desktop app

---

## What the app can do

- Screener: browse all Magic Formula ranked stocks with search, sector filter,
  and market cap filter
- Watchlist: star stocks from the screener to save them
- Portfolio: record buys and sells, track P/L, sector allocation donut chart
- Rebalance: see which holdings are due for rotation with action tags
- Basket planner: capital-aware entry pacing based on what you have deployed
- Stock detail: radar chart showing Quality, Value, Size percentiles vs the
  whole universe plus full metrics
- Guide: plain-English explanation of how the formula works

Data updates automatically every week when your pipeline runs - your mate just
refreshes the app and the new rankings load.

---

## Troubleshooting

"Setup required" screen: config.js has not been updated with your real URLs yet.

"Could not load data": the JSON URLs are wrong or GitHub Pages has not published
yet. Test the ranking URL directly in a browser.

Stocks show "n/a" for price: prices.json loaded fine but that ticker is not in
it. This is normal for some names.

App shows old data on iPhone: pull down to refresh in Safari, or go to
Settings > Safari > Clear History and Website Data (this clears all sites,
not just yours).

---

## Files in this folder

    index.html    - App shell
    app.css       - Dark theme styles
    app.js        - All app logic
    config.js     - Edit this with your data URLs
    manifest.json - PWA manifest (name, icon, colours)
    sw.js         - Service worker (offline caching)
    icons/        - App icons (192px and 512px)
