// Minimal Twitch IRC client for connect-test only.
// Uses native WebSocket to connect to Twitch IRC over WSS. This is intentionally minimal
// for a quick connectivity check in the browser environment. For production use, prefer
// using a battle-tested library like tmi.js on server or add robust reconnect/backoff.

export type TwitchMessage = {
  id?: string
  channel: string
  user?: string
  text?: string
  raw?: string
  timestamp?: number
}

export class TwitchClient {
  private ws: WebSocket | null = null
  private readonly url = 'wss://irc-ws.chat.twitch.tv:443'
  private messageHandlers: Array<(msg: TwitchMessage) => void> = []

  async connect(oauthToken: string, channel: string, timeoutMs = 5000): Promise<void> {
    if (!oauthToken) throw new Error('Missing oauth token')
    if (!channel) throw new Error('Missing channel')

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url)

        const onOpen = () => {
          // Send PASS and NICK then JOIN
          try {
            this.ws?.send(`PASS oauth:${oauthToken}`)
            // Twitch allows any nick for testing; API will validate auth
            this.ws?.send('NICK just-a-test')
            this.ws?.send(`JOIN #${channel.replace(/^#/, '')}`)
          }
          catch (err) {
            // ignore
          }
        }

        const onMessage = (ev: MessageEvent) => {
          const data = typeof ev.data === 'string' ? ev.data : ''
          // PING handling
          if (data.startsWith('PING')) {
            this.ws?.send(data.replace('PING', 'PONG'))
            return
          }

          // Successful join is indicated by numeric replies like 001 or welcome messages.
          if (data.includes('001') || data.toLowerCase().includes('welcome')) {
            // keep listening for chat messages, but resolve connect attempt
            resolve()
            return
          }

          // If this is a PRIVMSG (chat message), parse and emit to handlers
          // Example raw: ":someuser!someuser@someuser.tmi.twitch.tv PRIVMSG #channel :the message text"
          const lines = data.split('\r\n').filter(Boolean)
          for (const line of lines) {
            const privmsgMatch = line.match(/^:([^!]+)!([^@]+)@[^ ]+ PRIVMSG #?([^ ]+) :(.+)$/)
            if (privmsgMatch) {
              const user = privmsgMatch[1]
              const channelName = privmsgMatch[3]
              const text = privmsgMatch[4]
              const msg: TwitchMessage = {
                channel: channelName,
                user,
                text,
                raw: line,
                timestamp: Date.now(),
              }
              for (const h of this.messageHandlers) {
                try { h(msg) } catch { /* noop */ }
              }
            }
            else {
              // If any other non-empty response occurs during connect, treat it as a sign of life
              if (line.trim().length > 0) {
                // no-op for now
              }
            }
          }
        }

        const onError = (ev: Event) => {
          cleanup()
          reject(new Error('WebSocket error'))
        }

        const onClose = () => {
          // If closed before success, reject
          cleanup()
          reject(new Error('WebSocket closed before connection success'))
        }

        const cleanup = () => {
          if (!this.ws) return
          this.ws.removeEventListener('open', onOpen)
          this.ws.removeEventListener('message', onMessage as any)
          this.ws.removeEventListener('error', onError as any)
          this.ws.removeEventListener('close', onClose as any)
        }

        this.ws.addEventListener('open', onOpen)
        this.ws.addEventListener('message', onMessage as any)
        this.ws.addEventListener('error', onError as any)
        this.ws.addEventListener('close', onClose as any)

        // Timeout
        setTimeout(() => {
          cleanup()
          try { this.ws?.close() } catch { }
          reject(new Error('Twitch connect timeout'))
        }, timeoutMs)

        // Clear timer on resolve/reject via wrappers above
      }
      catch (err) {
        reject(err)
      }
    })
  }

  disconnect() {
    try {
      this.ws?.close()
    }
    catch (e) {
      // noop
    }
    this.ws = null
    this.messageHandlers = []
  }

  onMessage(handler: (msg: TwitchMessage) => void) {
    this.messageHandlers.push(handler)
    return () => {
      const idx = this.messageHandlers.indexOf(handler)
      if (idx >= 0) this.messageHandlers.splice(idx, 1)
    }
  }
}
export default TwitchClient
