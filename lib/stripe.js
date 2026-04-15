const express = require('express');
const Stripe = require('stripe');
const { sendOnboardingEmail } = require('./email');
const { cancelClient } = require('./cancel');
const { logToSheet, findClientByStripeCustomer } = require('./sheets');

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

router.post('/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('[stripe] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`[stripe] Received event: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      default:
        console.log(`[stripe] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`[stripe] Error handling ${event.type}:`, err);
    // Return 200 to prevent Stripe retries on application errors
    // The error is logged for investigation
  }

  res.json({ received: true });
});

async function handleCheckoutCompleted(session) {
  const customerEmail = session.customer_details?.email;
  const customerName = session.customer_details?.name || 'Valued Client';
  const customerId = session.customer;
  const metadata = session.metadata || {};
  const isBundle = metadata.bundle === 'true';
  const planType = metadata.plan_type || 'starter';

  console.log(`[stripe] Checkout completed: ${customerEmail}, plan: ${planType}, bundle: ${isBundle}`);

  // Generate a unique session ID for the onboarding form
  const { v4: uuidv4 } = require('uuid');
  const onboardingSessionId = uuidv4();

  // Store session data for the onboarding form
  const clientData = {
    sessionId: onboardingSessionId,
    stripeSessionId: session.id,
    stripeCustomerId: customerId,
    email: customerEmail,
    name: customerName,
    planType,
    isBundle,
    status: 'pending_onboarding',
    createdAt: new Date().toISOString(),
  };

  // Log initial record to Google Sheet
  await logToSheet(clientData);

  // Send branded onboarding form email
  const formUrl = `${process.env.BASE_URL}/onboarding/${onboardingSessionId}`;
  await sendOnboardingEmail(customerEmail, customerName, formUrl, planType);

  // If bundle, fire Track A (website pipeline alert)
  if (isBundle) {
    console.log(`[stripe] Bundle detected — Track A: website pipeline alert for ${customerName}`);
    // Track A would create a Paperclip task for website provisioning
    // For now, log it — integration with Paperclip API comes in a follow-up
  }

  console.log(`[stripe] Onboarding email sent to ${customerEmail}, form: ${formUrl}`);
}

async function handleSubscriptionDeleted(subscription) {
  const customerId = subscription.customer;
  console.log(`[stripe] Subscription deleted for customer: ${customerId}`);

  try {
    const client = await findClientByStripeCustomer(customerId);
    if (client) {
      await cancelClient(client);
      console.log(`[stripe] Cancellation completed for ${client.name}`);
    } else {
      console.warn(`[stripe] No client found for Stripe customer: ${customerId}`);
    }
  } catch (err) {
    console.error('[stripe] Cancellation error:', err);
  }
}

module.exports = router;
