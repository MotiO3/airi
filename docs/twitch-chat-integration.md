Twitch Chat → AI Chat Integration

Goal

Allow AIRI to ingest live Twitch chat messages and forward selected messages to an AI chat provider (existing provider system), enabling features such as: summarization, question answering, moderation help, and interactive chatbot responses.

Design overview

Components

- Twitch Ingest Layer (server or client): Responsible for connecting to Twitch chat via IRC (tmi.twitch.tv) or PubSub/Webhooks. It manages authentication, reconnection, rate-limiting, and emits normalized chat events.

- Message Filter/Policy: Rules to decide which messages should be forwarded to AI (e.g., commands, mentions, subscriber-only, language detection, blacklist/whitelist, profanity filters, spam detectors). Operates both in-memory and can be persisted via settings.

- Queueing & Batching: Buffer messages to avoid hitting API rate limits. Provide options: forward immediately, batch N messages, or sliding-window aggregation (e.g., 5s windows).

- AI Connector: Reuse existing provider system (`providers` store) to send messages to chat providers (OpenAI, XAI, Ollama, etc.). Handles conversation context, role assignment (system/user), and backoff.

- UI Components: In-app Twitch Chat view, toggle switches, settings for filtering, and manual forward button. Show forwarding status and responses.

- Persistence: Store credentials (OAuth tokens) securely in provider credentials storage (existing `settings/credentials/providers`), store per-channel settings in localStorage or app settings store.

- Telemetry & Logging: Track forwarding events, errors, rate-limit events, and sample messages for debugging (redact PII).

Data flow

1. Operator configures Twitch channel & OAuth credentials in AIRI settings.
2. Ingest layer subscribes to chat (IRC or PubSub).
3. Chat messages arrive as events: { id, channel, user, text, badges, emotes, timestamp }
4. Message Filter/Policy runs: drop/spam/forward decisions; for forwarded messages, attach metadata (reason, user role, badges).
5. Messages go to Queueing & Batching. Optionally group messages into a single prompt (e.g., "Recent questions from chat: ...").
6. AI Connector receives prompt(s), maps them to provider API (chat completions or conversation API), and returns result.
7. Results are persisted/displayed and optionally posted back to Twitch chat (if enabled) or shown in app UI.

Transport options

- IRC (tmi.twitch.tv): Simple and client-friendly. Pros: easy to implement, supports joining multiple channels. Cons: limited event richness, requires maintaining IRC connection and handling reconnections.

- Twitch PubSub / EventSub: More robust, supports advanced topics (bits, subscriptions, whispers). Requires webhook or persistent connection and Twitch app registration.

- Recommendation: Start with IRC (tmi) for MVP; add PubSub/EventSub later for deeper integration.

Authentication

- Use OAuth tokens (user or bot account). For IRC, a token with chat:read privileges is enough. For posting messages, chat:edit and chat:manage: the appropriate scopes are required.

- Store tokens in `settings/credentials/providers` similar to other providers. Encrypt at rest if desktop; use secure storage on servers.

Filtering & Safety

- Basic filters: block blacklisted words, block messages shorter than X chars, block non-Japanese language via language detection (optional).

- Trust levels: high-trust (moderators, VIPs), medium (subscribers), low (others). Allow policy that only forwards messages from trusted users or those that mention the bot.

- Rate-limit: queue and throttle to not exceed AI provider rate-limits. Implement exponential backoff on 429.

AI prompt mapping

- Map chat messages to an input prompt template. Example (per-message):

  System: "You are a helpful assistant specialized to answer Twitch chat questions in Japanese."
  User: "[username] asked: [message text]"

- For batching: combine recent N messages into one prompt with clear separators and indicate that the AI should respond only to items labeled "ANSWER:" or similar.

- Keep conversation context small: store last M messages per channel to provide context; support per-channel conversation reset.

Posting responses

- Optionally post AI responses back to chat: ensure rate-limits, and optionally prepend a bot prefix or ensure moderator review before posting.

UI changes

- Settings page: add "Twitch" provider section with "Connect account", channels list, forwarding toggles, filters, and per-channel settings.

- Live view: add a Twitch chat panel (read-only) with message forwarding indicators and a control to manually forward a message.

- Alerts: show errors and throttling state.

Implementation plan (MVP)

1. Design provider for Twitch credentials in `packages/stage-ui/src/stores/providers.ts` (or reuse generic provider store). UI to add token.
2. Implement `packages/twitch-client` (or `packages/stage-shared/twitch`) module:
   - Connect to IRC (tmi) or implement lightweight IRC client using WebSocket to tmi.twitch.tv
   - Emit normalized events
   - Reconnect logic
3. Implement MessageFilter service (rules, blacklist/whitelist) in `packages/stage-shared`.
4. Implement Queue & AI Connector in `packages/stage-ui` stores:
   - Reuse `useProvidersStore` to pick AI provider
   - Implement message batching and throttling
5. Add UI components in `packages/stage-ui/src/components`:
   - `TwitchChatPanel.vue`
   - `TwitchSettings.vue`
6. Tests & docs

Security & Privacy

- Do not forward private data (whispers) unless explicitly allowed.
- Redact or hash PII when stored in logs.
- Use least privilege OAuth scopes; allow operator to revoke tokens.

Monitoring & Metrics

- Expose counts: messages received, forwarded, rate-limited, failed.
- Log sample forwarded messages (redacted) and AI responses for debugging.

Roadmap & Extensions

- Add EventSub support for richer events.
- Add auto-moderation features (toxicity detection).
- Add server-side component to handle high-volume channels.

Acceptance criteria for MVP

- Operator can configure a Twitch token and channel in settings
- AIRI successfully receives chat messages in-app for configured channels
- Manual and automatic forwarding of chat messages to AI provider works (with basic filtering)
- AI responses can be shown in UI (posting back to chat optional)


"Done" deliverables

- `packages/stage-shared` or `packages/twitch-client` module that connects to Twitch IRC and emits normalized events
- Store-level AI connector and queue in `packages/stage-ui`
- UI settings + chat panel components
- Documentation (this doc)


Notes

- Keep MVP simple: IRC-only ingest, per-message forwarding on mention, manual toggle, and UI display.
- Prioritize safety: default to not posting AI responses back to chat, and require explicit operator opt-in.
