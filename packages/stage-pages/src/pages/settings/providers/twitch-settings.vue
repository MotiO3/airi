<script setup lang="ts">
import { ref } from 'vue'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import TwitchClient from '@proj-airi/stage-shared/services/twitch-client'

const providersStore = useProvidersStore()

const channel = ref<string>('')
const oauth = ref<string>('')
const status = ref<string>('')

async function testConnection() {
  status.value = 'connecting'
  const client = new TwitchClient()
  try {
    await client.connect(oauth.value, channel.value)
    status.value = 'connected'
    client.disconnect()
  }
  catch (err: any) {
    status.value = `error: ${err?.message || String(err)}`
  }
}

function saveSettings() {
  // Save to providers credentials under key 'twitch'
  const cfg = providersStore.getProviderConfig('twitch') || {}
  cfg['channel'] = channel.value
  cfg['oauth'] = oauth.value
  providersStore.providers.value['twitch'] = cfg
  status.value = 'saved'
}
</script>

<template>
  <div class="p-4">
    <h2 class="text-lg font-semibold">Twitch Integration</h2>

    <div class="mt-3">
      <label class="block text-sm text-slate-700">Channel (without #)</label>
      <input v-model="channel" class="w-full mt-1 p-2 border rounded" placeholder="example_channel" />
    </div>

    <div class="mt-3">
      <label class="block text-sm text-slate-700">OAuth token (your OAUTH token without 'oauth:' prefix)</label>
      <input v-model="oauth" class="w-full mt-1 p-2 border rounded" placeholder="abcd1234..." />
    </div>

    <div class="mt-4 flex gap-2">
      <button @click="testConnection" class="px-3 py-1 bg-blue-600 text-white rounded">Test Connect</button>
      <button @click="saveSettings" class="px-3 py-1 bg-green-600 text-white rounded">Save</button>
      <span class="self-center">{{ status }}</span>
    </div>
  </div>
</template>
