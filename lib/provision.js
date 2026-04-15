const fetch = require('node-fetch');
const twilio = require('twilio');
const { sendProvisionedEmail, sendWhatsAppConfirmation } = require('./email');

const RAILWAY_API = 'https://backboard.railway.app/graphql/v2';

/**
 * Generate a custom system prompt from the client's form data.
 */
function generateSystemPrompt(data) {
  const langInstruction = data.language === 'both'
    ? 'LANGUAGE: Auto-detect. Spanish input = Spanish output. English input = English output. Never mix languages in a single message.'
    : data.language === 'ES'
      ? 'LANGUAGE: Always respond in Spanish unless the customer explicitly writes in English.'
      : 'LANGUAGE: Always respond in English unless the customer explicitly writes in Spanish.';

  const bookingSection = data.bookingLink
    ? `BOOKING: If the customer wants to schedule, send them this link: ${data.bookingLink}`
    : 'BOOKING: If the customer wants to schedule an appointment, collect their name, preferred date/time, and contact info, then tell them someone from the team will confirm shortly.';

  return `You are a friendly, professional AI assistant for ${data.businessName}. You represent the business warmly and helpfully, like a knowledgeable team member who genuinely wants to help.

BUSINESS: ${data.businessName} — ${data.businessType}
SERVICES: ${data.services}
HOURS: ${data.businessHours || 'Contact us for availability'}

${langInstruction}

FORMATTING: Plain text only. No asterisks, no bullets, no markdown. Keep responses concise (2-4 sentences). Never start with "I", "Great!", "Of course!", or "Absolutely!".

${bookingSection}

BEHAVIOR:
- Answer questions about services, hours, and pricing naturally
- For complex or account-specific issues, say you will flag it for the team and they will follow up shortly
- If someone asks to speak to a human, say a team member will be in touch shortly
- Always end with something that moves the conversation forward — a question, a next step, or an offer to help with something else
- Be warm but efficient. Customers are texting, so keep it brief.

HUMAN HANDOFF: If the customer says "speak to someone", "human", "agent", "real person", or similar — trigger the handoff flow.`;
}

/**
 * Buy a US phone number from Twilio and register it for WhatsApp.
 */
async function purchaseTwilioNumber(client) {
  const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  // Search for an available US local number
  const available = await twilioClient.availablePhoneNumbers('US')
    .local.list({ limit: 1, smsEnabled: true, voiceEnabled: true });

  if (available.length === 0) {
    throw new Error('No available US phone numbers found');
  }

  // Purchase the number
  const purchased = await twilioClient.incomingPhoneNumbers.create({
    phoneNumber: available[0].phoneNumber,
    friendlyName: `AlmaReach - ${client.businessName}`,
  });

  console.log(`[twilio] Purchased number: ${purchased.phoneNumber} (SID: ${purchased.sid})`);

  return {
    phoneNumber: purchased.phoneNumber,
    phoneSid: purchased.sid,
    whatsappNumber: `whatsapp:${purchased.phoneNumber}`,
  };
}

/**
 * Create a new Railway service by cloning the template and setting env vars.
 */
