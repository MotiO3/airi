/**
 * Audio preprocessing utilities for improving transcription quality
 */

/**
 * Calculate RMS (Root Mean Square) level of audio buffer
 */
export function calculateRMS(buffer: Float32Array): number {
  let sum = 0
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i]
  }
  return Math.sqrt(sum / buffer.length)
}

/**
 * Normalize audio buffer to target RMS level
 * @param buffer Input audio buffer
 * @param targetRMS Target RMS level (0.0 - 1.0), default 0.1 (-20dBFS)
 * @returns Normalized audio buffer
 */
export function normalizeAudio(buffer: Float32Array, targetRMS: number = 0.1): Float32Array {
  const currentRMS = calculateRMS(buffer)
  
  if (currentRMS < 0.001) {
    // Buffer is essentially silent, return as-is
    return buffer
  }
  
  const gain = targetRMS / currentRMS
  const normalized = new Float32Array(buffer.length)
  
  for (let i = 0; i < buffer.length; i++) {
    // Apply gain with soft clipping to prevent distortion
    const sample = buffer[i] * gain
    normalized[i] = Math.max(-1.0, Math.min(1.0, sample))
  }
  
  return normalized
}

/**
 * Apply high-pass filter to remove low-frequency noise
 * Simple first-order IIR high-pass filter
 * @param buffer Input audio buffer
 * @param sampleRate Sample rate in Hz
 * @param cutoffFreq Cutoff frequency in Hz (default 60Hz for hum removal)
 * @returns Filtered audio buffer
 */
export function highPassFilter(
  buffer: Float32Array,
  sampleRate: number,
  cutoffFreq: number = 60,
): Float32Array {
  const rc = 1.0 / (cutoffFreq * 2 * Math.PI)
  const dt = 1.0 / sampleRate
  const alpha = rc / (rc + dt)
  
  const filtered = new Float32Array(buffer.length)
  filtered[0] = buffer[0]
  
  for (let i = 1; i < buffer.length; i++) {
    filtered[i] = alpha * (filtered[i - 1] + buffer[i] - buffer[i - 1])
  }
  
  return filtered
}

/**
 * Detect clipping in audio buffer
 * @param buffer Input audio buffer
 * @param threshold Clipping threshold (0.0 - 1.0), default 0.95
 * @returns Object with clipping detection results
 */
export function detectClipping(buffer: Float32Array, threshold: number = 0.95): {
  hasClipping: boolean
  clippedSamples: number
  clippingPercentage: number
} {
  let clippedSamples = 0
  
  for (let i = 0; i < buffer.length; i++) {
    if (Math.abs(buffer[i]) >= threshold) {
      clippedSamples++
    }
  }
  
  const clippingPercentage = (clippedSamples / buffer.length) * 100
  
  return {
    hasClipping: clippedSamples > 0,
    clippedSamples,
    clippingPercentage,
  }
}

/**
 * Apply soft clipping to prevent distortion
 * Uses a smooth tanh curve for natural-sounding limiting
 */
export function softClip(buffer: Float32Array, threshold: number = 0.8): Float32Array {
  const clipped = new Float32Array(buffer.length)
  
  for (let i = 0; i < buffer.length; i++) {
    const sample = buffer[i]
    
    if (Math.abs(sample) <= threshold) {
      clipped[i] = sample
    }
    else {
      // Apply smooth tanh limiting
      const sign = sample >= 0 ? 1 : -1
      const excess = Math.abs(sample) - threshold
      const limited = threshold + (1 - threshold) * Math.tanh(excess / (1 - threshold))
      clipped[i] = sign * limited
    }
  }
  
  return clipped
}

/**
 * Complete audio preprocessing pipeline
 */
export interface AudioPreprocessConfig {
  normalize?: boolean
  targetRMS?: number
  highPass?: boolean
  cutoffFreq?: number
  detectClip?: boolean
  applySoftClip?: boolean
  clipThreshold?: number
}

export interface AudioPreprocessResult {
  buffer: Float32Array
  stats: {
    originalRMS: number
    processedRMS: number
    clipping?: {
      hasClipping: boolean
      clippedSamples: number
      clippingPercentage: number
    }
  }
  warnings: string[]
}

export function preprocessAudio(
  buffer: Float32Array,
  sampleRate: number,
  config: AudioPreprocessConfig = {},
): AudioPreprocessResult {
  const {
    normalize = true,
    targetRMS = 0.1,
    highPass = true,
    cutoffFreq = 60,
    detectClip = true,
    applySoftClip = false,
    clipThreshold = 0.95,
  } = config
  
  let processed = buffer
  const warnings: string[] = []
  
  // Calculate original RMS
  const originalRMS = calculateRMS(buffer)
  
  // Detect clipping in original
  let clippingInfo
  if (detectClip) {
    clippingInfo = detectClipping(buffer, clipThreshold)
    if (clippingInfo.hasClipping && clippingInfo.clippingPercentage > 1.0) {
      warnings.push(
        `音声にクリッピングが検出されました (${clippingInfo.clippingPercentage.toFixed(2)}%)。マイクの音量を下げることを推奨します。`,
      )
    }
  }
  
  // Apply soft clipping if needed
  if (applySoftClip && clippingInfo?.hasClipping) {
    processed = softClip(processed, clipThreshold * 0.8)
  }
  
  // Apply high-pass filter
  if (highPass) {
    processed = highPassFilter(processed, sampleRate, cutoffFreq)
  }
  
  // Normalize audio
  if (normalize) {
    processed = normalizeAudio(processed, targetRMS)
  }
  
  // Check if audio is too quiet
  const processedRMS = calculateRMS(processed)
  if (processedRMS < 0.01) {
    warnings.push('音声レベルが非常に低いです。マイクの音量を上げることを推奨します。')
  }
  
  return {
    buffer: processed,
    stats: {
      originalRMS,
      processedRMS,
      clipping: clippingInfo,
    },
    warnings,
  }
}
