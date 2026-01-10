import type { BaseVADConfig } from './vad'

/**
 * VAD Configuration Presets for different use cases
 */
export interface VADPreset {
  name: string
  label: string
  description: string
  config: Partial<BaseVADConfig>
}

export const VAD_PRESETS: Record<string, VADPreset> = {
  conversation: {
    name: 'conversation',
    label: '会話モード',
    description: '日常会話や対話に最適な設定',
    config: {
      speechThreshold: 0.3,
      exitThreshold: 0.1,
      minSpeechDurationMs: 250,
      minSilenceDurationMs: 400,
      speechPadMs: 200,
    },
  },
  dictation: {
    name: 'dictation',
    label: 'ディクテーションモード',
    description: '口述筆記や短い発話の認識に最適',
    config: {
      speechThreshold: 0.25,
      exitThreshold: 0.08,
      minSpeechDurationMs: 100,
      minSilenceDurationMs: 600,
      speechPadMs: 250,
    },
  },
  lecture: {
    name: 'lecture',
    label: '講演モード',
    description: 'プレゼンテーションや長い発話に最適',
    config: {
      speechThreshold: 0.35,
      exitThreshold: 0.12,
      minSpeechDurationMs: 500,
      minSilenceDurationMs: 800,
      speechPadMs: 200,
    },
  },
  sensitive: {
    name: 'sensitive',
    label: '高感度モード',
    description: '小声や静かな環境での認識に最適',
    config: {
      speechThreshold: 0.2,
      exitThreshold: 0.05,
      minSpeechDurationMs: 200,
      minSilenceDurationMs: 500,
      speechPadMs: 300,
    },
  },
}

/**
 * Audio quality modes for device constraints
 */
export interface AudioQualityMode {
  name: string
  label: string
  description: string
  constraints: MediaTrackConstraints
}

export const AUDIO_QUALITY_MODES: Record<string, AudioQualityMode> = {
  highQuality: {
    name: 'highQuality',
    label: '高品質録音',
    description: '音声処理を無効化し、最高品質で録音',
    constraints: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      sampleRate: { ideal: 48000 },
      channelCount: { ideal: 1 },
    },
  },
  balanced: {
    name: 'balanced',
    label: 'バランス',
    description: '適度な音声処理で自然な音質',
    constraints: {
      echoCancellation: true,
      noiseSuppression: false,
      autoGainControl: false,
      sampleRate: { ideal: 16000 },
      channelCount: { ideal: 1 },
    },
  },
  noiseResistant: {
    name: 'noiseResistant',
    label: 'ノイズ耐性',
    description: '騒がしい環境での認識に最適',
    constraints: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: { ideal: 16000 },
      channelCount: { ideal: 1 },
    },
  },
}

/**
 * Transcription context presets
 */
export interface TranscriptionContextPreset {
  name: string
  label: string
  description: string
  prompt: string
  temperature: number
  language?: string
}

export const TRANSCRIPTION_PRESETS: Record<string, TranscriptionContextPreset> = {
  general: {
    name: 'general',
    label: '一般会話',
    description: '日常会話向けの標準設定',
    prompt: 'これは人間同士の会話の録音です。話し言葉を自然な日本語の文章に書き起こしてください。句読点は適切に入れてください。',
    temperature: 0,
    language: 'ja',
  },
  meeting: {
    name: 'meeting',
    label: '会議',
    description: 'ビジネス会議や打ち合わせ向け',
    prompt: 'これは会議の録音です。話し言葉を議事録として適切な日本語で書き起こしてください。専門用語や固有名詞を正確に認識してください。',
    temperature: 0.1,
    language: 'ja',
  },
  technical: {
    name: 'technical',
    label: '技術会話',
    description: '技術的な内容の会話向け',
    prompt: 'これは技術的な会話の録音です。技術用語、カタカナ語、英語表記を適切に使い分けて書き起こしてください。略語は文脈に応じて展開してください。',
    temperature: 0.2,
    language: 'ja',
  },
  casual: {
    name: 'casual',
    label: 'カジュアル',
    description: 'くだけた会話向け',
    prompt: 'これはカジュアルな会話の録音です。話し言葉のニュアンスを残しつつ、読みやすい日本語で書き起こしてください。',
    temperature: 0.3,
    language: 'ja',
  },
}
