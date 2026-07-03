# GitHub Profile Analyzer API — Step-by-Step Build Guide (PostgreSQL)

Full implementation guide using **PostgreSQL** (via pgAdmin / Render / Supabase / Neon) instead of MySQL. Every command, every file, in build order.

---

## STEP 0 — Prerequisites

```bash
node -v      # v18+ (v20 LTS recommended)
npm -v
psql --version
git --version
```

You already have pgAdmin, so local Postgres is presumably installed. If not, you can skip local Postgres entirely and develop directly against a free cloud instance (Neon/Supabase) — see Step 18.

Get a **GitHub Personal Access Token** now:
1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token → no scopes needed (public data only) → copy it somewhere safe.

---

## STEP 1 — Project Init

```bash
mkdir github-profile-analyzer
cd github-profile-analyzer
npm init -y
git init
```

Install dependencies (note: `pg` instead of `mysql2`):
```bash
npm install express pg axios dotenv cors morgan express-validator
npm install --save-dev nodemon
```

`package.json` scripts:
```json
"scripts": {
  "start": "node server.js",
  "dev": "nodemon server.js"
}
```

`.gitignore`:
```
node_modules/
.env
```

---

## STEP 2 — Folder Structure

```bash
mkdir -p src/config src/controllers src/routes src/services src/models src/middlewares src/utils db
touch server.js src/app.js .env .env.example db/schema.sql README.md
touch src/config/db.js
touch src/services/github.service.js src/services/analysis.service.js
touch src/models/profile.model.js
touch src/controllers/profile.controller.js
touch src/routes/profile.routes.js
touch src/middlewares/errorHandler.js src/middlewares/validateUsername.js
touch src/utils/asyncHandler.js
```

Same structure as a MySQL build — only `config/db.js`, `models/profile.model.js`, and `db/schema.sql` change (Postgres syntax and driver).

---

## STEP 3 — Environment Variables

`.env.example`:
```env
PORT=5000
DATABASE_URL=postgresql://user:password@host:5432/github_analyzer
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
CACHE_TTL_MINUTES=60
PGSSL=false
```

Postgres connection strings are usually given as one URL rather than separate host/user/pass fields — this is what you'll get from pgAdmin (right-click server → Properties → Connection) or from Neon/Supabase/Render dashboards. Set `PGSSL=true` when connecting to a cloud DB that requires SSL (Neon/Supabase/Render all do).

```bash
cp .env.example .env
```

---

## STEP 4 — Database Schema

`db/schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS profiles (
  id SERIAL PRIMARY KEY,
  github_username VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255),
  bio TEXT,
  avatar_url VARCHAR(500),
  company VARCHAR(255),
  location VARCHAR(255),
  blog VARCHAR(255),
  public_repos INT DEFAULT 0,
  followers INT DEFAULT 0,
  following INT DEFAULT 0,
  account_created_at TIMESTAMP,
  first_analyzed_at TIMESTAMP DEFAULT NOW(),
  last_analyzed_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profile_insights (
  id SERIAL PRIMARY KEY,
  profile_id INT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  total_stars INT DEFAULT 0,
  total_forks INT DEFAULT 0,
  top_language VARCHAR(50),
  language_breakdown JSONB,
  most_starred_repo VARCHAR(255),
  most_starred_repo_stars INT DEFAULT 0,
  account_age_days INT DEFAULT 0,
  activity_score INT DEFAULT 0,
  analyzed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profile_id ON profile_insights(profile_id);
```

Differences from the MySQL version: `SERIAL` instead of `AUTO_INCREMENT`, `JSONB` instead of `JSON` (indexed/queryable — strictly better), inline `REFERENCES` instead of a separate `FOREIGN KEY` line, `TIMESTAMP DEFAULT NOW()` instead of `DATETIME DEFAULT CURRENT_TIMESTAMP`.

