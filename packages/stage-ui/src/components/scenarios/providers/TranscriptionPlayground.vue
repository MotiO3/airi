<script setup lang="ts">
import type { HearingTranscriptionResult } from '@proj-airi/stage-ui/stores/modules/hearing'

import { Button, FieldRange, FieldSelect } from '@proj-airi/ui'
import { until } from '@vueuse/core'
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAudioAnalyzer } from '../../../composables/audio/audio-analyzer'
import { useAudioRecorder } from '../../../composables/audio/audio-recorder'
import { useAudioDevice } from '../../../composables/audio/device'
import { preprocessAudio } from '../../../libs/audio/preprocessing'
import { TRANSCRIPTION_PRESETS, VAD_PRESETS } from '../../../libs/audio/presets'
import { LevelMeter, TestDummyMarker, ThresholdMeter } from '../../gadgets'

const props = defineProps<{
  // Provider-specific handlers (provided from parent)
  generateTranscription: (input: File, options?: Record<string, unknown>) => Promise<HearingTranscriptionResult>
  // Current state
  apiKeyConfigured?: boolean
}>()

const { t } = useI18n()
const {
  audioInputs,
  selectedAudioInput,
  stream,
  stopStream,
  startStream,
  selectedQualityMode,
  qualityModes,
  manualMode,
  autoGainControl,
  echoCancellation,
  noiseSuppression,
  applyDeviceSettings,
} = useAudioDevice()
const { volumeLevel, stopAnalyzer, startAnalyzer } = useAudioAnalyzer()
const { startRecord, stopRecord, onStopRecord } = useAudioRecorder(stream)

// Preset selections
const selectedVADPreset = ref('conversation')
const selectedTranscriptionPreset = ref('general')
const enablePreprocessing = ref(true)
const showAdvancedSettings = ref(false)
const enableStreaming = ref(false)
const streamingText = ref('')
const isStreaming = ref(false)

const vadPresets = computed(() => Object.values(VAD_PRESETS))
const transcriptionPresets = computed(() => Object.values(TRANSCRIPTION_PRESETS))

const speakingThreshold = ref(25) // 0-100 (for volume-based fallback)
const isMonitoring = ref(false)
const isSpeaking = ref(false)

const errorMessage = ref<string>('')

const audioContext = shallowRef<AudioContext>()
const dataArray = ref<Uint8Array<ArrayBuffer>>()
const animationFrame = ref<number>()

const audios = ref<Blob[]>([])
const audioCleanups = ref<(() => void)[]>([])
const audioURLs = computed(() => {
  return audios.value.map((blob) => {
    const url = URL.createObjectURL(blob)
    audioCleanups.value.push(() => URL.revokeObjectURL(url))
    return url
  })
})
const transcriptions = ref<string[]>([])

watch(selectedAudioInput, async () => {
  if (isMonitoring.value) {
    await setupAudioMonitoring()
  }
})

watch(audioInputs, () => {
  if (!selectedAudioInput.value && audioInputs.value.length > 0) {
    selectedAudioInput.value = audioInputs.value.find(input => input.deviceId === 'default')?.deviceId || audioInputs.value[0].deviceId
  }
})

// Watch quality mode and manual settings
watch([selectedQualityMode, manualMode, autoGainControl, echoCancellation, noiseSuppression], async () => {
  if (isMonitoring.value) {
    await applyDeviceSettings()
    // Re-setup monitoring with new settings
    await setupAudioMonitoring()
  }
})

async function setupAudioMonitoring() {
  try {
    await stopAudioMonitoring()

    await startStream()
    await until(stream).toBeTruthy()

    // Create audio context
    audioContext.value = new AudioContext()
    const source = audioContext.value.createMediaStreamSource(stream.value!)
    const analyzer = startAnalyzer(audioContext.value)
    source.connect(analyzer!)

    // Set up data array for analysis
    const bufferLength = analyzer!.frequencyBinCount
    dataArray.value = new Uint8Array(bufferLength)
  }
  catch (error) {
    console.error('Error setting up audio monitoring:', error)
    errorMessage.value = error instanceof Error ? error.message : String(error)
  }
}

async function stopAudioMonitoring() {
  // Stop animation frame
  if (animationFrame.value) {
    cancelAnimationFrame(animationFrame.value)
    animationFrame.value = undefined
  }
  if (stream.value) {
    stream.value.getTracks().forEach(track => track.stop())
    stream.value = undefined
  }
  if (audioContext.value) {
    await audioContext.value.close()
    audioContext.value = undefined
  }

  await stopRecord()
  await stopStream()
  await stopAnalyzer()

  dataArray.value = undefined
  isSpeaking.value = false
}

