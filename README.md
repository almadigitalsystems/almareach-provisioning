# AlmaReach AI — Provisioning Pipeline

Autonomous provisioning pipeline for AlmaReach AI WhatsApp Business Agents.

## What It Does

1. **Stripe Webhook** — Listens for  and 2. **Onboarding Form** — Branded form collects business details after payment
3. **Auto-Provisioning** — Buys Twilio number, spins up Railway service, configures webhook, logs to Google Sheets
4. **Cancellation** — Pauses Railway service, releases Twilio number, notifies client
5. **Client Updates** — Endpoint to update system prompt and push to Railway

## Architecture

- **This repo** = provisioning pipeline (single service)
- **almareach-whatsapp-agent** = per-client WhatsApp agent template (cloned per client)

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET |  | Health check |
| POST |  | Stripe webhook receiver |
| GET |  | Serve onboarding form |
| POST |  | Process form + provision |
| POST |  | Update client system prompt |

## Setup

1. Copy  to  and fill in all values
2. Unknown command: "install"


Did you mean one of these?
  npm install # Install a package
  npm uninstall # Remove a package
To see a list of supported npm commands, run:
  npm help
3. Unknown command: "start"


Did you mean one of these?
  npm star # Mark your favorite packages
  npm stars # View packages marked as favorites
  npm start # Start a package
To see a list of supported npm commands, run:
  npm help

## Deployment

Deploy to Railway in the same project as the WhatsApp agent template.
Configure Stripe webhook URL to point to .
