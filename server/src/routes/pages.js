const express = require('express');
const router = express.Router();

// GET /reset-password?token=xxx
router.get('/reset-password', (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send(page('Invalid Link', `
      <div class="icon">&#10007;</div>
      <h1>TRADESKETCH</h1>
      <h2>Invalid reset link</h2>
      <p>This password reset link is missing or malformed. Please request a new one from the app.</p>
    `));
  }

  res.send(page('Reset Password', `
    <div class="icon">&#128274;</div>
    <h1>TRADESKETCH</h1>
    <h2>Reset your password</h2>
    <p>Enter a new password for your account.</p>

    <form id="form">
      <input type="password" id="pw" placeholder="New password" minlength="8" required autocomplete="new-password" />
      <input type="password" id="pw2" placeholder="Confirm password" minlength="8" required autocomplete="new-password" />
      <button type="submit" id="btn">Set new password</button>
    </form>
    <div id="msg"></div>

    <script>
      var token = ${JSON.stringify(token)};

      document.getElementById('form').addEventListener('submit', async function(e) {
        e.preventDefault();
        var pw = document.getElementById('pw').value;
        var pw2 = document.getElementById('pw2').value;
        var msg = document.getElementById('msg');
        var btn = document.getElementById('btn');

        msg.className = '';
        msg.textContent = '';

        if (pw !== pw2) {
          msg.className = 'error';
          msg.textContent = 'Passwords do not match.';
          return;
        }
        if (pw.length < 8) {
          msg.className = 'error';
          msg.textContent = 'Password must be at least 8 characters.';
          return;
        }

        btn.disabled = true;
        btn.textContent = 'Saving...';

        try {
          var res = await fetch('/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: token, password: pw })
          });
          var data = await res.json();

          if (res.ok) {
            document.getElementById('form').style.display = 'none';
            msg.className = 'success';
            msg.textContent = '\u2713 Password updated! Open the TradeSketch app to log in.';
          } else {
            msg.className = 'error';
            msg.textContent = data.error || 'Something went wrong. Please try again.';
            btn.disabled = false;
            btn.textContent = 'Set new password';
          }
        } catch (err) {
          msg.className = 'error';
          msg.textContent = 'Network error. Please check your connection and try again.';
          btn.disabled = false;
          btn.textContent = 'Set new password';
        }
      });
    </script>
  `));
});

function page(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — TradeSketch</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #13131a;
      color: #e0e0e0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .box {
      text-align: center;
      padding: 48px 40px;
      max-width: 420px;
      width: 100%;
      background: #1a1a24;
      border-radius: 16px;
      border: 1px solid #2a2a38;
    }
    .icon { font-size: 44px; margin-bottom: 20px; }
    h1 {
      color: #ffd100;
      letter-spacing: 5px;
      font-size: 18px;
      font-weight: 800;
      margin-bottom: 12px;
    }
    h2 { font-size: 20px; font-weight: 600; margin-bottom: 10px; color: #fff; }
    p { color: #888; font-size: 14px; line-height: 1.6; margin-bottom: 24px; }
    form { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
    input {
      width: 100%;
      padding: 12px 16px;
      background: #13131a;
      border: 1px solid #2a2a38;
      border-radius: 8px;
      color: #e0e0e0;
      font-size: 15px;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus { border-color: #ffd100; }
    button {
      width: 100%;
      padding: 13px;
      background: #ffd100;
      color: #111;
      border: none;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      transition: opacity 0.2s;
      margin-top: 4px;
    }
    button:hover { opacity: 0.9; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    #msg { font-size: 14px; min-height: 20px; margin-top: 4px; }
    #msg.error { color: #e05555; }
    #msg.success { color: #5cb85c; font-size: 16px; }
  </style>
</head>
<body>
  <div class="box">${body}</div>
</body>
</html>`;
}

module.exports = router;