async function createRailwayService(client, twilioNumber, systemPrompt) {
  const projectId = process.env.RAILWAY_PROJECT_ID;
  const token = process.env.RAILWAY_TOKEN;

  // Create a new service in the project
  const createServiceRes = await fetch(RAILWAY_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `mutation {
        serviceCreate(input: {
          projectId: "${projectId}"
          name: "whatsapp-${client.businessName.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 30)}"
          source: { repo: "almadigitalsystems/almareach-whatsapp-agent" }
        }) {
          id
          name
        }
      }`,
    }),
  });

  const createData = await createServiceRes.json();
  if (createData.errors) {
    throw new Error(`Railway service creation failed: ${JSON.stringify(createData.errors)}`);
  }

  const serviceId = createData.data.serviceCreate.id;
  const serviceName = createData.data.serviceCreate.name;
  console.log(`[railway] Created service: ${serviceName} (${serviceId})`);

  // Get the default environment for the project
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
    throw new Error('No Railway environment found');
  }

  const environmentId = prodEnv.node.id;

  // Set environment variables on the new service
  const envVars = {
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_WHATSAPP_NUMBER: twilioNumber.whatsappNumber,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    NOTIFICATION_EMAIL: client.notificationEmail || process.env.NOTIFICATION_EMAIL,
    NOTIFICATION_EMAIL_PASSWORD: process.env.NOTIFICATION_EMAIL_PASSWORD,
    SYSTEM_PROMPT: systemPrompt,
    PLAN_TYPE: client.planType || 'starter',
    NODE_ENV: 'production',
  };

  // Upsert variables one batch
  const varMutations = Object.entries(envVars).map(([key, value], i) => {
    const escapedValue = JSON.stringify(value);
    return `v${i}: variableUpsert(input: { projectId: "${projectId}", environmentId: "${environmentId}", serviceId: "${serviceId}", name: "${key}", value: ${escapedValue} })`;
  }).join('\n');

  const varRes = await fetch(RAILWAY_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `mutation { ${varMutations} }`,
    }),
  });

  const varData = await varRes.json();
  if (varData.errors) {
    console.error('[railway] Env var errors:', varData.errors);
  }

  console.log(`[railway] Environment variables set for ${serviceName}`);

  // Get the service domain/URL
  // Railway auto-generates a domain; we may need to create one
  const domainRes = await fetch(RAILWAY_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `mutation {
        serviceDomainCreate(input: {
          serviceId: "${serviceId}"
          environmentId: "${environmentId}"
        }) {
          id
          domain
        }
      }`,
    }),
  });

  const domainData = await domainRes.json();
  const domain = domainData.data?.serviceDomainCreate?.domain;
  const serviceUrl = domain ? `https://${domain}` : null;

  console.log(`[railway] Service URL: ${serviceUrl}`);

  return {
    serviceId,
    serviceName,
    serviceUrl,
    environmentId,
  };
}

/**
 * Set the Twilio webhook to point to the new Railway service.
 */
async function setTwilioWebhook(phoneSid, serviceUrl) {
  const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  // Note: For WhatsApp, the webhook is configured via the Twilio Messaging Service
  // or via the WhatsApp Sender configuration. For now, update the phone number's
  // SMS webhook URL, which Twilio uses for WhatsApp messages on that number.
  await twilioClient.incomingPhoneNumbers(phoneSid).update({
    smsUrl: `${serviceUrl}/whatsapp/webhook`,
    smsMethod: 'POST',
  });

  console.log(`[twilio] Webhook set: ${serviceUrl}/whatsapp/webhook`);
}

/**
 * Full provisioning flow: Twilio number → Railway service → webhook → confirmation.
 */
async function provisionClient(client) {
  console.log(`[provision] Starting provisioning for ${client.businessName}`);

  // 1. Generate system prompt
  const systemPrompt = generateSystemPrompt(client);
  console.log(`[provision] System prompt generated (${systemPrompt.length} chars)`);

  // 2. Purchase Twilio number
  const twilioNumber = await purchaseTwilioNumber(client);
  console.log(`[provision] Twilio number: ${twilioNumber.phoneNumber}`);

  // 3. Create Railway service with env vars
  const railway = await createRailwayService(client, twilioNumber, systemPrompt);
  console.log(`[provision] Railway service: ${railway.serviceName}`);

  // 4. Set Twilio webhook (after Railway deploys)
  // Note: Railway deployment takes a moment. The webhook URL is set immediately,
  // and Railway will serve it once the build completes.
  if (railway.serviceUrl) {
    await setTwilioWebhook(twilioNumber.phoneSid, railway.serviceUrl);
  } else {
    console.warn('[provision] No service URL yet — webhook must be set manually after deploy');
  }

  // 5. Send confirmation email to client
  await sendProvisionedEmail(client.email, client.businessName, twilioNumber.phoneNumber, client.language);

  // 6. Send WhatsApp test message
  try {
    await sendWhatsAppConfirmation(twilioNumber.whatsappNumber, client.notificationEmail);
  } catch (err) {
    console.warn('[provision] WhatsApp confirmation skipped:', err.message);
  }

  console.log(`[provision] Provisioning complete for ${client.businessName}`);

  return {
    twilioNumber: twilioNumber.phoneNumber,
    twilioSid: twilioNumber.phoneSid,
    railwayServiceId: railway.serviceId,
    railwayUrl: railway.serviceUrl,
  };
}

module.exports = { provisionClient, generateSystemPrompt };
