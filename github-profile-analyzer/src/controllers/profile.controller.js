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
  const savedProfile = await model.findProfileByUsername(user.login); 

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
