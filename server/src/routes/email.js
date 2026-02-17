const express = require('express');
const nodemailer = require('nodemailer');
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../database');

const router = express.Router();

let transporter = null;

function getTransporter() {
  if (!transporter) {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT) || 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) return null;

    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });
  }
  return transporter;
}

// POST /api/email/send
router.post('/send', requireAuth, async (req, res) => {
  const { to, subject, body, html } = req.body;

  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'to, subject, and body are required' });
  }

  const t = getTransporter();
  if (!t) {
    return res.status(503).json({ error: 'Email service not configured' });
  }

  // Rate limit: 50 emails/day per user
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const count = db.prepare(
    "SELECT COUNT(*) as c FROM message_log WHERE user_id = ? AND type = 'email' AND date(created_at) = ?"
  ).get(req.userId, today);

  if (count && count.c >= 50) {
    return res.status(429).json({ error: 'Daily email limit reached (50/day)' });
  }

  try {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    await t.sendMail({
      from,
      to,
      subject,
      text: body,
      html: html || undefined
    });

    db.prepare(
      'INSERT INTO message_log (user_id, type, recipient, subject, body, status) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(req.userId, 'email', to, subject, body, 'sent');

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
