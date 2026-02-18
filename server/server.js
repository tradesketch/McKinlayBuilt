require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./src/routes/auth');
const weatherRoutes = require('./src/routes/weather');
const smsRoutes = require('./src/routes/sms');
const emailRoutes = require('./src/routes/email');
const spotifyRoutes = require('./src/routes/spotify');
const settingsRoutes = require('./src/routes/settings');
const warehouseRoutes = require('./src/routes/warehouse');

const app = express();
const PORT = process.env.PORT || 3141;

// Security
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

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
app.use('/api/spotify', spotifyRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/warehouse', warehouseRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`McK Sketch server running on port ${PORT}`);
});
