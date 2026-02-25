const express = require('express');
const { getDb } = require('../database');
const router = express.Router();

router.get('/latest', (req, res) => {
  const db = getDb();
  const ann = db.prepare(
    'SELECT id, message, link_text, link_url FROM announcements WHERE published=1 ORDER BY id DESC LIMIT 1'
  ).get();
  res.json(ann || null);
});

module.exports = router;
