const pool = require('../config/db');

async function findProfileByUsername(username) {
  const { rows } = await pool.query(
    'SELECT * FROM profiles WHERE LOWER(github_username) = LOWER($1)',
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
    'DELETE FROM profiles WHERE LOWER(github_username) = LOWER($1)',
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
