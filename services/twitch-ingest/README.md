# twitch-ingest

Minimal Twitch ingestion service using tmi.js.

Features
- Connect to Twitch via OAuth and tmi.js
- Broadcast incoming chat messages to any connected WebSocket client
- Optional /forward endpoint to call OpenAI Chat Completion (if `OPENAI_API_KEY` is set)

Quickstart

1. Install dependencies

```bash
cd services/twitch-ingest
pnpm install
```

2. Start service

```bash
OPENAI_API_KEY=sk-... pnpm start
```

3. Tell the service to listen on channels

POST /listen with JSON body:

```json
{
  "oauth": "your_oauth_token_without_prefix",
  "username": "your_account_username",
  "channels": ["channel1", "channel2"]
}
```

4. Connect a WebSocket client to receive messages (ws://localhost:3001)

Payloads are broadcast as JSON with shape: `{ type: 'twitch:message', payload: { channel, user, message, tags, timestamp }}`

Notes
- This service keeps tokens in memory for the running process. For production, secure storage and access controls are required.
- Use server-side ingestion when you need persistent connections, rate-limiting, and secure token handling.
