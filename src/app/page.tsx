'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Settings, Zap, BookOpen, MessageSquare, X } from 'lucide-react';
import { useAudioPipeline } from '@/lib/audioPipeline';
import Orb from '@/components/Orb';
import AIWave from '@/components/AIWave';
import { seedDatabase, db } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { saveSettingsToFirebase, loadSettingsFromFirebase } from '@/lib/firebase';
import { streamGeminiResponse } from '@/lib/gemini';

type AppState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  ts: number;
}

// Gemini's official TTS voice presets (for Gemini Live / TTS API)
const GEMINI_VOICES = [
  { id: 'Puck',   label: 'Puck',   desc: 'Upbeat & friendly' },
  { id: 'Charon', label: 'Charon', desc: 'Clear & professional' },
  { id: 'Kore',   label: 'Kore',   desc: 'Warm & calm' },
  { id: 'Fenrir', label: 'Fenrir', desc: 'Deep & confident' },
  { id: 'Aoede',  label: 'Aoede',  desc: 'Soft & natural' },
  { id: 'Orbit',  label: 'Orbit',  desc: 'Bright & energetic' },
  { id: 'Zephyr', label: 'Zephyr', desc: 'Smooth & clear' },
];

// Friendly alert messages (soft, never says "API limit")
const REST_MESSAGES = [
  "Your coach is taking a short breather 💙 Try again in a moment!",
  "We're having a little rest to keep things smooth ✨ Be back shortly!",
  "The coach is recharging — come back in a minute! 🌿",
  "Too much great practice! Take a short break and we'll be right back 🎯",
];

