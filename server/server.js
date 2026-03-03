require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./src/routes/auth');
const weatherRoutes = require('./src/routes/weather');
const smsRoutes = require('./src/routes/sms');
const emailRoutes = require('./src/routes/email');
const settingsRoutes = require('./src/routes/settings');
const warehouseRoutes = require('./src/routes/warehouse');
const announcementRoutes = require('./src/routes/announcements');
const feedbackRoutes = require('./src/routes/feedback');
const newsletterRoutes = require('./src/routes/newsletter');
const billingRoutes = require('./src/routes/billing');

const app = express();
const PORT = process.env.PORT || 3141;

// Security
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use((req, res, next) => {
  if (req.path === '/billing/webhook') return next();
  express.json()(req, res, next);
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// Stricter limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false
});

// Routes
app.use('/auth', authLimiter, authRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/sms', smsRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/warehouse', warehouseRoutes);
app.use('/api/announcements', announcementRoutes);
const feedbackLimiter = rateLimit({ windowMs: 60*60*1000, max: 10 });
app.use('/api/feedback', feedbackLimiter, feedbackRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/billing', billingRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`McK Sketch server running on port ${PORT}`);
});
