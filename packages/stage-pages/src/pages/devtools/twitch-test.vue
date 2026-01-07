<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import TwitchClient from '@proj-airi/stage-shared/services/twitch-client'

const providersStore = useProvidersStore()
const cfg = providersStore.getProviderConfig('twitch') || {}

const channel = ref(cfg.channel || '')
const oauth = ref(cfg.oauth || '')
const client = new TwitchClient()
const messages = ref<Array<{user?: string; text?: string; timestamp?: number}>>([])
const status = ref('idle')
let unsubscribe: (() => void) | null = null

async function start() {
  status.value = 'connecting'
  messages.value = []
  try {
    await client.connect(oauth.value, channel.value)
    status.value = 'connected'
    unsubscribe = client.onMessage(msg => {
      messages.value.push({ user: msg.user, text: msg.text, timestamp: msg.timestamp })
    })
  }
  catch (err: any) {
    status.value = `error: ${String(err?.message || err)}`
  }
}

function stop() {
  if (unsubscribe) unsubscribe()
  unsubscribe = null
  client.disconnect()
  status.value = 'disconnected'
}

onUnmounted(() => {
  stop()
})
</script>

<template>
  <div class="p-4">
    <h2 class="text-lg font-semibold">Twitch Test (Devtools)</h2>

    <div class="mt-3">
      <label class="block text-sm">Channel</label>
      <input v-model="channel" class="w-full mt-1 p-2 border rounded" />
    </div>
    <div class="mt-3">
      <label class="block text-sm">OAuth token</label>
      <input v-model="oauth" class="w-full mt-1 p-2 border rounded" />
    </div>

    <div class="mt-3 flex gap-2">
      <button @click="start" class="px-3 py-1 bg-blue-600 text-white rounded">Start</button>
      <button @click="stop" class="px-3 py-1 bg-red-600 text-white rounded">Stop</button>
      <span class="self-center">Status: {{ status }}</span>
    </div>

    <div class="mt-4">
      <div v-for="(m, i) in messages" :key="i" class="border-b py-2">
        <div class="text-sm"><strong>{{ m.user }}</strong> <span class="text-xs text-neutral-500">{{ new Date(m.timestamp).toLocaleTimeString() }}</span></div>
        <div>{{ m.text }}</div>
      </div>
    </div>
  </div>
</template>
