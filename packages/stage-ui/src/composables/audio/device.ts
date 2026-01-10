import { useDevicesList, useUserMedia } from '@vueuse/core'
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import { AUDIO_QUALITY_MODES } from '../../libs/audio/presets'

export function useAudioDevice() {
  const devices = useDevicesList({ constraints: { audio: true }, requestPermissions: true })
  const audioInputs = computed(() => devices.audioInputs.value)
  const selectedAudioInput = ref<string>(devices.audioInputs.value[0]?.deviceId || '')
  
  // Audio quality mode selection
  const selectedQualityMode = ref<string>('balanced')
  const qualityModes = computed(() => Object.values(AUDIO_QUALITY_MODES))
  
  // Individual constraint toggles (for manual mode)
  const autoGainControl = ref<boolean>(true)
  const echoCancellation = ref<boolean>(true)
  const noiseSuppression = ref<boolean>(false)
  const manualMode = ref<boolean>(false)
  
  const deviceConstraints = computed<MediaStreamConstraints>(() => {
    const baseConstraints = {
      ...(selectedAudioInput.value ? { deviceId: { exact: selectedAudioInput.value } } : {}),
    }
    
    if (manualMode.value) {
      // Use manual settings
      return {
        audio: {
          ...baseConstraints,
          autoGainControl: autoGainControl.value,
          echoCancellation: echoCancellation.value,
          noiseSuppression: noiseSuppression.value,
        },
      }
    }
    else {
      // Use preset mode
      const mode = AUDIO_QUALITY_MODES[selectedQualityMode.value] || AUDIO_QUALITY_MODES.balanced
      return {
        audio: {
          ...baseConstraints,
          ...mode.constraints,
        },
      }
    }
  })
  const { stream, stop: stopStream, start: startStream } = useUserMedia({ constraints: deviceConstraints, enabled: false, autoSwitch: true })

  watch(audioInputs, () => {
    if (!selectedAudioInput.value && audioInputs.value.length > 0) {
      selectedAudioInput.value = audioInputs.value[0]?.deviceId
    }
  })

  // Lifecycle
  onMounted(() => {
    devices.ensurePermissions()
      .then(() => nextTick())
      .then(() => {
        if (audioInputs.value.length > 0 && !selectedAudioInput.value) {
          selectedAudioInput.value = audioInputs.value.find(input => input.deviceId === 'default')?.deviceId || audioInputs.value[0].deviceId
        }
      })
      .catch((error) => {
        console.error('Error ensuring permissions:', error)
      })
  })

  async function applyDeviceSettings() {
    try {
      // Safer to stop and restart stream so browser applies new constraints predictably
      const wasStreaming = !!stream.value
      await stopStream()
      await nextTick()
      if (wasStreaming) {
        await startStream()
      }
    }
    catch (err) {
      console.error('Error applying device settings:', err)
    }
  }

  return {
    audioInputs,
    selectedAudioInput,
    stream,
    stopStream,
    startStream,
    deviceConstraints,
    
    // Quality modes
    selectedQualityMode,
    qualityModes,
    
    // Manual controls
    manualMode,
    autoGainControl,
    echoCancellation,
    noiseSuppression,
    
    applyDeviceSettings,
  }
}
