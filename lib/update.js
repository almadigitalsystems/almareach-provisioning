const express = require('express');
const fetch = require('node-fetch');
const { findClientBySessionId, updateClientInSheet } = require('./sheets');

const router = express.Router();
const RAILWAY_API = 'https://backboard.railway.app/graphql/v2';

/**
 * Endpoint to update a client's system prompt.
 * Called when a client emails update@almawebcreative.com with changes.
 *
 * Expected body:
 * {
 *   "sessionId": "...",       // or "email": "..." to look up
 *   "updates": {
 *     "services": "new services list",
 *     "businessHours": "new hours",
 *     "bookingLink": "new link"
 *   }
 * }
 */
router.post('/client', async (req, res) => {
  const { sessionId, updates } = req.body;

  if (!sessionId || !updates) {
    return res.status(400).json({ error: 'sessionId and updates are required' });
  }

  try {
    const client = await findClientBySessionId(sessionId);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Merge updates into client data
    const updatedClient = { ...client, ...updates };

    // Regenerate system prompt
    const { generateSystemPrompt } = require('./provision');
    const newPrompt = generateSystemPrompt(updatedClient);

    // Push updated SYSTEM_PROMPT to Railway
    if (client.railwayServiceId) {
      await updateRailwayEnvVar(client.railwayServiceId, 'SYSTEM_PROMPT', newPrompt);
    }

    // Update the sheet
    await updateClientInSheet(sessionId, {
      ...updates,
      status: 'active_updated',
    });

    console.log(`[update] System prompt updated for ${client.businessName}`);
    res.json({ success: true, message: 'Client agent updated' });
  } catch (err) {
    console.error('[update] Error:', err);
    res.status(500).json({ error: 'Update failed' });
  }
});

/**
 * Push an environment variable update to a Railway service.
 */
async function updateRailwayEnvVar(serviceId, key, value) {
  const token = process.env.RAILWAY_TOKEN;
  const projectId = process.env.RAILWAY_PROJECT_ID;

  // Get environment ID
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
  const escapedValue = JSON.stringify(value);

  const res = await fetch(RAILWAY_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `mutation { variableUpsert(input: { projectId: "${projectId}", environmentId: "${environmentId}", serviceId: "${serviceId}", name: "${key}", value: ${escapedValue} }) }`,
    }),
  });

  const data = await res.json();
  if (data.errors) {
    throw new Error(`Railway env var update failed: ${JSON.stringify(data.errors)}`);
  }

  console.log(`[railway] Updated ${key} for service ${serviceId}`);
}

module.exports = router;
