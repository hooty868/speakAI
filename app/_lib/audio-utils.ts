export interface AudioChunk {
  blob: Blob;
  startTime: number;
  endTime: number;
  index: number;
}

const CHUNK_DURATION = 300; // 5 minutes in seconds (reduced from 10)
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const TARGET_SAMPLE_RATE = 16000; // 16kHz for better compression

async function splitLargeChunk(audioBuffer: AudioBuffer, baseStartTime: number, baseIndex: number, sampleRate: number): Promise<AudioChunk[]> {
  const subChunks: AudioChunk[] = [];
  const duration = audioBuffer.length / sampleRate;
  const subChunkDuration = Math.min(120, duration / 2); // 最大2分鐘子片段
  const numSubChunks = Math.ceil(duration / subChunkDuration);

  for (let i = 0; i < numSubChunks; i++) {
    const startTime = i * subChunkDuration;
    const endTime = Math.min((i + 1) * subChunkDuration, duration);
    const subDuration = endTime - startTime;

    if (subDuration < 1) continue; // 跳過太短的片段

    const startSample = Math.floor(startTime * sampleRate);
    const length = Math.floor(subDuration * sampleRate);

    const subBuffer = new AudioContext().createBuffer(
      audioBuffer.numberOfChannels,
      length,
      sampleRate
    );

    // 複製音訊資料
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const sourceData = audioBuffer.getChannelData(channel);
      const targetData = subBuffer.getChannelData(channel);
      
      for (let sample = 0; sample < length; sample++) {
        const sourceSample = startSample + sample;
        targetData[sample] = sourceSample < sourceData.length ? sourceData[sourceSample] : 0;
      }
    }

    const wavBlob = await audioBufferToWav(subBuffer);
    
    if (wavBlob.size > 44) {
      subChunks.push({
        blob: wavBlob,
        startTime: baseStartTime + startTime,
        endTime: baseStartTime + endTime,
        index: baseIndex * 100 + i // 避免 index 衝突
      });
    }
  }

  return subChunks;
}

export async function splitAudioFile(file: File): Promise<AudioChunk[]> {
  if (file.size <= MAX_FILE_SIZE) {
    // 檔案小於限制，不需要分割
    return [{
      blob: file,
      startTime: 0,
      endTime: 0, // 會在轉譯時由 API 返回實際長度
      index: 0
    }];
  }

  return new Promise((resolve, reject) => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const fileReader = new FileReader();

    // 確保 AudioContext 處於運行狀態
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    fileReader.onload = async (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        const duration = audioBuffer.duration;
        const numChunks = Math.ceil(duration / CHUNK_DURATION);
        const chunks: AudioChunk[] = [];

        for (let i = 0; i < numChunks; i++) {
          const startTime = i * CHUNK_DURATION;
          const endTime = Math.min((i + 1) * CHUNK_DURATION, duration);
          const chunkDuration = endTime - startTime;

          // 確保片段有最小長度（至少1秒）
          if (chunkDuration < 1) {
            continue;
          }

          // 創建新的 AudioBuffer 片段，使用降採樣
          const targetSampleRate = Math.min(TARGET_SAMPLE_RATE, audioBuffer.sampleRate);
          const sampleRateRatio = audioBuffer.sampleRate / targetSampleRate;
          const targetLength = Math.floor(chunkDuration * targetSampleRate);
          
          const chunkBuffer = audioContext.createBuffer(
            Math.min(audioBuffer.numberOfChannels, 1), // 強制單聲道以減少檔案大小
            targetLength,
            targetSampleRate
          );

          // 複製音訊資料並進行降採樣
          for (let channel = 0; channel < chunkBuffer.numberOfChannels; channel++) {
            const sourceChannel = Math.min(channel, audioBuffer.numberOfChannels - 1);
            const sourceData = audioBuffer.getChannelData(sourceChannel);
            const chunkData = chunkBuffer.getChannelData(channel);
            const startSample = Math.floor(startTime * audioBuffer.sampleRate);
            
            // 如果需要多個聲道混合為單聲道
            if (audioBuffer.numberOfChannels > 1 && chunkBuffer.numberOfChannels === 1) {
              for (let sample = 0; sample < chunkData.length; sample++) {
                const sourceSampleIndex = startSample + Math.floor(sample * sampleRateRatio);
                let mixedSample = 0;
                
                // 混合所有聲道
                for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
                  const channelData = audioBuffer.getChannelData(ch);
                  if (sourceSampleIndex < channelData.length) {
                    mixedSample += channelData[sourceSampleIndex];
                  }
                }
                
                chunkData[sample] = mixedSample / audioBuffer.numberOfChannels;
              }
            } else {
              // 普通複製和降採樣
              for (let sample = 0; sample < chunkData.length; sample++) {
                const sourceSampleIndex = startSample + Math.floor(sample * sampleRateRatio);
                chunkData[sample] = sourceSampleIndex < sourceData.length ? sourceData[sourceSampleIndex] : 0;
              }
            }
          }

          // 轉換為 WAV blob
          const wavBlob = await audioBufferToWav(chunkBuffer);
          
          console.log(`Chunk ${i}: ${wavBlob.size} bytes, duration: ${chunkDuration.toFixed(1)}s, sample rate: ${targetSampleRate}Hz`);
          
          // 檢查生成的 blob 是否有效且不超過大小限制
          if (wavBlob.size > 44) { // WAV header 是 44 bytes
            if (wavBlob.size > MAX_FILE_SIZE) {
              // 如果單個片段仍然太大，進一步分割
              console.warn(`Chunk ${i} too large (${(wavBlob.size / 1024 / 1024).toFixed(1)}MB), splitting further...`);
              const subChunks = await splitLargeChunk(chunkBuffer, startTime, i, targetSampleRate);
              chunks.push(...subChunks);
            } else {
              chunks.push({
                blob: wavBlob,
                startTime,
                endTime,
                index: i
              });
            }
          }
        }

        if (chunks.length === 0) {
          reject(new Error('No valid audio chunks generated'));
        } else {
          resolve(chunks);
        }
      } catch (error) {
        console.error('Audio processing error:', error);
        reject(error);
      } finally {
        // 清理 AudioContext
        if (audioContext.state !== 'closed') {
          audioContext.close();
        }
      }
    };

    fileReader.onerror = () => reject(new Error('Failed to read file'));
    fileReader.readAsArrayBuffer(file);
  });
}

