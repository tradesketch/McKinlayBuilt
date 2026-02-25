const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../database');

const router = express.Router();

// GET /api/settings
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const settings = db.prepare(
    'SELECT weather_city FROM user_settings WHERE user_id = ?'
  ).get(req.userId);

  const user = db.prepare(
    'SELECT display_name FROM users WHERE id = ?'
  ).get(req.userId);

  res.json({
    weatherCity: settings?.weather_city || 'Clydebank',
    displayName: user?.display_name || ''
  });
});

// PUT /api/settings
router.put('/', requireAuth, (req, res) => {
  const { weatherCity, displayName } = req.body;
  const db = getDb();

  if (weatherCity !== undefined) {
    db.prepare(
      'UPDATE user_settings SET weather_city = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?'
    ).run(weatherCity, req.userId);
  }

  if (displayName !== undefined) {
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName, req.userId);
  }

  res.json({ success: true });
});

module.exports = router;
