const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getDb } = require('../database');
const { requireAuth } = require('../middleware/auth');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');

const router = express.Router();

function generateToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function generateRefreshToken(userId) {
  const db = getDb();
  const token = crypto.randomBytes(48).toString('hex');
  const expiry = Date.now() + 90 * 24 * 60 * 60 * 1000; // 90 days
  db.prepare('UPDATE users SET refresh_token = ?, refresh_token_expiry = ? WHERE id = ?')
    .run(token, expiry, userId);
  return token;
}

// POST /auth/register
router.post('/register', async (req, res) => {
  const { email, password, displayName } = req.body;

  if (!email || !password || !displayName) {
    return res.status(400).json({ error: 'Email, password, and display name are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const normalisedEmail = email.toLowerCase().trim();
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalisedEmail);
  if (existing) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }

  const hash = await bcrypt.hash(password, 12);
  const result = db.prepare(
    'INSERT INTO users (email, password_hash, display_name, trial_start) VALUES (?, ?, ?, CURRENT_TIMESTAMP)'
  ).run(normalisedEmail, hash, displayName);

  const newUser = { id: result.lastInsertRowid, email: normalisedEmail, displayName };

  // Create default settings
  db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(newUser.id);

  // Generate email verification token
  const verifyToken = crypto.randomBytes(32).toString('hex');
  db.prepare('UPDATE users SET verify_token = ? WHERE id = ?').run(verifyToken, newUser.id);

  // Send verification email (don't await — don't block registration)
  sendVerificationEmail(normalisedEmail, verifyToken).catch(err => console.error('Verify email failed:', err));

  const token = generateToken(newUser);
  const refreshToken = generateRefreshToken(newUser.id);
  res.status(201).json({ token, refreshToken, user: { id: newUser.id, email: newUser.email, displayName } });
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

  const token = generateToken(user);
  const refreshToken = generateRefreshToken(user.id);
  res.json({ token, refreshToken, user: { id: user.id, email: user.email, displayName: user.display_name } });
});

// GET /auth/me
router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, email, display_name, trial_start, subscription_status, subscription_end FROM users WHERE id = ?').get(req.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const trialDays = parseInt(process.env.TRIAL_DAYS || '30', 10);
  const trialStart = user.trial_start ? new Date(user.trial_start) : new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysSinceStart = Math.floor((Date.now() - trialStart.getTime()) / msPerDay);
  const trialDaysRemaining = Math.max(0, trialDays - daysSinceStart);

  // Determine effective access status
  const subStatus = user.subscription_status || 'trial';
  const hasActiveSubscription = subStatus === 'active' || subStatus === 'lifetime' || subStatus === 'past_due';
  const isLifetime = subStatus === 'lifetime';

  res.json({
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    trialDaysRemaining,
    trialExpired: trialDaysRemaining === 0 && !hasActiveSubscription,
    subscriptionStatus: subStatus,
    hasActiveSubscription,
    isLifetime
  });
});

// POST /auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ ok: true }); // always return ok

  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());

  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = Date.now() + 60 * 60 * 1000; // 1 hour
    db.prepare('UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?')
      .run(token, expiry, user.id);

    sendPasswordResetEmail(email, token).catch(err => console.error('Reset email failed:', err));
  }

  // Always return success — don't reveal if email exists
  res.json({ ok: true });
});

// POST /auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password || password.length < 8) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE reset_token = ?').get(token);

  if (!user || !user.reset_token_expiry || Date.now() > user.reset_token_expiry) {
    return res.status(400).json({ error: 'Reset link has expired. Request a new one.' });
  }

  const hash = await bcrypt.hash(password, 12);
  db.prepare('UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?')
    .run(hash, user.id);

  res.json({ ok: true, message: 'Password updated. You can now log in.' });
});

// GET /auth/verify-email
router.get('/verify-email', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Invalid link');

  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE verify_token = ?').get(token);
  if (!user) return res.status(400).send('Invalid or already used verification link');

  db.prepare('UPDATE users SET email_verified = 1, verify_token = NULL WHERE id = ?').run(user.id);

  res.send(`<!DOCTYPE html>
<html><head><title>Email Verified — TradeSketch</title>
<style>body{font-family:sans-serif;background:#13131a;color:#e0e0e0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{text-align:center;padding:40px;max-width:400px}
h1{color:#ffd100;letter-spacing:4px;font-size:20px}
p{color:#888;margin:16px 0 24px}
.tick{font-size:48px;margin-bottom:16px}</style></head>
<body><div class="box"><div class="tick">&#10003;</div>
<h1>TRADESKETCH</h1>
<h2>Email verified!</h2>
<p>Your account is now active. Open the TradeSketch app to start your 30-day free trial.</p>
</div></body></html>`);
});

// POST /auth/refresh
router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token required' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE refresh_token = ?').get(refreshToken);

  if (!user || !user.refresh_token_expiry || Date.now() > user.refresh_token_expiry) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }

  // Issue new JWT + rotate refresh token
  const token = generateToken(user);
  const newRefreshToken = generateRefreshToken(user.id);

  res.json({ token, refreshToken: newRefreshToken, user: { id: user.id, email: user.email, displayName: user.display_name } });
});

module.exports = router;
