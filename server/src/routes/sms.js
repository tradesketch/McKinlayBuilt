const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../database');

const router = express.Router();

// POST /api/sms/send
router.post('/send', requireAuth, async (req, res) => {
  const { to, body } = req.body;

  if (!to || !body) {
    return res.status(400).json({ error: 'to and body are required' });
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) {
    return res.status(503).json({ error: 'SMS service not configured' });
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ To: to, From: from, Body: body })
    });

    const data = await resp.json();

    if (!resp.ok) {
      return res.status(resp.status).json({ error: data.message || 'Twilio API error' });
    }

    // Log the message
    const db = getDb();
    db.prepare(
      'INSERT INTO message_log (user_id, type, recipient, body, status, external_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(req.userId, 'sms', to, body, 'sent', data.sid);

    res.json({ success: true, messageId: data.sid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