function audioBufferToWav(audioBuffer: AudioBuffer): Promise<Blob> {
  return new Promise((resolve) => {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;
    
    // 確保有效的音訊數據
    if (length === 0 || numberOfChannels === 0) {
      resolve(new Blob([], { type: 'audio/wav' }));
      return;
    }

    const arrayBuffer = new ArrayBuffer(44 + length * numberOfChannels * 2);
    const view = new DataView(arrayBuffer);

    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    const byteRate = sampleRate * numberOfChannels * 2;
    const blockAlign = numberOfChannels * 2;
    const dataSize = length * numberOfChannels * 2;

    // RIFF header
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true); // ChunkSize
    writeString(8, 'WAVE');

    // fmt subchunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
    view.setUint16(22, numberOfChannels, true); // NumChannels
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, byteRate, true); // ByteRate
    view.setUint16(32, blockAlign, true); // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample

    // data subchunk
    writeString(36, 'data');
    view.setUint32(40, dataSize, true); // Subchunk2Size

    // Convert float samples to 16-bit PCM
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const channelData = audioBuffer.getChannelData(channel);
        const sample = Math.max(-1, Math.min(1, channelData[i] || 0));
        const intSample = Math.round(sample * 32767);
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }

    resolve(new Blob([arrayBuffer], { type: 'audio/wav' }));
  });
}

export async function transcribeChunks(
  chunks: AudioChunk[],
  onProgress: (current: number, total: number, message: string) => void
): Promise<any[]> {
  const allSegments: any[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    onProgress(i + 1, chunks.length, `處理片段 ${i + 1}/${chunks.length}...`);

    // 跳過空的或太小的片段
    if (chunk.blob.size <= 44) {
      console.warn(`Skipping empty chunk ${i}`);
      continue;
    }

    let retries = 3;
    let success = false;

    while (retries > 0 && !success) {
      try {
        const formData = new FormData();
        formData.append('file', chunk.blob, `chunk_${i}.wav`);

        const response = await fetch('/api/transcribe', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`片段 ${i + 1} 轉譯失敗: ${errorText}`);
        }

        const result = await response.json();
        
        // 調整時間戳
        const adjustedSegments = result.segments.map((segment: any) => ({
          ...segment,
          start: segment.start + chunk.startTime,
          end: segment.end + chunk.startTime,
          id: `${i}_${segment.id}`
        }));

        allSegments.push(...adjustedSegments);
        success = true;
      } catch (error) {
        retries--;
        console.error(`Error processing chunk ${i} (${3 - retries}/3):`, error);
        
        if (retries === 0) {
          // 最後一次重試失敗，但不要完全停止，只是跳過這個片段
          console.error(`Failed to process chunk ${i} after 3 attempts, skipping...`);
          break;
        } else {
          // 等待一下再重試
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
  }

  // 重新編號
  return allSegments.map((segment, index) => ({
    ...segment,
    id: String(index + 1)
  }));
} 