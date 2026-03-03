const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const { getDb } = require('../database');
const { requireAuth } = require('../middleware/auth');

function getStripe() {
  return Stripe(process.env.STRIPE_SECRET_KEY);
}

// POST /billing/create-checkout
// Creates a Stripe Checkout session for the authenticated user
router.post('/create-checkout', requireAuth, async (req, res) => {
  try {
    const stripe = getStripe();
    const db = getDb();
    const { plan } = req.body; // 'monthly' or 'annual'

    const priceId = plan === 'annual'
      ? process.env.STRIPE_ANNUAL_PRICE_ID
      : process.env.STRIPE_MONTHLY_PRICE_ID;

    if (!priceId) {
      return res.status(500).json({ error: 'Pricing not configured on server' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Don't allow checkout for lifetime users
    if (user.subscription_status === 'lifetime') {
      return res.status(400).json({ error: 'Account already has lifetime access' });
    }

    // Create or retrieve Stripe customer
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: String(user.id) }
      });
      customerId = customer.id;
      db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').run(customerId, user.id);
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: 'https://tradesketch.co.uk/success',
      cancel_url: 'https://tradesketch.co.uk',
      subscription_data: {
        metadata: { userId: String(user.id) }
      }
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// GET /billing/portal
// Creates a Stripe Customer Portal session for managing subscription
router.get('/portal', requireAuth, async (req, res) => {
  try {
    const stripe = getStripe();
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);

    if (!user || !user.stripe_customer_id) {
      return res.status(400).json({ error: 'No billing account found' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: 'https://tradesketch.co.uk'
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Portal error:', err);
    res.status(500).json({ error: 'Failed to open billing portal' });
  }
});

// POST /billing/webhook
// Stripe webhook — must use raw body (not JSON parsed)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripe = getStripe();
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send('Webhook Error: ' + err.message);
  }

  const db = getDb();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode === 'subscription' && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          const userId = subscription.metadata.userId || session.metadata?.userId;
          if (userId) {
            const periodEnd = subscription.current_period_end; // Unix timestamp
            db.prepare(`
              UPDATE users SET
                subscription_status = 'active',
                subscription_end = ?
              WHERE id = ?
            `).run(periodEnd, parseInt(userId));
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const userId = sub.metadata.userId;
        if (userId) {
          const status = sub.status === 'active' ? 'active' :
                        sub.status === 'past_due' ? 'past_due' : 'cancelled';
          db.prepare(`
            UPDATE users SET
              subscription_status = ?,
              subscription_end = ?
            WHERE id = ? AND subscription_status != 'lifetime'
          `).run(status, sub.current_period_end, parseInt(userId));
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const userId = sub.metadata.userId;
        if (userId) {
          db.prepare(`
            UPDATE users SET subscription_status = 'cancelled'
            WHERE id = ? AND subscription_status != 'lifetime'
          `).run(parseInt(userId));
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          const sub = await stripe.subscriptions.retrieve(invoice.subscription);
          const userId = sub.metadata.userId;
          if (userId) {
            db.prepare(`
              UPDATE users SET subscription_status = 'past_due'
              WHERE id = ? AND subscription_status != 'lifetime'
            `).run(parseInt(userId));
          }
        }
        break;
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
  }

  res.json({ received: true });
});

// POST /billing/grant-lifetime — admin only (userId 1)
router.post('/grant-lifetime', requireAuth, (req, res) => {
  if (req.userId !== 1) return res.status(403).json({ error: 'Admin only' });
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const db = getDb();
  const result = db.prepare(`
    UPDATE users SET subscription_status = 'lifetime', subscription_end = NULL WHERE email = ?
  `).run(email);
  if (result.changes === 0) return res.status(404).json({ error: 'User not found' });
  res.json({ success: true, message: email + ' granted lifetime access' });
});

module.exports = router;
