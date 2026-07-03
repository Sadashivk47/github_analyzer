function validateUsername(req, res, next) {
  const { username } = req.params;
  const valid = /^[a-zA-Z0-9-]{1,39}$/.test(username || '');
  if (!valid) {
    return res.status(400).json({ success: false, message: 'Invalid GitHub username format' });
  }
  next();
}

module.exports = validateUsername;
