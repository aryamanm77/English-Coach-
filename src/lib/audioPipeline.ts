import { useState, useEffect, useRef, useCallback } from 'react';

interface AudioPipelineOptions {
  onSilence: (audioBlob: Float32Array) => void;
  silenceThreshold?: number; // 0 to 255
  silenceDelay?: number; // ms
  continuous?: boolean;
}

export function useAudioPipeline({
  onSilence,
  silenceThreshold = 10,
  silenceDelay = 1500,
  continuous = true
}: AudioPipelineOptions) {
  const [isListening, setIsListening] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  
  const audioChunksRef = useRef<Float32Array[]>([]);
  const silenceStartRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const stopListening = useCallback(() => {
    setIsListening(false);
    setAudioLevel(0);
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    
    // Combine chunks and trigger callback if there's audio
    if (audioChunksRef.current.length > 0) {
      const totalLen = audioChunksRef.current.reduce((acc, chunk) => acc + chunk.length, 0);
      const combined = new Float32Array(totalLen);
      let offset = 0;
      for (const chunk of audioChunksRef.current) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      
      // We only want to trigger onSilence if there was actually some audio recorded, not just silence
      if (combined.length > 4000) { // ~250ms at 16kHz
        onSilence(combined);
      }
      audioChunksRef.current = [];
    }
  }, [onSilence]);

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });
      
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      
      const source = ctx.createMediaStreamSource(stream);
      // Deprecated but widely supported for raw audio capture without AudioWorklet complexity
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      
      source.connect(analyser);
      analyser.connect(processor);
      processor.connect(ctx.destination);
      
      audioContextRef.current = ctx;
      analyserRef.current = analyser;
      mediaStreamRef.current = stream;
      sourceRef.current = source;
      processorRef.current = processor;
      
      audioChunksRef.current = [];
      silenceStartRef.current = null;
      setIsListening(true);
      
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // Copy data for later transcription
        audioChunksRef.current.push(new Float32Array(inputData));
      };
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const checkAudioLevel = () => {
        if (!analyserRef.current) return;
        
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        
        // Normalize 0-1 for the UI orb
        setAudioLevel(avg / 255);
        
        // Silence detection
        if (continuous) {
          if (avg < silenceThreshold) {
            if (!silenceStartRef.current) {
              silenceStartRef.current = Date.now();
            } else if (Date.now() - silenceStartRef.current > silenceDelay) {
              // Silence detected for long enough
              stopListening();
              return;
            }
          } else {
            silenceStartRef.current = null;
          }
        }
        
        animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
      };
      
      checkAudioLevel();
      
    } catch (err) {
      console.error("Failed to access microphone:", err);
    }
  }, [continuous, silenceDelay, silenceThreshold, stopListening, isListening]);

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  return {
    isListening,
    audioLevel,
    startListening,
    stopListening
  };
}
