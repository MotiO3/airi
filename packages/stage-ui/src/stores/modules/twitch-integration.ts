import { defineStore } from 'pinia'
import { ref } from 'vue'
import TwitchClient, { type TwitchMessage } from '@proj-airi/stage-shared/services/twitch-client'
import { useProvidersStore } from '../providers'

export const useTwitchIntegrationStore = defineStore('twitch-integration', () => {
  const client = new TwitchClient()
  const connected = ref(false)
  const messages = ref<TwitchMessage[]>([])
  let unsub: (() => void) | null = null

  async function start(oauth: string, channel: string) {
    if (connected.value) return
    messages.value = []
    try {
      await client.connect(oauth, channel)
      unsub = client.onMessage((m: TwitchMessage) => {
        messages.value.push(m)
      })
      connected.value = true
    }
    catch (err) {
      connected.value = false
      throw err
    }
  }

  function stop() {
    if (unsub) unsub()
    unsub = null
    client.disconnect()
    connected.value = false
  }

  async function forwardToProvider(providerId: string, model: string | undefined = undefined) {
    const providersStore = useProvidersStore()
    const provider = await providersStore.getProviderInstance(providerId as any)
    if (!provider || typeof provider.chat !== 'function') {
      throw new Error('Provider does not support chat')
    }

    // Send last N messages as a simple forward. For now, forward the last 10 messages as user messages.
  const payload = messages.value.slice(-10).map((m: TwitchMessage) => `${m.user}: ${m.text}`).join('\n')
    // provider.chat may expect different signature depending on implementation; try common shape
    return await (provider as any).chat(model || '', {
      messages: [
        { role: 'user', content: `Twitch chat dump:\n${payload}` },
      ],
    })
  }

  return {
    connected,
    messages,
    start,
    stop,
    forwardToProvider,
  }
})
