import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useState, useEffect } from 'react';

interface SettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  activePersonaId?: number;
  setActivePersonaId: (id: number) => void;
  voiceURI: string;
  setVoiceURI: (uri: string) => void;
  modelTier: string;
  setModelTier: (tier: string) => void;
  isPTT: boolean;
  setIsPTT: (ptt: boolean) => void;
}

export default function SettingsSheet({
  isOpen, onClose, activePersonaId, setActivePersonaId, voiceURI, setVoiceURI, modelTier, setModelTier, isPTT, setIsPTT
}: SettingsSheetProps) {
  const personas = useLiveQuery(() => db.personas.toArray());
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const loadVoices = () => {
      setVoices(window.speechSynthesis.getVoices());
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 bg-[var(--surface)] z-50 rounded-t-3xl shadow-2xl p-6"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-medium">Settings</h2>
              <button onClick={onClose} className="p-2 bg-[var(--surface-dark)] rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6 max-h-[70vh] overflow-y-auto pb-8">
              {/* Voice Picker */}
              <div>
                <label className="block text-sm text-zinc-500 mb-2">Speech Voice</label>
                <select 
                  className="w-full p-3 bg-[var(--surface-dark)] rounded-xl outline-none"
                  value={voiceURI}
                  onChange={(e) => setVoiceURI(e.target.value)}
                >
                  <option value="">System Default</option>
                  {voices.map(v => (
                    <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
                  ))}
                </select>
              </div>

              {/* Persona Picker */}
              <div>
                <label className="block text-sm text-zinc-500 mb-2">Persona</label>
                <div className="flex flex-wrap gap-2">
                  {personas?.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setActivePersonaId(p.id!)}
                      className={`px-4 py-2 rounded-xl transition-colors ${
                        activePersonaId === p.id 
                          ? 'bg-[var(--accent)] text-white' 
                          : 'bg-[var(--surface-dark)]'
                      }`}
                    >
                      {p.icon} {p.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Model Tier */}
              <div>
                <label className="block text-sm text-zinc-500 mb-2">Model Quality (requires reload)</label>
                <div className="flex bg-[var(--surface-dark)] rounded-xl p-1">
                  {['Fast', 'Balanced', 'Best'].map(tier => (
                    <button
                      key={tier}
                      onClick={() => setModelTier(tier)}
                      className={`flex-1 py-2 rounded-lg text-sm transition-colors ${
                        modelTier === tier ? 'bg-[var(--surface)] shadow-sm' : ''
                      }`}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
              </div>

              {/* Activation Mode */}
              <div>
                <label className="block text-sm text-zinc-500 mb-2">Activation Mode</label>
                <div className="flex items-center justify-between bg-[var(--surface-dark)] p-3 rounded-xl">
                  <span>Push-to-Talk</span>
                  <button 
                    onClick={() => setIsPTT(!isPTT)}
                    className={`w-12 h-6 rounded-full transition-colors relative ${isPTT ? 'bg-[var(--accent)]' : 'bg-zinc-400'}`}
                  >
                    <motion.div 
                      className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full"
                      animate={{ x: isPTT ? 24 : 0 }}
                    />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
