# Groundwork CRM

A lightweight CRM for tracking leads, moving deals through a sales pipeline, and seeing how sales are going.

- **Leads**: a searchable, sortable list of every lead, with quick views for open deals, overdue follow-ups, wins, and losses. You can filter by stage, owner, or source and export what you see to CSV.
- **Pipeline**: a board of open deals by stage. Drag a card to move it, or focus it and use the ← / → keys. The bar at the top shows where the open value sits.
- **Analytics**: revenue won, win rate, deal size, and time to close, compared with the previous period. Also includes revenue and new-lead trends, a conversion funnel, lead source and team breakdowns, and a list of deals that need attention.

Click any lead to open its details. From there you can change the stage, edit it, delete it (with undo), and log calls, emails, meetings, or notes. Press `n` anywhere to add a new lead.

## How it runs

- **Live (Hostinger):** the browser app talks to a small PHP API in `api/`, which stores everything in MySQL. Everyone signs in, and the whole team shares one set of leads. The app re-checks for teammates' changes every minute and whenever you come back to the tab.
- **Local preview:** with no PHP server, the app falls back to keeping demo data in your browser's `localStorage`. This is handy for working on the design:

  ```bash
  python3 -m http.server 8000   # then open http://localhost:8000
  ```

## Deploying

Pushes to `main` deploy automatically to Hostinger through the GitHub connection in hPanel (Websites → Manage → Advanced → Git).

The database credentials are **not** in this repository. They live in `crm-config.php` in the site's folder on the server, one level above `public_html`, so neither the web nor Git can see them:

```php
<?php
return [
    'db' => ['host' => '127.0.0.1', 'port' => 3306, 'name' => '…', 'user' => '…', 'pass' => '…'],
    'setup_code' => '…', // one-time code for creating the owner account
];
```

The API creates its tables on first use.

## Accounts and access

The **gear button** in the top bar opens **Settings**. Only the owner sees it.

| Access | Can do |
| --- | --- |
| **Owner** | Everything, including Settings. There is exactly one owner: the account created at setup. |
| **Editor** | Add, edit, move, and delete leads, and log activity. |
| **Viewer** | See leads, the pipeline, and analytics. Can't change anything. |

From Settings, the owner can:
- add people with a temporary password
- switch anyone between Editor and Viewer
- turn someone's access off, which signs them out at once and can be turned back on
- reset passwords and remove people
- export, reload demo data, or delete all leads

Everyone can change their own password from **⋯ → Change password**.

**Setup:** the first visit shows a setup screen. Creating the owner account needs the setup code from `crm-config.php`, and the screen never appears again once an account exists.

**Security:**
- The server enforces every rule above, not just the screens.
- Passwords are hashed, sessions are stored hashed in HttpOnly cookies, and failed sign-ins are rate-limited.
- Every write requires a custom header, which blocks cross-site requests.

## Data

The sample data is about 80 realistic leads. Their dates are relative to today, so the demo never looks stale.

- **⋯ → Reload demo data** replaces every lead with the sample set.
- **⋯ → Delete all leads** starts from an empty CRM.

Deleted leads can be undone for a few seconds. They're kept in the database for 30 days, then purged.

## Project structure

```
index.html              App shell: top bar, tabs, dialogs
css/styles.css          Design tokens (light + dark) and all styles
js/app.js               Routing between tabs and top-bar actions
js/config.js            Stages, sources, and team members. Edit these for your business.
js/store.js             Data layer: every read and write goes through here
js/api.js               Fetch wrapper for the PHP API
api/index.php           API routes
api/lib/                Database, schema, accounts, and lead logic (not web-accessible)
js/seed.js              Demo data generator
js/charts.js            Small HTML/CSS chart helpers with tooltips
js/utils.js             Safe HTML templating, formatting, CSV
js/components/          Lead drawer, sign-in, team panel, dialogs, toasts
js/views/               Leads, Pipeline, and Analytics tabs
```

## Customising

- **Team, lead sources, and stages:** edit `js/config.js`. A stage's `probability` is used for the weighted pipeline value.
- **Colors and type:** the design tokens are at the top of `css/styles.css`.
