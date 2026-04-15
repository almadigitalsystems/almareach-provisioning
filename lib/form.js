const express = require('express');
const path = require('path');
const fs = require('fs');
const { provisionClient } = require('./provision');
const { findClientBySessionId, updateClientInSheet } = require('./sheets');

const router = express.Router();

// Serve the onboarding form
router.get('/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  // Verify session exists
  const client = await findClientBySessionId(sessionId);
  if (!client) {
    return res.status(404).send('<h1>Form not found</h1><p>This onboarding link is invalid or has expired.</p>');
  }

  if (client.status === 'provisioned') {
    return res.send('<h1>Already Set Up</h1><p>Your WhatsApp agent has already been provisioned. Check your email for details.</p>');
  }

  // Read and serve the HTML form with session ID injected
  const formPath = path.join(__dirname, '..', 'views', 'onboarding.html');
  let html = fs.readFileSync(formPath, 'utf-8');
  html = html.replace(/\{\{SESSION_ID\}\}/g, sessionId);
  html = html.replace(/\{\{CLIENT_NAME\}\}/g, client.name || '');
  html = html.replace(/\{\{CLIENT_EMAIL\}\}/g, client.email || '');
  html = html.replace(/\{\{BASE_URL\}\}/g, process.env.BASE_URL || '');

  res.type('html').send(html);
});

// Handle form submission
router.post('/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  const client = await findClientBySessionId(sessionId);
  if (!client) {
    return res.status(404).json({ error: 'Invalid session' });
  }

  if (client.status === 'provisioned') {
    return res.status(400).json({ error: 'Already provisioned' });
  }

  const formData = {
    businessName: req.body.businessName?.trim(),
    businessType: req.body.businessType?.trim(),
    services: req.body.services?.trim(),
    businessHours: req.body.businessHours?.trim(),
    bookingLink: req.body.bookingLink?.trim() || '',
    notificationEmail: req.body.notificationEmail?.trim() || client.email,
    language: req.body.language || 'EN',
  };

  // Validate required fields
  if (!formData.businessName || !formData.businessType || !formData.services) {
    return res.status(400).send(
      '<h1>Missing Information</h1><p>Please fill in all required fields. <a href="javascript:history.back()">Go back</a></p>'
    );
  }

  try {
    // Update client record with form data
    await updateClientInSheet(sessionId, {
      ...formData,
      status: 'provisioning',
    });

    // Start provisioning
    const result = await provisionClient({
      ...client,
      ...formData,
    });

    // Update status to provisioned
    await updateClientInSheet(sessionId, {
      status: 'provisioned',
      twilioNumber: result.twilioNumber,
      railwayServiceId: result.railwayServiceId,
      railwayUrl: result.railwayUrl,
      provisionedAt: new Date().toISOString(),
    });

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Setup Complete — AlmaReach AI</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #fff; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
          .card { background: #1a1a2e; border-radius: 16px; padding: 48px; max-width: 500px; text-align: center; }
          h1 { color: #00d4aa; margin-bottom: 16px; }
          p { color: #ccc; line-height: 1.6; }
          .number { font-size: 24px; font-weight: bold; color: #00d4aa; background: #0d2818; padding: 12px 24px; border-radius: 8px; display: inline-block; margin: 16px 0; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>You're All Set!</h1>
          <p>Your WhatsApp AI agent for <strong>${formData.businessName}</strong> is now live.</p>
          <div class="number">${result.twilioNumber}</div>
          <p>Share this number with your customers. Your AI agent is ready to respond 24/7 in ${formData.language === 'both' ? 'English & Spanish' : formData.language === 'ES' ? 'Spanish' : 'English'}.</p>
          <p style="margin-top: 24px; font-size: 14px; color: #888;">A confirmation has been sent to ${client.email}. For updates, email update@almawebcreative.com.</p>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('[form] Provisioning failed:', err);
    await updateClientInSheet(sessionId, { status: 'provisioning_failed' });
    res.status(500).send(
      '<h1>Setup Error</h1><p>Something went wrong during setup. Our team has been notified and will reach out shortly.</p>'
    );
  }
});

module.exports = router;