Run it via pgAdmin (open Query Tool on your target database, paste, execute) or CLI:
```bash
psql -U postgres -d github_analyzer -f db/schema.sql
```
Create the database first if needed: `createdb -U postgres github_analyzer` (or right-click "Databases" → Create → Database in pgAdmin).

---

## STEP 5 — DB Connection Pool

`src/config/db.js`:
```js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false
});

module.exports = pool;
```

---

## STEP 6 — Async Handler Utility

`src/utils/asyncHandler.js`:
```js
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
```

---

## STEP 7 — GitHub Service

`src/services/github.service.js` — no DB involved, identical to any SQL choice:
```js
const axios = require('axios');
require('dotenv').config();

const githubApi = axios.create({
  baseURL: 'https://api.github.com',
  headers: {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json'
  }
});

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 404;
  }
}

async function fetchGithubUser(username) {
  try {
    const { data } = await githubApi.get(`/users/${username}`);
    return data;
  } catch (err) {
    if (err.response?.status === 404) {
      throw new NotFoundError(`GitHub user '${username}' not found`);
    }
    throw err;
  }
}

async function fetchGithubRepos(username) {
  const { data } = await githubApi.get(`/users/${username}/repos`, {
    params: { per_page: 100, sort: 'updated' }
  });
  return data;
}

module.exports = { fetchGithubUser, fetchGithubRepos, NotFoundError };
```

---

## STEP 8 — Analysis Service

`src/services/analysis.service.js` — pure logic, no DB:
```js
function computeInsights(user, repos) {
  const languageBreakdown = {};
  let totalStars = 0;
  let totalForks = 0;
  let mostStarredRepo = null;
  let mostStarredRepoStars = -1;

  for (const repo of repos) {
    totalStars += repo.stargazers_count || 0;
    totalForks += repo.forks_count || 0;

    if (repo.language) {
      languageBreakdown[repo.language] = (languageBreakdown[repo.language] || 0) + 1;
    }

    if (repo.stargazers_count > mostStarredRepoStars) {
      mostStarredRepoStars = repo.stargazers_count;
      mostStarredRepo = repo.name;
    }
  }

  const topLanguage = Object.entries(languageBreakdown)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const accountAgeDays = Math.floor(
    (Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  // Custom metric — weighs followers and stars heavier than raw repo count,
  // slightly discounts very old accounts so age alone doesn't dominate.
  const activityScore = Math.round(
    user.followers * 2 +
    user.public_repos * 1 +
    totalStars * 3 -
    accountAgeDays / 365
  );

  return {
    totalStars,
    totalForks,
    topLanguage,
    languageBreakdown,
    mostStarredRepo,
    mostStarredRepoStars: mostStarredRepoStars === -1 ? 0 : mostStarredRepoStars,
    accountAgeDays,
    activityScore
  };
}

module.exports = { computeInsights };
```

---

## STEP 9 — Model Layer (Postgres syntax: `$1, $2...` placeholders, not `?`)

`src/models/profile.model.js`:
```js
const pool = require('../config/db');

async function findProfileByUsername(username) {
  const { rows } = await pool.query(
    'SELECT * FROM profiles WHERE github_username = $1',
    [username]
  );
  return rows[0] || null;
}

async function upsertProfile(data) {
  // Postgres native upsert — one atomic query instead of check-then-insert/update
  const { rows } = await pool.query(
    `INSERT INTO profiles
       (github_username, name, bio, avatar_url, company, location, blog,
        public_repos, followers, following, account_created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (github_username) DO UPDATE SET
       name = EXCLUDED.name,
       bio = EXCLUDED.bio,
       avatar_url = EXCLUDED.avatar_url,
       company = EXCLUDED.company,
       location = EXCLUDED.location,
       blog = EXCLUDED.blog,
       public_repos = EXCLUDED.public_repos,
       followers = EXCLUDED.followers,
       following = EXCLUDED.following,
       last_analyzed_at = NOW()
     RETURNING id`,
    [data.github_username, data.name, data.bio, data.avatar_url, data.company,
     data.location, data.blog, data.public_repos, data.followers, data.following,
     data.account_created_at]
  );
  return rows[0].id;
}

async function insertInsight(profileId, insight) {
  await pool.query(
    `INSERT INTO profile_insights
       (profile_id, total_stars, total_forks, top_language, language_breakdown,
        most_starred_repo, most_starred_repo_stars, account_age_days, activity_score)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [profileId, insight.totalStars, insight.totalForks, insight.topLanguage,
     JSON.stringify(insight.languageBreakdown), insight.mostStarredRepo,
     insight.mostStarredRepoStars, insight.accountAgeDays, insight.activityScore]
  );
}

