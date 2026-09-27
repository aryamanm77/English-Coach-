'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { CreateMLCEngine } from '@mlc-ai/web-llm';
import { Settings, Mic, Loader2, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { useAudioPipeline } from '@/lib/audioPipeline';
import Orb from '@/components/Orb';
import SettingsSheet from '@/components/SettingsSheet';
import { seedDatabase, db, Persona } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { saveSettingsToFirebase, loadSettingsFromFirebase } from '@/lib/firebase';

const MODELS: Record<string, string> = {
  'Fast': 'Llama-3.2-1B-Instruct-q4f16_1-MLC', // Better, highly-supported small model
  'Balanced': 'Phi-3.5-mini-instruct-q4f16_1-MLC',
  'Best': 'Llama-3.1-8B-Instruct-q4f32_1-MLC'
};

type AppState = 'setup' | 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export default function Home() {
  const [appState, setAppState] = useState<AppState>('setup');
  const [loadingMsg, setLoadingMsg] = useState('Checking device capabilities...');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [modelTier, setModelTier] = useState<string>('Balanced');
  const [activePersonaId, setActivePersonaId] = useState<number>(1);
  const [voiceURI, setVoiceURI] = useState<string>('');
  const [isPTT, setIsPTT] = useState<boolean>(false);
  
  const [showSettings, setShowSettings] = useState(false);
  
  const engineRef = useRef<any>(null);
  const sttWorkerRef = useRef<Worker | null>(null);
  
  // Audio state
  const { isListening, audioLevel, startListening, stopListening } = useAudioPipeline({
    continuous: !isPTT,
    onSilence: (audioBlob) => {
      if (appState !== 'listening') return;
      setAppState('thinking');
      sttWorkerRef.current?.postMessage({ type: 'transcribe', audio: audioBlob });
    }
  });

  const personas = useLiveQuery(() => db.personas.toArray());
  const activePersona = personas?.find(p => p.id === activePersonaId);
  
  // TTS State
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    synthRef.current = window.speechSynthesis;
    seedDatabase();
    // Load settings from Firebase on first mount
    loadSettingsFromFirebase().then((settings) => {
      if (settings) {
        if (settings.modelTier) setModelTier(settings.modelTier);
        if (settings.selectedVoiceURI) setVoiceURI(settings.selectedVoiceURI);
        if (settings.pushToTalk !== undefined) setIsPTT(settings.pushToTalk);
      }
    });
  }, []);

  // Auto-save settings to Firebase whenever any setting changes
  useEffect(() => {
    saveSettingsToFirebase({
      selectedPersona: activePersona?.name ?? 'English Coach',
      selectedVoiceURI: voiceURI,
      modelTier,
      pushToTalk: isPTT,
    });
  }, [modelTier, voiceURI, isPTT, activePersona]);

  const handleSetup = async () => {
    setIsSettingUp(true);
    try {
      setLoadingMsg('Requesting WebGPU access...');
      const nav = navigator as any;
      if (!nav.gpu) {
        throw new Error("WebGPU is not supported by your browser. Please use Chrome, Edge, or Firefox (with flags) on a compatible device.");
      }
      
      const adapter = await nav.gpu.requestAdapter();
      if (!adapter) throw new Error("Could not get WebGPU adapter.");
      
      // Auto tier selection based on memory
      let selectedTier = 'Balanced';
      if (nav.deviceMemory) {
        if (nav.deviceMemory <= 4) selectedTier = 'Fast';
        if (nav.deviceMemory >= 8) selectedTier = 'Best';
      }
      setModelTier(selectedTier);
      
      setLoadingMsg(`Loading LLM (${selectedTier} Tier)...`);
      const selectedModel = MODELS[selectedTier];
      
      const engine = await CreateMLCEngine(selectedModel, {
        initProgressCallback: (info) => {
          setLoadingMsg(`LLM: ${info.text}`);
          setDownloadProgress(info.progress * 100);
        }
      });
      engineRef.current = engine;
      
      setLoadingMsg('Loading STT Model...');
      const sttWorker = new Worker(new URL('../lib/sttWorker.ts', import.meta.url), { type: 'module' });
      sttWorker.onmessage = (e) => {
        if (e.data.type === 'progress') {
          setLoadingMsg(e.data.status);
        } else if (e.data.type === 'ready') {
          setAppState('idle');
        } else if (e.data.type === 'result') {
          handleTranscription(e.data.text);
        } else if (e.data.type === 'error') {
          setAppState('error');
          setErrorMsg(e.data.error);
        }
      };
      
      sttWorker.postMessage({ type: 'load', model: selectedTier === 'Fast' ? 'Xenova/whisper-tiny.en' : 'Xenova/whisper-base.en' });
      sttWorkerRef.current = sttWorker;
      
    } catch (err: any) {
      setAppState('error');
      setErrorMsg(err.message);
      setIsSettingUp(false);
    }
  };

  const conversationHistory = useRef<{ role: 'user' | 'model'; text: string }[]>([]);

  const handleTranscription = async (text: string) => {
    if (!text.trim()) {
      setAppState('idle');
      return;
    }
    
    setAppState('thinking');
    const systemPrompt = activePersona?.systemPrompt || 'You are a helpful English coach.';

    // Add user turn to history
    conversationHistory.current.push({ role: 'user', text });

    const geminiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    if (geminiKey) {
      // ── Gemini Cloud Path ──────────────────────────────────────────
      const { streamGeminiResponse } = await import('@/lib/gemini');
      let sentenceBuffer = '';
      setAppState('speaking');

      await streamGeminiResponse(
        conversationHistory.current,
        systemPrompt,
        (token) => {
          sentenceBuffer += token;
          if (/[.!?\n]\s*/.test(sentenceBuffer)) {
            const sentences = sentenceBuffer.split(/(?<=[.!?\n])\s+/);
            for (let i = 0; i < sentences.length - 1; i++) {
              if (sentences[i].trim()) speakSentence(sentences[i].trim());
            }
            sentenceBuffer = sentences[sentences.length - 1];
          }
        },
        () => {
          if (sentenceBuffer.trim()) speakSentence(sentenceBuffer.trim());
          conversationHistory.current.push({ role: 'model', text: sentenceBuffer });
        }
      );

    } else {
      // ── Local WebLLM Fallback ──────────────────────────────────────
      try {
        const prompt = `System: ${systemPrompt}\nUser: ${text}\nAssistant:`;
        const chunks = await engineRef.current.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          stream: true,
        });
        
        let fullReply = '';
        let sentenceBuffer = '';
        setAppState('speaking');
        
        for await (const chunk of chunks) {
          if (appState === 'listening') break;
          const token = chunk.choices[0]?.delta?.content || '';
          fullReply += token;
          sentenceBuffer += token;
          
          if (/[.!?\n]\s/.test(sentenceBuffer)) {
            speakSentence(sentenceBuffer.trim());
            sentenceBuffer = '';
          }
        }
        
        if (sentenceBuffer.trim()) speakSentence(sentenceBuffer.trim());
        conversationHistory.current.push({ role: 'model', text: fullReply });

      } catch (err) {
        console.error(err);
        setAppState('idle');
      }
    }
  };

  const speakSentence = (text: string) => {
    if (!synthRef.current) return;
    const utterance = new SpeechSynthesisUtterance(text);
    
    if (voiceURI) {
      const voices = synthRef.current.getVoices();
      const match = voices.find(v => v.voiceURI === voiceURI);
      if (match) utterance.voice = match;
    }
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      if (!synthRef.current?.pending && !synthRef.current?.speaking) {
        setIsSpeaking(false);
        setAppState('idle');
      }
    };
    
    synthRef.current.speak(utterance);
  };

  const toggleMic = () => {
    if (appState === 'listening') {
      stopListening();
    } else {
      // Barge-in
      if (synthRef.current?.speaking) {
        synthRef.current.cancel();
      }
      setAppState('listening');
      startListening();
    }
  };

  if (appState === 'setup') {
    return (
      <div className="flex h-screen w-full items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-32 h-32 mx-auto mb-8 rounded-full bg-[var(--accent)] flex items-center justify-center shadow-xl">
             <Mic className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-3xl font-medium">English Coach</h1>
          <p className="text-[var(--foreground)] opacity-70">A fully offline, local speech-to-speech AI assistant running entirely on your device.</p>
          
          <div className="pt-8">
            <button 
              onClick={handleSetup}
              disabled={isSettingUp}
              className="w-full py-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-full font-medium transition-colors shadow-md disabled:opacity-50"
            >
              {isSettingUp ? 'Downloading...' : 'Setup Models (~1.5GB)'}
            </button>
            
            {isSettingUp && (
              <div className="w-full bg-[var(--surface-dark)] h-2 rounded-full mt-6 overflow-hidden">
                <div 
                  className="bg-[var(--accent)] h-full transition-all duration-300 ease-out"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
            )}
            
            <p className="text-sm mt-4 text-[var(--foreground)] opacity-50 truncate">{loadingMsg}</p>
          </div>
        </div>
      </div>
    );
  }

  if (appState === 'error') {
    return (
      <div className="flex h-screen w-full items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-4">
          <Info className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="text-xl font-medium">Unsupported Device</h2>
          <p className="opacity-70">{errorMsg}</p>
          <button onClick={() => window.location.reload()} className="mt-4 px-6 py-2 bg-[var(--surface-dark)] rounded-full">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full relative overflow-hidden">
      {/* Header */}
      <header className="absolute top-0 w-full p-6 flex justify-between items-center z-20">
        <div className="flex items-center space-x-2 bg-[var(--surface)] px-4 py-2 rounded-full shadow-sm text-sm">
           <span>{activePersona?.icon}</span>
           <span className="font-medium">{activePersona?.name}</span>
        </div>
        <button 
          onClick={() => setShowSettings(true)}
          className="p-3 bg-[var(--surface)] rounded-full shadow-sm hover:bg-[var(--surface-dark)] transition-colors"
        >
          <Settings className="w-5 h-5" />
        </button>
      </header>

      {/* Main Orb Area */}
      <main className="flex-1 flex flex-col items-center justify-center">
        <Orb 
          state={appState === 'speaking' || appState === 'listening' || appState === 'thinking' || appState === 'idle' ? appState : 'idle'} 
          audioLevel={audioLevel} 
          onClick={toggleMic}
        />
        
        <AnimatePresence>
          {appState === 'listening' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-8 text-[var(--accent)] font-medium"
            >
              Listening...
            </motion.div>
          )}
          {appState === 'thinking' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-8 opacity-50 flex items-center space-x-2"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Thinking...</span>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Controls (for PTT or Fallback) */}
      <div className="absolute bottom-8 w-full flex justify-center z-20">
        <button 
          onPointerDown={isPTT ? toggleMic : undefined}
          onPointerUp={isPTT ? toggleMic : undefined}
          onClick={!isPTT ? toggleMic : undefined}
          className={`p-6 rounded-full shadow-xl transition-all ${
            appState === 'listening' 
              ? 'bg-red-500 scale-95 text-white' 
              : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white hover:scale-105'
          }`}
        >
           <Mic className="w-8 h-8" />
        </button>
      </div>

      <SettingsSheet 
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        activePersonaId={activePersonaId}
        setActivePersonaId={setActivePersonaId}
        voiceURI={voiceURI}
        setVoiceURI={setVoiceURI}
        modelTier={modelTier}
        setModelTier={setModelTier}
        isPTT={isPTT}
        setIsPTT={setIsPTT}
      />
    </div>
  );
}
