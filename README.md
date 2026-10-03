# Groundwork CRM

A lightweight CRM for tracking leads, moving deals through a sales pipeline, and seeing how sales are going.

- **Leads**: a searchable, sortable list of every lead, with quick views for open deals, overdue follow-ups, wins, and losses. You can filter by stage, owner, or source and export what you see to CSV.
- **Pipeline**: a board of open deals by stage. Drag a card to move it, or focus it and use the ← / → keys. The bar at the top shows where the open value sits.
- **Analytics**: revenue won, win rate, deal size, and time to close, compared with the previous period. Also includes revenue and new-lead trends, a conversion funnel, lead source and team breakdowns, and a list of deals that need attention.

Click any lead to open its details. From there you can change the stage, edit it, delete it (with undo), and log calls, emails, meetings, or notes. Press `n` anywhere to add a new lead.

## Running it locally

The app is plain HTML, CSS, and JavaScript (ES modules), with no build step and no dependencies. Browsers only load modules over `http://`, so serve the folder instead of double-clicking `index.html`:

```bash
# from the project folder
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static server works, for example `npx serve` if you have Node installed.

## Data

The first time the app opens, it loads about 80 realistic demo leads. Their dates are relative to today, so the demo never looks stale. Changes are saved in the browser's `localStorage`, so each browser has its own copy of the data.

- **⋯ menu → Reload demo data** brings the sample data back.
- **⋯ menu → Delete all leads** starts from an empty CRM.

## Project structure

```
index.html              App shell: top bar, tabs, dialogs
css/styles.css          Design tokens (light + dark) and all styles
js/app.js               Routing between tabs and top-bar actions
js/config.js            Stages, sources, and team members. Edit these for your business.
js/store.js             Data layer: every read and write goes through here
js/seed.js              Demo data generator
js/charts.js            Small HTML/CSS chart helpers with tooltips
js/utils.js             Safe HTML templating, formatting, CSV
js/components/          Lead drawer, confirmation dialog, toasts
js/views/               Leads, Pipeline, and Analytics tabs
```

## Customising

- **Team, lead sources, and stages:** edit `js/config.js`. A stage's `probability` is used for the weighted pipeline value.
- **Colors and type:** the design tokens are at the top of `css/styles.css`.

## Hosting and next steps

Because the app is static, you can host it as-is on GitHub Pages, Netlify, Vercel, or Cloudflare Pages. No build settings are needed.

Before several people use it at once, the data needs to live on a server rather than in each browser. `js/store.js` is the only file that touches storage. Replace its functions with API calls (to Supabase, Firebase, or your own backend) and the rest of the app stays as it is. You'll also want sign-in at that point.
