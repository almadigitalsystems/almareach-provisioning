require('dotenv').config();
const express = require('express');
const path = require('path');
const stripeRoutes = require('./lib/stripe');
const formRoutes = require('./lib/form');
const updateRoutes = require('./lib/update');

const app = express();

// Stripe webhooks need raw body for signature verification
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));

// All other routes use JSON/urlencoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static assets for the onboarding form
app.use('/static', express.static(path.join(__dirname, 'views')));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'almareach-provisioning',
    timestamp: new Date().toISOString(),
  });
});

// Route mounts
app.use('/webhooks', stripeRoutes);
app.use('/onboarding', formRoutes);
app.use('/updates', updateRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[provisioning] listening on port ${PORT}`);
  console.log(`[provisioning] Stripe webhook: POST /webhooks/stripe`);
  console.log(`[provisioning] Onboarding form: GET /onboarding/:sessionId`);
  console.log(`[provisioning] Health check: GET /health`);
});
