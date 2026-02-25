const express = require('express');
const router = express.Router();

router.post('/subscribe', async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string' || !email.includes('@'))
    return res.status(400).json({ error: 'Invalid email' });

  const apiKey = process.env.MAILCHIMP_API_KEY;
  const listId = process.env.MAILCHIMP_LIST_ID;
  if (!apiKey || !listId) return res.status(503).json({ error: 'Newsletter not configured' });

  const dc = apiKey.split('-').pop();
  const url = 'https://' + dc + '.api.mailchimp.com/3.0/lists/' + listId + '/members';

  try {
    const creds = Buffer.from('anystring:' + apiKey).toString('base64');
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': 'Basic ' + creds, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_address: email.toLowerCase().slice(0, 200), status: 'subscribed' }),
    });
    const data = await r.json();
    if (r.ok || data.title === 'Member Exists') return res.json({ success: true });
    res.status(400).json({ error: data.detail || 'Subscribe failed' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

module.exports = router;
