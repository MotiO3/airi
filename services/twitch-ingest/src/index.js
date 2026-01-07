const express = require('express')
const http = require('http')
const WebSocket = require('ws')
const tmi = require('tmi.js')
const bodyParser = require('body-parser')

const PORT = process.env.PORT || 3001

const app = express()
app.use(bodyParser.json())

const server = http.createServer(app)
const wss = new WebSocket.Server({ server })

// Simple in-memory map of channel -> tmi client
const clients = new Map()

function broadcast(data) {
  const json = JSON.stringify(data)
  for (const ws of wss.clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(json)
    }
  }
}

app.post('/listen', async (req, res) => {
  // body: { oauth, username, channels: ['channel1', 'channel2'] }
  const { oauth, username, channels } = req.body || {}
  if (!oauth || !username || !channels || !Array.isArray(channels)) {
    return res.status(400).json({ error: 'oauth, username, channels[] are required' })
  }

  // If a client for this username already exists, join channels
  let c = clients.get(username)
  if (!c) {
    const client = new tmi.Client({
      identity: { username, password: `oauth:${oauth}` },
      connection: { reconnect: true, secure: true },
      channels: channels.map(ch => `#${ch.replace(/^#/, '')}`),
    })

    client.connect().catch(err => console.error('tmi connect error', err))

    client.on('message', (channel, tags, message, self) => {
      const payload = {
        channel: channel.replace('#', ''),
        user: tags['display-name'] || tags['username'] || tags['user-id'] || 'unknown',
        message,
        tags,
        timestamp: Date.now(),
      }
      broadcast({ type: 'twitch:message', payload })
    })

    clients.set(username, client)
    c = client
  } else {
    // join additional channels
    for (const ch of channels) {
      try { c.join(ch) } catch (e) { /* ignore */ }
    }
  }

  res.json({ ok: true })
})

// optional endpoint to forward a chat dump to OpenAI (if OPENAI_API_KEY is set)
app.post('/forward', async (req, res) => {
  const { model = 'gpt-4o-mini', messages } = req.body || {}
  if (!process.env.OPENAI_API_KEY) return res.status(501).json({ error: 'OPENAI_API_KEY not configured' })

  // Minimal forward: call OpenAI Chat completions via fetch
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, messages }),
    })
    const data = await resp.json()
    return res.json({ ok: true, data })
  }
  catch (err) {
    console.error('forward error', err)
    return res.status(500).json({ error: String(err) })
  }
})

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'hello', timestamp: Date.now() }))
})

server.listen(PORT, () => {
  console.log(`twitch-ingest listening on ${PORT}`)
})