async function getLatestInsight(profileId) {
  const { rows } = await pool.query(
    `SELECT * FROM profile_insights WHERE profile_id = $1
     ORDER BY analyzed_at DESC LIMIT 1`,
    [profileId]
  );
  return rows[0] || null;
}

async function getAllInsightHistory(profileId) {
  const { rows } = await pool.query(
    `SELECT * FROM profile_insights WHERE profile_id = $1 ORDER BY analyzed_at DESC`,
    [profileId]
  );
  return rows;
}

async function getAllProfilesWithLatestInsight({ limit = 20, offset = 0, sort = 'last_analyzed_at', order = 'DESC' }) {
  const allowedSort = ['last_analyzed_at', 'followers', 'public_repos'];
  const sortCol = allowedSort.includes(sort) ? sort : 'last_analyzed_at';
  const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const { rows } = await pool.query(
    `SELECT p.*, pi.activity_score, pi.total_stars, pi.top_language
     FROM profiles p
     LEFT JOIN LATERAL (
       SELECT * FROM profile_insights
       WHERE profile_id = p.id
       ORDER BY analyzed_at DESC LIMIT 1
     ) pi ON true
     ORDER BY p.${sortCol} ${sortOrder}
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

async function deleteProfile(username) {
  const { rowCount } = await pool.query(
    'DELETE FROM profiles WHERE github_username = $1',
    [username]
  );
  return rowCount > 0;
}

module.exports = {
  findProfileByUsername,
  upsertProfile,
  insertInsight,
  getLatestInsight,
  getAllInsightHistory,
  getAllProfilesWithLatestInsight,
  deleteProfile
};
```

Two things worth knowing, coming from MySQL:
- **`ON CONFLICT ... DO UPDATE`** replaces the "check if exists, then insert or update" pattern — one atomic query, no race condition between check and write.
- **`LEFT JOIN LATERAL`** replaces the correlated-subquery-in-JOIN trick for "get each profile's most recent insight." It's the standard Postgres way to do a per-row "top N" join.

`sortCol`/`sortOrder` are still whitelisted before being interpolated — placeholders (`$1`) only work for values, not column names, so this manual whitelist is what keeps it injection-safe.

---

## STEP 10 — Middlewares

No DB-specific code here — identical regardless of database choice.

`src/middlewares/validateUsername.js`:
```js
function validateUsername(req, res, next) {
  const { username } = req.params;
  const valid = /^[a-zA-Z0-9-]{1,39}$/.test(username || '');
  if (!valid) {
    return res.status(400).json({ success: false, message: 'Invalid GitHub username format' });
  }
  next();
}

module.exports = validateUsername;
```

`src/middlewares/errorHandler.js`:
```js
function errorHandler(err, req, res, next) {
  console.error(err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal server error'
  });
}

module.exports = errorHandler;
```

---

## STEP 11 — Controller

`src/controllers/profile.controller.js` — talks only to the model layer, never to SQL directly, so this is unaffected by the DB choice:
```js
const { fetchGithubUser, fetchGithubRepos } = require('../services/github.service');
const { computeInsights } = require('../services/analysis.service');
const model = require('../models/profile.model');

const CACHE_TTL_MS = (Number(process.env.CACHE_TTL_MINUTES) || 60) * 60 * 1000;

async function analyzeProfile(req, res) {
  const { username } = req.params;
  const force = req.query.force === 'true';

  const existing = await model.findProfileByUsername(username);

  if (existing && !force) {
    const lastAnalyzed = new Date(existing.last_analyzed_at).getTime();
    if (Date.now() - lastAnalyzed < CACHE_TTL_MS) {
      const insight = await model.getLatestInsight(existing.id);
      return res.status(200).json({ success: true, cached: true, profile: existing, insight });
    }
  }

  const user = await fetchGithubUser(username);
  const repos = await fetchGithubRepos(username);
  const insight = computeInsights(user, repos);

  const profileId = await model.upsertProfile({
    github_username: user.login,
    name: user.name,
    bio: user.bio,
    avatar_url: user.avatar_url,
    company: user.company,
    location: user.location,
    blog: user.blog,
    public_repos: user.public_repos,
    followers: user.followers,
    following: user.following,
    account_created_at: user.created_at
  });

  await model.insertInsight(profileId, insight);
  const savedProfile = await model.findProfileByUsername(username);

  res.status(200).json({ success: true, cached: false, profile: savedProfile, insight });
}

async function getAllProfiles(req, res) {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const page = Number(req.query.page) || 1;
  const offset = (page - 1) * limit;
  const sort = req.query.sort || 'last_analyzed_at';
  const order = req.query.order || 'desc';

  const profiles = await model.getAllProfilesWithLatestInsight({ limit, offset, sort, order });
  res.status(200).json({ success: true, count: profiles.length, page, profiles });
}

async function getProfile(req, res) {
  const { username } = req.params;
  const profile = await model.findProfileByUsername(username);

  if (!profile) {
    return res.status(404).json({ success: false, message: 'Profile not analyzed yet. POST to this route first.' });
  }

  const insight = await model.getLatestInsight(profile.id);
  res.status(200).json({ success: true, profile, insight });
}

async function getProfileHistory(req, res) {
  const { username } = req.params;
  const profile = await model.findProfileByUsername(username);

  if (!profile) {
    return res.status(404).json({ success: false, message: 'Profile not found' });
  }

  const history = await model.getAllInsightHistory(profile.id);
  res.status(200).json({ success: true, profile, history });
}

async function removeProfile(req, res) {
  const { username } = req.params;
  const deleted = await model.deleteProfile(username);

  if (!deleted) {
    return res.status(404).json({ success: false, message: 'Profile not found' });
  }
  res.status(200).json({ success: true, message: `${username} removed` });
}

module.exports = { analyzeProfile, getAllProfiles, getProfile, getProfileHistory, removeProfile };
```

---

## STEP 12 — Routes

`src/routes/profile.routes.js`:
```js
const express = require('express');
const router = express.Router();
const asyncHandler = require('../utils/asyncHandler');
const validateUsername = require('../middlewares/validateUsername');
const controller = require('../controllers/profile.controller');

router.post('/:username', validateUsername, asyncHandler(controller.analyzeProfile));
router.get('/', asyncHandler(controller.getAllProfiles));
router.get('/:username', validateUsername, asyncHandler(controller.getProfile));
router.get('/:username/history', validateUsername, asyncHandler(controller.getProfileHistory));
router.delete('/:username', validateUsername, asyncHandler(controller.removeProfile));

module.exports = router;
```

---

## STEP 13 — App & Server

`src/app.js`:
```js
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const profileRoutes = require('./routes/profile.routes');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.use('/api/profiles', profileRoutes);

app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));

app.use(errorHandler);

module.exports = app;
```

`server.js`:
```js
require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
```

---

## STEP 14 — Run & Test Locally

```bash
npm run dev
```

```bash
curl http://localhost:5000/health
curl -X POST http://localhost:5000/api/profiles/octocat
curl http://localhost:5000/api/profiles
curl http://localhost:5000/api/profiles/octocat
curl http://localhost:5000/api/profiles/octocat/history
curl -X DELETE http://localhost:5000/api/profiles/octocat
```

Verify in pgAdmin: open Query Tool on `github_analyzer` → `SELECT * FROM profiles;` and `SELECT * FROM profile_insights;` after your first POST.

Same behavioral checks as any version of this project:
- Second POST immediately → `"cached": true`.
- POST with `?force=true` → new insight row inserted (check `SELECT * FROM profile_insights WHERE profile_id = 1;` — should show 2 rows).
- Invalid username format → 400. Nonexistent GitHub user → 404.

---

## STEP 15 — Postman Collection

Create a collection with the 5 requests above, pointing at `{{baseUrl}}` as a collection variable. Export as `postman_collection.json`, commit to the repo.

---

## STEP 16 — README.md

Include: description, tech stack (Node/Express/**PostgreSQL**), setup instructions (Steps 1–4 above), API endpoint table, the `activity_score` formula explained, live URL, DB provider used, Postman collection link.

---

## STEP 17 — Push to GitHub

```bash
git add .
git commit -m "Initial commit: GitHub Profile Analyzer API (PostgreSQL)"
git branch -M main
git remote add origin https://github.com/<your-username>/github-profile-analyzer.git
git push -u origin main
```

---

## STEP 18 — Free Deployment

### 18a. Database — pick ONE:

**Option A: Neon (recommended — free tier never expires)**
1. neon.tech → sign up → New Project.
2. Copy the connection string (already includes `?sslmode=require`).
3. Run schema via pgAdmin: add a new server connection using Neon's host/user/password, open Query Tool on the database, paste and run `db/schema.sql`.

**Option B: Supabase (also permanent free tier)**
1. supabase.com → New Project → set a DB password.
2. Project Settings → Database → copy the connection string (URI format).
3. Run `db/schema.sql` via the Supabase SQL Editor (in-browser) or pgAdmin.

**Option C: Render Postgres**
1. Render dashboard → New → PostgreSQL.
2. Free instance — note: **expires after 90 days**, Render emails you before deleting it. Fine for a graded assignment with a near-term deadline, less good if you want it live long-term.
3. Copy the "External Database URL" and run schema the same way.

Any option gives you a single `DATABASE_URL` — that's all the app needs.

### 18b. API — Render Web Service (free)
1. render.com → New → Web Service → connect your GitHub repo.
2. Build command: `npm install`
3. Start command: `node server.js`
4. Environment variables:
   ```
   PORT=10000
   DATABASE_URL=<your Neon/Supabase/Render connection string>
   GITHUB_TOKEN=<your token>
   CACHE_TTL_MINUTES=60
   PGSSL=true
   ```
5. Deploy → live URL like `https://github-profile-analyzer.onrender.com`.
6. Free tier spins down after inactivity — first request after idle takes ~30s. Mention this in the README so it's not mistaken for a bug during review.

### 18c. Final live test
```bash
curl -X POST https://<your-render-url>/api/profiles/octocat
curl https://<your-render-url>/api/profiles
```

---

## STEP 19 — Submission Checklist
- [ ] GitHub repo public, pushed, clean commits
- [ ] Live API URL tested and working
- [ ] README complete (setup + endpoints + activity_score explanation + live URL + DB provider used)
- [ ] `db/schema.sql` (Postgres version) in repo
- [ ] `postman_collection.json` in repo
- [ ] All 3 required endpoints verified live: analyze, list all, get single

---

**Summary of what changed from the MySQL plan:** driver (`pg` instead of `mysql2`), placeholders (`$1` instead of `?`), schema types (`SERIAL`/`JSONB`/`TIMESTAMP`), upsert (`ON CONFLICT` instead of check-then-write), and the "latest insight per profile" join (`LEFT JOIN LATERAL` instead of a correlated subquery). Routes, controllers, services, and middleware are untouched — none of that layer talks to SQL directly.