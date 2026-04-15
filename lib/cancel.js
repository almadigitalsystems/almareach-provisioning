const fetch = require('node-fetch');
const twilio = require('twilio');
const { sendCancellationEmail } = require('./email');
const { updateClientInSheet } = require('./sheets');

const RAILWAY_API = 'https://backboard.railway.app/graphql/v2';

/**
 * Pause a Railway service (remove it from active deployment).
 */
async function pauseRailwayService(serviceId) {
  const token = process.env.RAILWAY_TOKEN;

  // Get the project's production environment
  const projectId = process.env.RAILWAY_PROJECT_ID;
  const envRes = await fetch(RAILWAY_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `query { project(id: "${projectId}") { environments { edges { node { id name } } } } }`,
    }),
  });

  const envData = await envRes.json();
  const environments = envData.data?.project?.environments?.edges || [];
  const prodEnv = environments.find(e => e.node.name === 'production') || environments[0];

  if (!prodEnv) {
    console.warn('[railway] No environment found, cannot pause');
    return;
  }

  // Remove the service (or scale to zero if available)
  // Railway v2 API: delete the service instance to stop it
  const res = await fetch(RAILWAY_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `mutation { serviceDelete(id: "${serviceId}") }`,
    }),
  });

  const data = await res.json();
  if (data.errors) {
    console.error('[railway] Pause/delete errors:', data.errors);
  } else {
    console.log(`[railway] Service ${serviceId} deleted/paused`);
  }
}

/**
 * Release a Twilio phone number.
 */
async function releaseTwilioNumber(phoneSid) {
  const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  await twilioClient.incomingPhoneNumbers(phoneSid).remove();
  console.log(`[twilio] Released number SID: ${phoneSid}`);
}

/**
 * Full cancellation flow.
 */
async function cancelClient(client) {
  console.log(`[cancel] Starting cancellation for ${client.name} (${client.stripeCustomerId})`);

  // 1. Pause/delete Railway service
  if (client.railwayServiceId) {
    try {
      await pauseRailwayService(client.railwayServiceId);
    } catch (err) {
      console.error('[cancel] Railway pause failed:', err.message);
    }
  }

  // 2. Release Twilio number
  if (client.twilioSid) {
    try {
      await releaseTwilioNumber(client.twilioSid);
    } catch (err) {
      console.error('[cancel] Twilio release failed:', err.message);
    }
  }

  // 3. Send cancellation email
  await sendCancellationEmail(client.email, client.name);

  // 4. Update sheet
  await updateClientInSheet(client.sessionId, {
    status: 'cancelled',
    cancelledAt: new Date().toISOString(),
  });

  console.log(`[cancel] Cancellation complete for ${client.name}`);
}

module.exports = { cancelClient };