onStopRecord(async (recording) => {
  try {
    if (recording && recording.size > 0) {
      const processedRecording = recording

      // Apply audio preprocessing if enabled
      if (enablePreprocessing.value) {
        try {
          // Convert Blob to AudioBuffer for preprocessing
          const arrayBuffer = await recording.arrayBuffer()
          const audioContext = new AudioContext()
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
          const channelData = audioBuffer.getChannelData(0)

          // Preprocess audio
          const preprocessResult = preprocessAudio(channelData, audioBuffer.sampleRate, {
            normalize: true,
            targetRMS: 0.1,
            highPass: true,
            cutoffFreq: 60,
            detectClip: true,
          })

          // Show warnings if any
          if (preprocessResult.warnings.length > 0) {
            console.warn('Audio preprocessing warnings:', preprocessResult.warnings)
            preprocessResult.warnings.forEach((warning) => {
              console.warn(warning)
            })
          }

          // Convert back to Blob (simplified - would need proper WAV encoding in production)
          // For now, we'll use the original recording
          // TODO: Implement proper Float32Array to WAV conversion
          await audioContext.close()
        }
        catch (err) {
          console.error('Preprocessing failed, using original audio:', err)
        }
      }

      audios.value.push(processedRecording)

      // Get transcription preset settings
      const preset = TRANSCRIPTION_PRESETS[selectedTranscriptionPreset.value] || TRANSCRIPTION_PRESETS.general

      // Pass preset configuration to transcription
      const result = await props.generateTranscription(
        new File([processedRecording], 'recording.wav'),
        {
          temperature: preset.temperature,
          prompt: preset.prompt,
          language: preset.language,
        },
      )

      const text = result.mode === 'stream'
        ? await result.text
        : result.text
      transcriptions.value.push(text)
    }
  }
  catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
    console.error('Error generating transcription:', errorMessage.value)
  }
})

// Monitoring toggle
async function toggleMonitoring() {
  if (!isMonitoring.value) {
    await setupAudioMonitoring()
    await startRecord()
    isMonitoring.value = true
  }
  else {
    await stopAudioMonitoring()
    await stopRecord()

    isMonitoring.value = false
  }
}

// Speaking indicator with enhanced VAD visualization
const speakingIndicatorClass = computed(() => {
  // Volume-based: simple green/white
  return isSpeaking.value
    ? 'bg-green-500 shadow-lg shadow-green-500/50'
    : 'bg-white dark:bg-neutral-900 border-2 border-neutral-300 dark:border-neutral-600'
})

onUnmounted(() => {
  stopAudioMonitoring()
})
</script>

