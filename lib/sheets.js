const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID || '14hDlASmDxl434OtkRiN6pJVu6-Bdca83lFlsTqHn-zQ';
const SHEET_NAME = 'Clients';

// Column mapping (A-based index)
const COLS = {
  sessionId: 0,       // A
  stripeSessionId: 1,  // B
  stripeCustomerId: 2, // C
  email: 3,            // D
  name: 4,             // E
  planType: 5,         // F
  isBundle: 6,         // G
  status: 7,           // H
  businessName: 8,     // I
  businessType: 9,     // J
  services: 10,        // K
  businessHours: 11,   // L
  bookingLink: 12,     // M
  notificationEmail: 13, // N
  language: 14,        // O
  twilioNumber: 15,    // P
  twilioSid: 16,       // Q
  railwayServiceId: 17, // R
  railwayUrl: 18,      // S
  createdAt: 19,       // T
  provisionedAt: 20,   // U
  cancelledAt: 21,     // V
};

const HEADERS = Object.keys(COLS);

async function getAuth() {
  // Use service account credentials from env var (JSON string)
  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!credentials) {
    console.warn('[sheets] No GOOGLE_SERVICE_ACCOUNT_KEY set — sheet operations will be skipped');
    return null;
  }

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(credentials),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return auth;
}

async function getSheets() {
  const auth = await getAuth();
  if (!auth) return null;
  return google.sheets({ version: 'v4', auth });
}

/**
 * Ensure the header row exists.
 */
async function ensureHeaders(sheets) {
  if (!sheets) return;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1:V1`,
  });

  if (!res.data.values || res.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:V1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
    console.log('[sheets] Headers created');
  }
}

/**
 * Log a new client record to the sheet.
 */
async function logToSheet(clientData) {
  const sheets = await getSheets();
  if (!sheets) {
    console.log('[sheets] Skipping log (no credentials)');
    return;
  }

  await ensureHeaders(sheets);

  const row = new Array(HEADERS.length).fill('');
  for (const [key, colIdx] of Object.entries(COLS)) {
    if (clientData[key] !== undefined) {
      row[colIdx] = String(clientData[key]);
    }
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:V`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });

  console.log(`[sheets] Logged client: ${clientData.name || clientData.email}`);
}

/**
 * Find a client row by session ID.
 */
async function findClientBySessionId(sessionId) {
  const sheets = await getSheets();
  if (!sheets) {
    console.log('[sheets] Skipping find (no credentials) — returning mock');
    return null;
  }

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:V`,
  });

  const rows = res.data.values || [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][COLS.sessionId] === sessionId) {
      return rowToClient(rows[i]);
    }
  }

  return null;
}

/**
 * Find a client row by Stripe customer ID.
 */
async function findClientByStripeCustomer(stripeCustomerId) {
  const sheets = await getSheets();
  if (!sheets) return null;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:V`,
  });

  const rows = res.data.values || [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][COLS.stripeCustomerId] === stripeCustomerId) {
      return rowToClient(rows[i]);
    }
  }

  return null;
}

/**
 * Update a client row by session ID.
 */
async function updateClientInSheet(sessionId, updates) {
  const sheets = await getSheets();
  if (!sheets) {
    console.log('[sheets] Skipping update (no credentials)');
    return;
  }

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:V`,
  });

  const rows = res.data.values || [];
  let rowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][COLS.sessionId] === sessionId) {
      rowIndex = i;
      break;
    }
  }

  if (rowIndex === -1) {
    console.warn(`[sheets] Session ${sessionId} not found for update`);
    return;
  }

  const row = rows[rowIndex];
  for (const [key, value] of Object.entries(updates)) {
    if (COLS[key] !== undefined) {
      row[COLS[key]] = String(value);
    }
  }

  // Sheets rows are 1-indexed, +1 for header
  const sheetRow = rowIndex + 1;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A${sheetRow}:V${sheetRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });

  console.log(`[sheets] Updated session ${sessionId}: ${Object.keys(updates).join(', ')}`);
}

function rowToClient(row) {
  const client = {};
  for (const [key, colIdx] of Object.entries(COLS)) {
    client[key] = row[colIdx] || '';
  }
  return client;
}

module.exports = {
  logToSheet,
  findClientBySessionId,
  findClientByStripeCustomer,
  updateClientInSheet,
};
