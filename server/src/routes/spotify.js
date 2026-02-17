const express = require('express');
const crypto = require('crypto');
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../database');

const router = express.Router();

// In-memory store for pending PKCE flows: state -> { verifier, userId }
const pendingFlows = new Map();

const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing streaming user-library-read playlist-read-private';

function getRedirectUri() {
  const port = process.env.PORT || 3141;
  return `http://localhost:${port}/api/spotify/callback`;
}

// GET /api/spotify/auth-url — generate Spotify authorize URL
router.get('/auth-url', requireAuth, (req, res) => {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    return res.status(503).json({ error: 'Spotify not configured' });
  }

  const state = crypto.randomBytes(16).toString('hex');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  pendingFlows.set(state, { verifier: codeVerifier, userId: req.userId });

  // Clean up after 5 minutes
  setTimeout(() => pendingFlows.delete(state), 300000);

  const url = `https://accounts.spotify.com/authorize?` +
    `client_id=${clientId}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(getRedirectUri())}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&code_challenge_method=S256` +
    `&code_challenge=${codeChallenge}` +
    `&state=${state}`;

  res.json({ url, state });
});

// GET /api/spotify/callback — Spotify redirects here after auth
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error || !code || !state) {
    return res.send('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Authentication failed</h2><p>You can close this window.</p></body></html>');
  }

  const flow = pendingFlows.get(state);
  if (!flow) {
    return res.send('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Session expired</h2><p>Please try connecting again from the app.</p></body></html>');
  }

  pendingFlows.delete(state);

  try {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: getRedirectUri(),
        client_id: clientId,
        code_verifier: flow.verifier
      })
    });

    const tokens = await tokenRes.json();

    if (!tokens.access_token) {
      return res.send('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Token exchange failed</h2><p>' + (tokens.error_description || 'Unknown error') + '</p></body></html>');
    }

    // Store tokens in user_settings
    const db = getDb();
    db.prepare(`
      UPDATE user_settings SET
        spotify_access_token = ?,
        spotify_refresh_token = ?,
        spotify_token_expires_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(
      tokens.access_token,
      tokens.refresh_token,
      Date.now() + (tokens.expires_in * 1000),
      flow.userId
    );

    res.send('<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#1a1a2e;color:#fff"><h2 style="color:#1DB954">Connected to Spotify!</h2><p>You can close this window and return to McK Sketch.</p></body></html>');
  } catch (err) {
    res.send('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Error</h2><p>' + err.message + '</p></body></html>');
  }
});

// GET /api/spotify/token — get current access token (app polls this)
router.get('/token', requireAuth, (req, res) => {
  const db = getDb();
  const settings = db.prepare(
    'SELECT spotify_access_token, spotify_refresh_token, spotify_token_expires_at FROM user_settings WHERE user_id = ?'
  ).get(req.userId);

  if (!settings || !settings.spotify_access_token) {
    return res.json({ connected: false });
  }

  const expiresIn = Math.max(0, Math.floor((settings.spotify_token_expires_at - Date.now()) / 1000));

  res.json({
    connected: true,
    accessToken: settings.spotify_access_token,
    expiresIn
  });
});

// POST /api/spotify/refresh — refresh the access token
router.post('/refresh', requireAuth, async (req, res) => {
  const db = getDb();
  const settings = db.prepare(
    'SELECT spotify_refresh_token FROM user_settings WHERE user_id = ?'
  ).get(req.userId);

  if (!settings || !settings.spotify_refresh_token) {
    return res.status(400).json({ error: 'No Spotify connection found' });
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    return res.status(503).json({ error: 'Spotify not configured' });
  }

  try {
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: settings.spotify_refresh_token,
        client_id: clientId
      })
    });

    const tokens = await tokenRes.json();

    if (!tokens.access_token) {
      return res.status(400).json({ error: tokens.error_description || 'Refresh failed' });
    }

    db.prepare(`
      UPDATE user_settings SET
        spotify_access_token = ?,
        spotify_refresh_token = COALESCE(?, spotify_refresh_token),
        spotify_token_expires_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(
      tokens.access_token,
      tokens.refresh_token || null,
      Date.now() + (tokens.expires_in * 1000),
      req.userId
    );

    res.json({ accessToken: tokens.access_token, expiresIn: tokens.expires_in });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/spotify/disconnect — remove Spotify tokens
router.post('/disconnect', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare(`
    UPDATE user_settings SET
      spotify_access_token = NULL,
      spotify_refresh_token = NULL,
      spotify_token_expires_at = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(req.userId);

  res.json({ success: true });
});

module.exports = router;
