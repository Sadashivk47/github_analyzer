# GitHub Profile Analyzer API

A RESTful API that analyzes GitHub user profiles and provides insights about their repositories, languages, and activity.

## Tech Stack

- **Runtime**: Node.js (v18+)
- **Framework**: Express.js
- **Database**: PostgreSQL (pg driver)
- **HTTP Client**: Axios
- **Middleware**: CORS, Morgan
- **Environment**: dotenv

## Setup Instructions

### Prerequisites

- Node.js v18+ (v20 LTS recommended)
- PostgreSQL (local, Neon, Supabase, or Render)
- GitHub Personal Access Token (no scopes needed for public data)

### 1. Clone & Install

```bash
git clone https://github.com/<your-username>/github-profile-analyzer.git
cd github-profile-analyzer
npm install
```

### 2. Setup Database

Create a PostgreSQL database and run the schema:

```bash
psql -U postgres -d github_analyzer -f db/schema.sql
```

Or via pgAdmin: open Query Tool on your database and execute the contents of `db/schema.sql`.

### 3. Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
```

```env
PORT=5000
DATABASE_URL=postgresql://user:password@host:5432/github_analyzer
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
CACHE_TTL_MINUTES=60
PGSSL=false
```

- **DATABASE_URL**: Your PostgreSQL connection string
- **GITHUB_TOKEN**: [Get yours](https://github.com/settings/tokens/new) — no scopes required
- **PGSSL**: Set to `true` for cloud databases (Neon, Supabase, Render)

### 4. Run Locally

```bash
npm run dev
```

Server runs on http://localhost:5000

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/profiles/:username` | Analyze a GitHub user (fetch & cache) |
| GET | `/api/profiles` | List all analyzed profiles (paginated) |
| GET | `/api/profiles/:username` | Get latest analysis of a user |
| GET | `/api/profiles/:username/history` | Get all past analyses of a user |
| DELETE | `/api/profiles/:username` | Remove a user from cache |
| GET | `/health` | Health check |

### Examples

**Analyze a profile:**
```bash
curl -X POST http://localhost:5000/api/profiles/octocat
```

**Get all profiles:**
```bash
curl http://localhost:5000/api/profiles?page=1&limit=20&sort=last_analyzed_at&order=desc
```

**Get a single profile:**
```bash
curl http://localhost:5000/api/profiles/octocat
```

**Get analysis history:**
```bash
curl http://localhost:5000/api/profiles/octocat/history
```

**Delete a profile:**
```bash
curl -X DELETE http://localhost:5000/api/profiles/octocat
```

## Activity Score Formula

```
activityScore = (followers × 2) + (public_repos × 1) + (total_stars × 3) - (account_age_days / 365)
```

This metric emphasizes:
- **Followers**: Influence & community trust (weight: 2×)
- **Total Stars**: Repository quality & popularity (weight: 3×)
- **Public Repos**: Contribution breadth (weight: 1×)
- **Account Age**: Slight age penalty to avoid old inactive accounts dominating

## Caching

The API caches analysis results for the duration specified in `CACHE_TTL_MINUTES` (default: 60 minutes). To force a fresh analysis, use:

```bash
curl -X POST http://localhost:5000/api/profiles/octocat?force=true
```

## Testing with Postman

[Import the collection](./postman_collection.json) into Postman or use the curl examples above.

## Deployment

### Free Options

1. **Database**: Neon, Supabase, or Render Postgres (free tier)
2. **API**: Render Web Service (free tier, spins down after 15 min inactivity)

See `github-profile-analyzer-build-guide.md` Step 18 for full deployment walkthrough.

## License

ISC
