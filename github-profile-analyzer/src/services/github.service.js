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
