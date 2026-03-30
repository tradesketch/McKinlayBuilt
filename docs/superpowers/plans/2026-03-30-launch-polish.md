# TradeSketch v1.0.0 Launch Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix critical bugs and polish rough edges so TradeSketch is ready for a v1.0.0 public release.

**Architecture:** All fixes are targeted patches to existing files — no new modules or structural changes. Server fixes go in `server/`, Electron fixes in `main.js`, UI fixes in `app/mck-sketch.html`.

**Tech Stack:** Electron 33, Express 4, better-sqlite3, Three.js 0.182, bcryptjs, Stripe

---

## File Map

| File | Changes |
|------|---------|
| `main.js` | Fix config storage path for production builds |
| `server/src/routes/auth.js:99` | Treat `past_due` as active subscription |
| `server/src/routes/billing.js:52-53,80` | Use `APP_URL` env var instead of hardcoded URLs |
| `server/server.js` | Add global error handler middleware |
| `server/src/database.js:23-35` | Improve migration error handling |
| `server/.env.example` | Add missing env vars |
| `app/mck-sketch.html:46690-46728` | Client-side password validation |
| `app/mck-sketch.html:57985` | Fix messaging for cancelled subscribers vs expired trial |

---

### Task 1: Fix auth token persistence in production builds

Config is stored at `__dirname/app/config.json`, but that path is inside the asar in packaged builds (read-only). The build config explicitly excludes `config.json`. Users would need to log in every time they restart.

**Files:**
- Modify: `main.js:23,85-112`

- [ ] **Step 1: Update CONFIG_PATH to use userData in production**

In `main.js`, change the config path logic so packaged builds write to `app.getPath('userData')` while dev mode continues using the local `app/config.json`:

```js
const CONFIG_PATH = app.isPackaged
  ? path.join(app.getPath('userData'), 'config.json')
  : path.join(__dirname, 'app', 'config.json');
```

- [ ] **Step 2: Verify the config read/write functions still work**

No changes needed to `readConfig`/`writeConfig` — they already use `CONFIG_PATH` and handle missing files gracefully.

- [ ] **Step 3: Commit**

```
git add main.js
git commit -m "fix: use userData path for config in production builds"
```

---

### Task 2: Fix past_due subscriptions locking out paying users

Stripe sets subscription status to `past_due` during payment retry (typically 1-3 days). Currently the `/auth/me` endpoint only treats `active` and `lifetime` as valid — users in retry get the trial-expired wall.

**Files:**
- Modify: `server/src/routes/auth.js:99`

- [ ] **Step 1: Add past_due to active subscription check**

```js
const hasActiveSubscription = subStatus === 'active' || subStatus === 'lifetime' || subStatus === 'past_due';
```

- [ ] **Step 2: Commit**

```
git add server/src/routes/auth.js
git commit -m "fix: treat past_due subscriptions as active during Stripe payment retry"
```

---

### Task 3: Replace hardcoded Stripe redirect URLs

`billing.js` has `https://tradesketch.co.uk/success` and `https://tradesketch.co.uk` hardcoded in three places. These should use the `APP_URL` env var that `email.js` already references.

**Files:**
- Modify: `server/src/routes/billing.js:52-53,80`

- [ ] **Step 1: Add APP_URL constant at top of file**

After line 6, add:

```js
const APP_URL = process.env.APP_URL || 'https://tradesketch.co.uk';
```

- [ ] **Step 2: Replace hardcoded URLs**

Line 52: `success_url: APP_URL + '/success'`
Line 53: `cancel_url: APP_URL`
Line 80: `return_url: APP_URL`

- [ ] **Step 3: Commit**

```
git add server/src/routes/billing.js
git commit -m "fix: use APP_URL env var for Stripe redirect URLs"
```

---

### Task 4: Add global error handler to Express server

An unhandled exception in any route currently crashes the server. Add a catch-all error middleware.

**Files:**
- Modify: `server/server.js` (add before `app.listen`)

- [ ] **Step 1: Add error handling middleware**

Before the `app.listen()` call, add:

```js
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack || err);
  res.status(500).json({ error: 'Internal server error' });
});
```

- [ ] **Step 2: Commit**

```
git add server/server.js
git commit -m "fix: add global error handler to prevent server crashes"
```

---

### Task 5: Client-side password validation on registration

Users get a generic server error if password is too short. Add client-side check before submit.

**Files:**
- Modify: `app/mck-sketch.html:46704`

- [ ] **Step 1: Add password length check in doRegister()**

After the confirm-password check (line 46704), before the `try` block, add:

