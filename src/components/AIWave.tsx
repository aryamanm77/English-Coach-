import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';

type WaveState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface AIWaveProps {
  state: WaveState;
  audioLevel?: number;
}

/**
 * ChatGPT / Gemini Live–style animated SVG wave bars.
 * Shows 5 sine-wave bars that animate based on AI state.
 */
export default function AIWave({ state, audioLevel = 0 }: AIWaveProps) {
  const bars = 28;

  const barConfigs = Array.from({ length: bars }, (_, i) => {
    const center = bars / 2;
    const dist = Math.abs(i - center) / center; // 0 at center, 1 at edges
    const baseHeight = state === 'idle' ? 4 : state === 'thinking' ? 8 : state === 'listening' ? 16 : 20;
    const peakHeight = state === 'idle' ? 6
      : state === 'thinking' ? 24
      : state === 'listening' ? 40 + audioLevel * 30
      : state === 'speaking' ? 48 + audioLevel * 20
      : 6;

    const height = baseHeight + (peakHeight - baseHeight) * (1 - dist * dist);
    const delay = (i / bars) * 0.6;
    const duration = state === 'idle' ? 3
      : state === 'thinking' ? 1.2
      : state === 'listening' ? 0.5 + dist * 0.3
      : 0.4 + dist * 0.25;

    return { height, delay, duration, dist };
  });

  const stateGradients: Record<WaveState, [string, string, string]> = {
    idle:      ['#6366F1', '#818CF8', '#A5B4FC'],
    listening: ['#10B981', '#34D399', '#6EE7B7'],
    thinking:  ['#F59E0B', '#C084FC', '#818CF8'],
    speaking:  ['#3B82F6', '#6366F1', '#A78BFA'],
  };

  const [c1, c2, c3] = stateGradients[state];

  return (
    <div className="flex items-center justify-center gap-[3px]" style={{ height: 72, width: '100%', maxWidth: 320 }}>
      {barConfigs.map((bar, i) => (
        <motion.div
          key={i}
          style={{
            width: 5,
            borderRadius: 4,
            background: `linear-gradient(to top, ${c1}, ${c2}, ${c3})`,
            flexShrink: 0,
          }}
          animate={{
            height: state === 'idle'
              ? [bar.height * 0.6, bar.height, bar.height * 0.5]
              : [bar.height * 0.5, bar.height, bar.height * 1.2, bar.height * 0.6],
            opacity: state === 'idle' ? [0.4, 0.6, 0.4] : [0.7, 1, 0.8],
          }}
          transition={{
            duration: bar.duration,
            repeat: Infinity,
            delay: bar.delay,
            ease: 'easeInOut',
            repeatType: 'mirror',
          }}
        />
      ))}
    </div>
  );
}
