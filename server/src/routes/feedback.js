const express = require('express');
const router = express.Router();

router.post('/', async (req, res) => {
  const { message, email } = req.body;
  if (!message || typeof message !== 'string' || message.trim().length < 5)
    return res.status(400).json({ error: 'Message too short' });
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Feedback not configured' });

  const safeMsg = message.trim().slice(0, 2000);
  const safeEmail = (typeof email === 'string' ? email : 'anonymous').slice(0, 200).replace(/[<>]/g, '');

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'feedback@mckinlaybuilt.com',
        to: ['taylor@mckinlaybuilt.com'],
        subject: 'McK Sketch Feedback from ' + safeEmail,
        text: 'From: ' + safeEmail + '\n\n' + safeMsg,
      }),
    });
    if (!r.ok) throw new Error(await r.text());
    res.json({ success: true });
  } catch (e) {
    console.error('Feedback error:', e.message);
    res.status(500).json({ error: 'Failed to send' });
  }
});

module.exports = router;
