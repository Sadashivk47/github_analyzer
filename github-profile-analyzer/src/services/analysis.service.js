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