```js
  if (password.length < 8) {
    document.getElementById('register-error').textContent = 'Password must be at least 8 characters';
    document.getElementById('register-error').style.display = 'block';
    return;
  }
```

- [ ] **Step 2: Commit**

```
git add app/mck-sketch.html
git commit -m "fix: add client-side password length validation on registration"
```

---

### Task 6: Fix trial-expired messaging for cancelled subscribers

A cancelled subscriber sees "Your free trial has ended" which is misleading. The overlay should distinguish between trial expiry and subscription end.

**Files:**
- Modify: `app/mck-sketch.html:46872`

- [ ] **Step 1: Update checkAuth to set correct messaging**

At line 46872, update the trial-expired branch:

```js
    } else if (user.trialExpired) {
      var expOverlay = document.getElementById('trial-expired-overlay');
      if (user.subscriptionStatus === 'cancelled') {
        expOverlay.querySelector('h2').textContent = 'Your subscription has ended';
        expOverlay.querySelector('p').textContent = 'Renew your plan to continue using TradeSketch';
      }
      expOverlay.classList.add('active');
    }
```

- [ ] **Step 2: Commit**

```
git add app/mck-sketch.html
git commit -m "fix: show subscription ended instead of trial ended for cancelled subscribers"
```

---

### Task 7: Improve database migration error handling

All migration catch blocks silently swallow every error. Only duplicate-column errors should be ignored.

**Files:**
- Modify: `server/src/database.js:23-35`

- [ ] **Step 1: Replace empty catch blocks with filtered catches**

```js
    function safeMigrate(sql) {
      try { db.exec(sql); } catch (e) {
        if (!e.message.includes('duplicate column')) throw e;
      }
    }

    try {
      db.exec('ALTER TABLE users ADD COLUMN trial_start DATETIME');
      db.exec("UPDATE users SET trial_start = created_at WHERE trial_start IS NULL");
    } catch (e) {
      if (!e.message.includes('duplicate column')) throw e;
    }
    safeMigrate('ALTER TABLE users ADD COLUMN stripe_customer_id TEXT');
    safeMigrate("ALTER TABLE users ADD COLUMN subscription_status TEXT DEFAULT 'trial'");
    safeMigrate('ALTER TABLE users ADD COLUMN subscription_end INTEGER');
    safeMigrate('ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0');
    safeMigrate('ALTER TABLE users ADD COLUMN verify_token TEXT');
    safeMigrate('ALTER TABLE users ADD COLUMN reset_token TEXT');
    safeMigrate('ALTER TABLE users ADD COLUMN reset_token_expiry INTEGER');
```

- [ ] **Step 2: Commit**

```
git add server/src/database.js
git commit -m "fix: only ignore duplicate-column errors in DB migrations"
```

---

### Task 8: Add missing env vars to .env.example

Several env vars used in the codebase are missing from the example file.

**Files:**
- Modify: `server/.env.example`

- [ ] **Step 1: Add APP_URL, RESEND_API_KEY, and Mailchimp vars**

Append to the file:

```
# App URL (used in emails and Stripe redirects)
APP_URL=https://tradesketch.co.uk

# Resend (alternative email provider — if set, takes priority over SMTP)
# RESEND_API_KEY=re_...

# Mailchimp (newsletter)
# MAILCHIMP_API_KEY=...
# MAILCHIMP_LIST_ID=...
```

- [ ] **Step 2: Commit**

```
git add server/.env.example
git commit -m "docs: add missing env vars to .env.example"
```

---

### Task 9: Commit password reset page

`server/src/routes/pages.js` and the updated `server/server.js` are uncommitted.

**Files:**
- Commit: `server/src/routes/pages.js` (new file)
- Commit: `server/server.js` (already modified)

- [ ] **Step 1: Commit the uncommitted files**

Note: server.js will be committed as part of Task 4 if done first. If so, just commit pages.js here.

```
git add server/src/routes/pages.js server/server.js
git commit -m "feat: add password reset page served from Express"
```

---

### Task 10: Tag v1.0.0 and verify CI

After all fixes are committed and pushed.

- [ ] **Step 1: Verify clean working tree**
- [ ] **Step 2: Push to origin**
- [ ] **Step 3: Create release tag v1.0.0 and push tag**
- [ ] **Step 4: Verify CI build triggers on GitHub Actions**
- [ ] **Step 5: Enable GitHub Pages (manual — Settings, Pages, main branch, /docs folder)**

---

## Post-Launch (not in this plan)

- CSP hardening (requires refactoring inline scripts in 55k-line HTML)
- 2FA support
- Warehouse endpoint auth
- Email template enrichment
- Periodic subscription status polling
- Error reporting IPC channel
