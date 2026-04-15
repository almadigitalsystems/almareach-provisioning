const nodemailer = require('nodemailer');

function getTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.NOTIFICATION_EMAIL,
      pass: process.env.NOTIFICATION_EMAIL_PASSWORD,
    },
  });
}

/**
 * Send the branded onboarding form email after Stripe payment.
 */
async function sendOnboardingEmail(toEmail, clientName, formUrl, planType) {
  const planLabel = planType === 'growth' ? 'Growth' : 'Starter';
  const transporter = getTransporter();

  await transporter.sendMail({
    from: `"Alma Digital Services" <${process.env.NOTIFICATION_EMAIL}>`,
    to: toEmail,
    subject: `Welcome to AlmaReach AI — Let's Set Up Your WhatsApp Agent`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #ffffff; padding: 40px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #00d4aa; margin: 0;">AlmaReach AI</h1>
          <p style="color: #888; margin: 8px 0 0 0;">by Alma Digital Services</p>
        </div>

        <p>Hi ${clientName},</p>

        <p>Thank you for choosing AlmaReach AI (${planLabel} plan)! Your AI-powered WhatsApp agent is almost ready.</p>

        <p>To complete setup, we just need a few details about your business. This takes about 2 minutes:</p>

        <div style="text-align: center; margin: 32px 0;">
          <a href="${formUrl}" style="background: #00d4aa; color: #0a0a0a; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">Complete Your Setup</a>
        </div>

        <p>Once you submit the form, your WhatsApp agent will be live within minutes — ready to answer customer questions 24/7 in English and Spanish.</p>

        <p style="color: #888; font-size: 14px; margin-top: 32px;">Questions? Reply to this email or WhatsApp us anytime.</p>

        <div style="border-top: 1px solid #333; margin-top: 32px; padding-top: 16px; text-align: center; color: #666; font-size: 12px;">
          Alma Digital Services — Miami, FL<br>
          Powered by AlmaReach AI
        </div>
      </div>
    `,
  });

  console.log(`[email] Onboarding email sent to ${toEmail}`);
}

/**
 * Send confirmation email after successful provisioning.
 */
async function sendProvisionedEmail(toEmail, businessName, phoneNumber, language) {
  const transporter = getTransporter();
  const langText = language === 'both' ? 'English & Spanish' : language === 'ES' ? 'Spanish' : 'English';

  await transporter.sendMail({
    from: `"Alma Digital Services" <${process.env.NOTIFICATION_EMAIL}>`,
    to: toEmail,
    subject: `Your WhatsApp Agent is Live — ${businessName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #ffffff; padding: 40px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #00d4aa; margin: 0;">You're Live!</h1>
        </div>

        <p>Hi there,</p>

        <p>Great news — your AlmaReach AI WhatsApp agent for <strong>${businessName}</strong> is now active and ready to help your customers.</p>

        <div style="background: #1a1a2e; padding: 24px; border-radius: 8px; text-align: center; margin: 24px 0;">
          <p style="color: #888; margin: 0 0 8px 0; font-size: 14px;">Your WhatsApp Number</p>
          <p style="color: #00d4aa; font-size: 28px; font-weight: bold; margin: 0;">${phoneNumber}</p>
        </div>

        <h3 style="color: #00d4aa;">What happens now:</h3>
        <p>1. Share your WhatsApp number with customers (on your website, social media, business cards)</p>
        <p>2. Your AI agent responds instantly, 24/7, in ${langText}</p>
        <p>3. When a customer asks to speak to a human, you'll get an email notification with the full conversation</p>

        <h3 style="color: #00d4aa;">Need to update your agent?</h3>
        <p>Just email <strong>update@almawebcreative.com</strong> with what you'd like to change (services, hours, pricing, etc.) and we'll update your agent within 24 hours.</p>

        <div style="border-top: 1px solid #333; margin-top: 32px; padding-top: 16px; text-align: center; color: #666; font-size: 12px;">
          Alma Digital Services — Miami, FL<br>
          Powered by AlmaReach AI
        </div>
      </div>
    `,
  });

  console.log(`[email] Provisioned email sent to ${toEmail}`);
}

/**
 * Send cancellation confirmation email.
 */
async function sendCancellationEmail(toEmail, clientName) {
  const transporter = getTransporter();

  await transporter.sendMail({
    from: `"Alma Digital Services" <${process.env.NOTIFICATION_EMAIL}>`,
    to: toEmail,
    subject: `Your AlmaReach AI Subscription Has Been Cancelled`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #ffffff; padding: 40px; border-radius: 12px;">
        <p>Hi ${clientName},</p>

        <p>Your AlmaReach AI WhatsApp agent subscription has been cancelled. Your WhatsApp number has been deactivated.</p>

        <p>If this was a mistake or you'd like to reactivate, just reply to this email and we'll help you get back up and running.</p>

        <p>Thank you for being a customer.</p>

        <div style="border-top: 1px solid #333; margin-top: 32px; padding-top: 16px; text-align: center; color: #666; font-size: 12px;">
          Alma Digital Services — Miami, FL
        </div>
      </div>
    `,
  });

  console.log(`[email] Cancellation email sent to ${toEmail}`);
}

/**
 * Send WhatsApp confirmation message to the new number (test message).
 */
async function sendWhatsAppConfirmation(whatsappNumber, notificationEmail) {
  // Note: Sending a WhatsApp message requires an approved template or
  // an active conversation. This is a best-effort test.
  console.log(`[email] WhatsApp confirmation would be sent from ${whatsappNumber}`);
}

module.exports = {
  sendOnboardingEmail,
  sendProvisionedEmail,
  sendCancellationEmail,
  sendWhatsAppConfirmation,
};
