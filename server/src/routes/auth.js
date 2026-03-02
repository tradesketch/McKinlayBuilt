const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function generateToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// POST /auth/register
router.post('/register', async (req, res) => {
  const { email, password, displayName } = req.body;

  if (!email || !password || !displayName) {
    return res.status(400).json({ error: 'Email, password, and display name are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }

  const hash = await bcrypt.hash(password, 12);
  const result = db.prepare(
    'INSERT INTO users (email, password_hash, display_name, trial_start) VALUES (?, ?, ?, CURRENT_TIMESTAMP)'
  ).run(email.toLowerCase(), hash, displayName);

  const user = { id: result.lastInsertRowid, email: email.toLowerCase(), displayName };

  // Create default settings
  db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(user.id);

  const token = generateToken(user);
  res.status(201).json({ token, user: { id: user.id, email: user.email, displayName } });
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

  const token = generateToken(user);
  res.json({ token, user: { id: user.id, email: user.email, displayName: user.display_name } });
});

// GET /auth/me
router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, email, display_name, trial_start FROM users WHERE id = ?').get(req.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const trialDays = parseInt(process.env.TRIAL_DAYS || '30', 10);
  const trialStart = user.trial_start ? new Date(user.trial_start) : new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysSinceStart = Math.floor((Date.now() - trialStart.getTime()) / msPerDay);
  const trialDaysRemaining = Math.max(0, trialDays - daysSinceStart);
  const trialExpired = trialDaysRemaining === 0;

  res.json({
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    trialDaysRemaining,
    trialExpired
  });
});

module.exports = router;
