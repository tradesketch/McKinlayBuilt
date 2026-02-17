const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/weather/current?city=Clydebank
router.get('/current', requireAuth, async (req, res) => {
  const city = req.query.city || 'Clydebank';
  const key = process.env.OPENWEATHER_API_KEY;

  if (!key) {
    return res.status(503).json({ error: 'Weather service not configured' });
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${key}&units=metric`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (!resp.ok) {
      return res.status(resp.status).json({ error: data.message || 'Weather API error' });
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/weather/forecast?city=Clydebank
router.get('/forecast', requireAuth, async (req, res) => {
  const city = req.query.city || 'Clydebank';
  const key = process.env.OPENWEATHER_API_KEY;

  if (!key) {
    return res.status(503).json({ error: 'Weather service not configured' });
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${key}&units=metric`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (!resp.ok) {
      return res.status(resp.status).json({ error: data.message || 'Weather API error' });
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
