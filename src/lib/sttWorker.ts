import { pipeline, env } from '@xenova/transformers';

// Configure to allow local caching
env.allowLocalModels = false;
env.useBrowserCache = true;

let transcriber: any = null;

self.onmessage = async (e: MessageEvent) => {
  if (e.data.type === 'load') {
    try {
      const model = e.data.model || 'Xenova/whisper-tiny.en';
      self.postMessage({ type: 'progress', status: `Loading STT model (${model})...` });
      transcriber = await pipeline('automatic-speech-recognition', model);
      self.postMessage({ type: 'ready' });
    } catch (err: any) {
      self.postMessage({ type: 'error', error: err.message });
    }
  } else if (e.data.type === 'transcribe') {
    try {
      if (!transcriber) throw new Error("Transcriber not loaded");
      const audio = e.data.audio;
      const result = await transcriber(audio, {
        chunk_length_s: 30,
        stride_length_s: 5,
      });
      self.postMessage({ type: 'result', text: result.text });
    } catch (err: any) {
      self.postMessage({ type: 'error', error: err.message });
    }
  }
};
