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