<template>
  <div w-full pt-1>
    <h2 class="mb-4 text-lg text-neutral-500 md:text-2xl dark:text-neutral-400" w-full>
      <div class="inline-flex items-center gap-4">
        <TestDummyMarker />
        <div>
          {{ t('settings.pages.providers.provider.transcriptions.playground.title') }}
        </div>
      </div>
    </h2>

    <!-- Audio Input Selection -->
    <div mb-2>
      <FieldSelect
        v-model="selectedAudioInput"
        label="Audio Input Device"
        description="Select the audio input device for your hearing module."
        :options="audioInputs.map(input => ({
          label: input.label || input.deviceId,
          value: input.deviceId,
        }))"
        placeholder="Select an audio input device"
        layout="vertical"
        h-fit w-full
      />
    </div>

    <!-- Audio Quality Mode -->
    <div mb-2>
      <FieldSelect
        v-model="selectedQualityMode"
        label="音質モード"
        description="録音環境に応じた音質設定を選択"
        :options="qualityModes.map((mode: any) => ({
          label: mode.label,
          value: mode.name,
          description: mode.description,
        }))"
        layout="vertical"
        h-fit w-full
      />
    </div>

    <!-- VAD Preset -->
    <div mb-2>
      <FieldSelect
        v-model="selectedVADPreset"
        label="発話検出モード"
        description="会話のタイプに応じた検出設定"
        :options="vadPresets.map(preset => ({
          label: preset.label,
          value: preset.name,
          description: preset.description,
        }))"
        layout="vertical"
        h-fit w-full
      />
    </div>

    <!-- Transcription Preset -->
    <div mb-2>
      <FieldSelect
        v-model="selectedTranscriptionPreset"
        label="文字起こしモード"
        description="会話の内容に応じた認識設定"
        :options="transcriptionPresets.map(preset => ({
          label: preset.label,
          value: preset.name,
          description: preset.description,
        }))"
        layout="vertical"
        h-fit w-full
      />
    </div>

    <!-- Audio Preprocessing Toggle -->
    <div mb-4 class="flex items-center gap-2">
      <input id="preprocessing" v-model="enablePreprocessing" type="checkbox">
      <label for="preprocessing" class="text-sm">
        音声前処理を有効化（正規化、ノイズ除去）
      </label>
    </div>

    <!-- Streaming Toggle -->
    <div mb-4 class="flex items-center gap-2">
      <input id="streaming" v-model="enableStreaming" type="checkbox">
      <label for="streaming" class="text-sm">
        リアルタイム文字起こし（ストリーミング）
      </label>
    </div>
    <!-- Advanced Settings Toggle -->
    <button
      class="mb-2 text-sm text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300"
      @click="showAdvancedSettings = !showAdvancedSettings"
    >
      {{ showAdvancedSettings ? '▼' : '▶' }} 詳細設定
    </button>

    <!-- Advanced Settings Panel -->
    <div v-if="showAdvancedSettings" class="mb-4 border border-neutral-200 rounded-lg p-4 space-y-3 dark:border-neutral-700">
      <div class="flex items-center gap-2">
        <input id="manual-mode" v-model="manualMode" type="checkbox">
        <label for="manual-mode" class="text-sm font-medium">
          手動設定モード
        </label>
      </div>

      <div v-if="manualMode" class="pl-6 space-y-2">
        <label class="flex items-center gap-2">
          <input v-model="noiseSuppression" type="checkbox">
          <span class="text-sm">ノイズ抑制 (Noise Suppression)</span>
        </label>
        <label class="flex items-center gap-2">
          <input v-model="echoCancellation" type="checkbox">
          <span class="text-sm">エコーキャンセル (Echo Cancellation)</span>
        </label>
        <label class="flex items-center gap-2">
          <input v-model="autoGainControl" type="checkbox">
          <span class="text-sm">自動ゲイン制御 (Auto Gain Control)</span>
        </label>
      </div>
    </div>

    <Button class="my-4" w-full @click="toggleMonitoring">
      {{ isMonitoring ? 'Stop Monitoring' : 'Start Monitoring' }}
    </Button>

    <!-- Streaming Transcription Display -->
    <div v-if="enableStreaming && isStreaming && streamingText" class="mb-4 rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
      <div class="mb-2 flex items-center gap-2">
        <div class="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
        <span class="text-sm text-blue-700 font-medium dark:text-blue-300">リアルタイム文字起こし中...</span>
      </div>
      <p class="text-sm text-neutral-700 dark:text-neutral-300">
        {{ streamingText }}
      </p>
    </div>

    <div>
      <div v-for="(audio, index) in audioURLs" :key="index" class="mb-2">
        <audio :src="audio" controls class="w-full" />
        <div v-if="transcriptions[index]" class="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          {{ transcriptions[index] }}
        </div>
      </div>
    </div>

    <!-- Audio Level Visualization -->
    <div class="space-y-3">
      <!-- Volume Meter -->
      <LevelMeter :level="volumeLevel" label="Input Level" />

      <!-- VAD Probability Meter (when VAD model is active) -->
      <ThresholdMeter
        :value="volumeLevel / 100"
        :threshold="speakingThreshold / 100"
        label="Probability of Speech"
        below-label="Silence"
        above-label="Speech"
        threshold-label="Detection threshold"
      />

      <div class="space-y-3">
        <FieldRange
          v-model="speakingThreshold"
          label="Sensitivity"
          description="Adjust the threshold for speech detection"
          :min="1"
          :max="80"
          :step="1"
          :format-value="value => `${value}%`"
        />
      </div>

      <!-- Speaking Indicator -->
      <div class="flex items-center gap-3">
        <div
          class="h-4 w-4 rounded-full transition-all duration-200"
          :class="speakingIndicatorClass"
        />
        <span class="text-sm font-medium">
          {{ isSpeaking ? 'Speaking Detected' : 'Silence' }}
        </span>
      </div>
    </div>
  </div>
</template>