export default function Home() {
  const [appState, setAppState] = useState<AppState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [statusLabel, setStatusLabel] = useState('Tap the orb to start');
  const [showSettings, setShowSettings] = useState(false);
  const [selectedGeminiVoice, setSelectedGeminiVoice] = useState('Kore');
  const [isPTT, setIsPTT] = useState(false);
  const [restAlert, setRestAlert] = useState<string | null>(null);
  const [requestCount, setRequestCount] = useState(0);
  const REQUEST_SOFT_LIMIT = 15; // show rest alert after N requests

  const conversationHistory = useRef<{ role: 'user' | 'model'; text: string }[]>([]);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const sttWorkerRef = useRef<Worker | null>(null);
  const personas = useLiveQuery(() => db.personas.toArray());
  const activePersona = personas?.find(p => p.name === 'English Coach');

  useEffect(() => {
    synthRef.current = window.speechSynthesis;
    seedDatabase();

    loadSettingsFromFirebase().then((s) => {
      if (s?.selectedVoiceURI) setSelectedGeminiVoice(s.selectedVoiceURI);
      if (s?.pushToTalk !== undefined) setIsPTT(s.pushToTalk);
    });

    const worker = new Worker(new URL('../lib/sttWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      if (e.data.type === 'transcript') handleTranscription(e.data.text);
    };
    worker.postMessage({ type: 'load', model: 'Xenova/whisper-tiny.en' });
    sttWorkerRef.current = worker;

    return () => worker.terminate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const speakSentence = (text: string) => {
    if (!synthRef.current) return;
    const utt = new SpeechSynthesisUtterance(text);
    // Map Gemini voice name to closest browser voice
    const browserVoices = window.speechSynthesis.getVoices();
    const voiceMap: Record<string, string[]> = {
      Puck:   ['Google UK English Male', 'en-GB'],
      Charon: ['Google US English', 'en-US'],
      Kore:   ['Google UK English Female', 'en-GB'],
      Fenrir: ['Microsoft David', 'en-US'],
      Aoede:  ['Samantha', 'en-US'],
      Orbit:  ['Google US English', 'en-US'],
      Zephyr: ['Microsoft Zira', 'en-US'],
    };
    const preferred = voiceMap[selectedGeminiVoice] || [];
    const match = browserVoices.find(v => preferred.some(p => v.name.includes(p) || v.lang.startsWith(p)));
    if (match) utt.voice = match;
    utt.rate = 1;
    utt.onstart = () => { setAppState('speaking'); setStatusLabel('Speaking...'); };
    utt.onend = () => { setAppState('idle'); setStatusLabel('Tap the orb to start'); };
    synthRef.current.speak(utt);
  };

  const { audioLevel, startListening, stopListening } = useAudioPipeline({
    continuous: !isPTT,
    onSilence: (audioBlob) => {
      if (appState !== 'listening') return;
      setAppState('thinking');
      setStatusLabel('Thinking...');
      sttWorkerRef.current?.postMessage({ type: 'transcribe', audio: audioBlob });
    },
  });

  const handleOrbTap = () => {
    if (appState === 'speaking') {
      synthRef.current?.cancel();
      setAppState('idle');
      setStatusLabel('Tap the orb to start');
      return;
    }
    if (appState === 'listening') {
      stopListening();
      setAppState('idle');
      setStatusLabel('Tap the orb to start');
      return;
    }
    if (appState === 'idle') {
      startListening();
      setAppState('listening');
      setStatusLabel('Listening... speak now');
    }
  };

  const handleTranscription = async (text: string) => {
    if (!text.trim()) {
      setAppState('idle');
      setStatusLabel('Tap the orb to start');
      return;
    }

    // Soft limit check
    const newCount = requestCount + 1;
    setRequestCount(newCount);
    if (newCount > REQUEST_SOFT_LIMIT && newCount % 5 === 0) {
      const msg = REST_MESSAGES[Math.floor(Math.random() * REST_MESSAGES.length)];
      setRestAlert(msg);
      setTimeout(() => setRestAlert(null), 5000);
    }

    const userMsg: Message = { role: 'user', text, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    conversationHistory.current.push({ role: 'user', text });

    setAppState('thinking');
    setStatusLabel('Thinking...');

    const systemPrompt = activePersona?.systemPrompt || 'You are a helpful English coach.';
    let fullReply = '';
    let sentenceBuffer = '';

    try {
      await streamGeminiResponse(
        conversationHistory.current,
        systemPrompt,
        (token) => {
          fullReply += token;
          sentenceBuffer += token;
          if (/[.!?\n]\s*/.test(sentenceBuffer)) {
            const parts = sentenceBuffer.split(/(?<=[.!?\n])\s+/);
            for (let i = 0; i < parts.length - 1; i++) {
              if (parts[i].trim()) speakSentence(parts[i].trim());
            }
            sentenceBuffer = parts[parts.length - 1];
          }
        },
        () => {
          if (sentenceBuffer.trim()) speakSentence(sentenceBuffer.trim());
          conversationHistory.current.push({ role: 'model', text: fullReply });
          setMessages(prev => [...prev, { role: 'assistant', text: fullReply, ts: Date.now() }]);
        }
      );
    } catch (err: any) {
      const isRateLimit = err?.message?.includes('429') || err?.message?.includes('quota');
      const msg = isRateLimit
        ? REST_MESSAGES[Math.floor(Math.random() * REST_MESSAGES.length)]
        : "Something went wrong. Please try again.";
      setRestAlert(msg);
      setTimeout(() => setRestAlert(null), 6000);
      setAppState('idle');
      setStatusLabel('Tap the orb to start');
    }
  };

  const stateColors: Record<AppState, string> = {
    idle:     '#6366F1',
    listening:'#10B981',
    thinking: '#F59E0B',
    speaking: '#6366F1',
    error:    '#EF4444',
  };

  const stateLabels: Record<AppState, string> = {
    idle:     'Ready',
    listening:'Listening',
    thinking: 'Thinking',
    speaking: 'Speaking',
    error:    'Error',
  };

  return (
    <div className="flex flex-col min-h-dvh relative overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* Blue gradient background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <div style={{
          position: 'absolute', top: -120, left: -80, width: 400, height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }} />
        <div style={{
          position: 'absolute', top: 200, right: -100, width: 350, height: 350,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(167,139,250,0.15) 0%, transparent 70%)',
          filter: 'blur(50px)',
        }} />
        <div style={{
          position: 'absolute', bottom: 100, left: -60, width: 300, height: 300,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)',
          filter: 'blur(45px)',
        }} />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-5 pt-12 pb-3">
        <div>
          <h1 className="text-2xl font-bold gradient-text tracking-tight">English Coach</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Powered by Gemini AI
          </p>
        </div>
        <div className="flex items-center gap-2">
          <motion.div
            key={appState}
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ background: `${stateColors[appState]}18`, color: stateColors[appState] }}
          >
            <motion.div
              animate={{ scale: appState === 'idle' ? 1 : [1, 1.4, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: stateColors[appState] }}
            />
            {stateLabels[appState]}
          </motion.div>
          <button
            onClick={() => setShowSettings(true)}
            className="w-10 h-10 rounded-2xl flex items-center justify-center glass"
          >
            <Settings size={17} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </header>

      {/* Orb + Wave section */}
      <section className="relative z-10 flex flex-col items-center pt-2 pb-4 gap-3">
        <Orb state={appState === 'error' ? 'idle' : appState} audioLevel={audioLevel} onClick={handleOrbTap} />

        {/* AI Wave visualizer */}
        <AnimatePresence mode="wait">
          <motion.div
            key={appState}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
          >
            <AIWave state={appState === 'error' ? 'idle' : appState} audioLevel={audioLevel} />
          </motion.div>
        </AnimatePresence>

        {/* Status */}
        <motion.p
          key={statusLabel}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm font-medium"
          style={{ color: 'var(--text-muted)' }}
        >
          {statusLabel}
        </motion.p>

        {/* Mic button */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          whileHover={{ scale: 1.05 }}
          onClick={handleOrbTap}
          className="mt-1 w-16 h-16 rounded-full flex items-center justify-center shadow-xl"
          style={{
            background: appState === 'listening'
              ? 'linear-gradient(135deg, #10B981, #34D399)'
              : 'linear-gradient(135deg, #6366F1, #A78BFA)',
            boxShadow: `0 8px 32px ${stateColors[appState]}55`,
          }}
        >
          {appState === 'listening'
            ? <MicOff size={24} color="white" />
            : <Mic size={24} color="white" />
          }
        </motion.button>
      </section>

      {/* Chat Messages */}
      <section className="relative z-10 flex-1 overflow-y-auto px-4 pb-6 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center gap-4 pt-2">
            <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
              {[
                { icon: <BookOpen size={18} />, label: 'Level Adaptive', color: '#6366F1' },
                { icon: <Zap size={18} />, label: 'Instant Fixes', color: '#F59E0B' },
                { icon: <MessageSquare size={18} />, label: 'Real Topics', color: '#10B981' },
              ].map((f) => (
                <motion.div
                  key={f.label}
                  whileTap={{ scale: 0.96 }}
                  className="flex flex-col items-center gap-2 p-3 rounded-2xl text-center glass"
                >
                  <span style={{ color: f.color }}>{f.icon}</span>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{f.label}</span>
                </motion.div>
              ))}
            </div>
            <p className="text-sm text-center" style={{ color: 'var(--text-muted)' }}>
              Tap the orb to begin your session ✨
            </p>
          </div>
        ) : (
          <AnimatePresence>
            {messages.map((msg) => (
              <motion.div
                key={msg.ts}
                initial={{ opacity: 0, y: 16, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 220, damping: 22 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full flex-shrink-0 mr-2 self-end flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #6366F1, #A78BFA)' }}>
                    <span style={{ fontSize: 12 }}>✦</span>
                  </div>
                )}
                <div
                  className="max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed"
                  style={msg.role === 'user' ? {
                    background: 'linear-gradient(135deg, #6366F1, #A78BFA)',
                    color: 'white',
                    borderBottomRightRadius: 4,
                  } : {
                    background: 'var(--bg-card)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    borderBottomLeftRadius: 4,
                  }}
                >
                  {msg.text}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        <div ref={chatEndRef} />
      </section>

      {/* Rest/Limit Alert */}
      <AnimatePresence>
        {restAlert && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 250, damping: 25 }}
            className="fixed bottom-6 left-4 right-4 z-50 px-4 py-3 rounded-2xl flex items-center gap-3"
            style={{
              background: 'linear-gradient(135deg, #6366F1, #A78BFA)',
              boxShadow: '0 8px 32px rgba(99,102,241,0.4)',
            }}
          >
            <span className="text-xl">💙</span>
            <p className="text-sm text-white font-medium flex-1">{restAlert}</p>
            <button onClick={() => setRestAlert(null)}>
              <X size={16} color="rgba(255,255,255,0.8)" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Bottom Sheet */}
      <AnimatePresence>
        {showSettings && (
          <>
            <motion.div
              className="fixed inset-0 z-40"
              style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl px-5 pt-3 pb-10"
              style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border)' }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 280, damping: 30 }}
            >
              <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: 'var(--border)' }} />

              <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--text)' }}>Settings</h2>
              <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>{requestCount} messages in this session</p>

              {/* Gemini Voice Selector */}
              <label className="block text-xs font-semibold mb-2 tracking-widest" style={{ color: 'var(--text-muted)' }}>
                GEMINI VOICE
              </label>
              <div className="grid grid-cols-2 gap-2 mb-5">
                {GEMINI_VOICES.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      setSelectedGeminiVoice(v.id);
                      saveSettingsToFirebase({ selectedPersona: 'English Coach', selectedVoiceURI: v.id, modelTier: 'Gemini', pushToTalk: isPTT });
                    }}
                    className="px-3 py-2.5 rounded-2xl text-left transition-all"
                    style={{
                      background: selectedGeminiVoice === v.id ? 'linear-gradient(135deg, #6366F1, #A78BFA)' : 'var(--bg-card-2)',
                      border: `1px solid ${selectedGeminiVoice === v.id ? 'transparent' : 'var(--border)'}`,
                    }}
                  >
                    <p className="text-sm font-semibold" style={{ color: selectedGeminiVoice === v.id ? 'white' : 'var(--text)' }}>{v.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: selectedGeminiVoice === v.id ? 'rgba(255,255,255,0.75)' : 'var(--text-muted)' }}>{v.desc}</p>
                  </button>
                ))}
              </div>

              {/* Push-to-talk */}
              <div className="flex items-center justify-between py-3 border-t" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Push to Talk</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Tap & hold mic to record</p>
                </div>
                <button
                  onClick={() => {
                    const next = !isPTT;
                    setIsPTT(next);
                    saveSettingsToFirebase({ selectedPersona: 'English Coach', selectedVoiceURI: selectedGeminiVoice, modelTier: 'Gemini', pushToTalk: next });
                  }}
                  className="w-12 h-6 rounded-full relative transition-all"
                  style={{ background: isPTT ? '#6366F1' : 'var(--border)' }}
                >
                  <div
                    className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-300"
                    style={{ left: isPTT ? 26 : 2 }}
                  />
                </button>
              </div>

              {/* Clear conversation */}
              <button
                onClick={() => { setMessages([]); conversationHistory.current = []; setRequestCount(0); setShowSettings(false); }}
                className="mt-4 w-full py-3 rounded-2xl text-sm font-semibold transition-colors"
                style={{ background: 'var(--bg-card-2)', color: 'var(--text)' }}
              >
                🗑 Clear Conversation
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
