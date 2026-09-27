import { motion } from 'framer-motion';

type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface OrbProps {
  state: OrbState;
  audioLevel: number; // 0 to 1
  onClick?: () => void;
}

export default function Orb({ state, audioLevel, onClick }: OrbProps) {
  // Base visual styles depending on state
  let scale = 1;
  let opacity = 0.8;
  let pulseDuration = 2;
  
  if (state === 'idle') {
    scale = 1;
    opacity = 0.5;
  } else if (state === 'listening') {
    // scale up with audio level
    scale = 1.1 + audioLevel * 1.5;
    opacity = 0.9;
  } else if (state === 'thinking') {
    scale = 1.05;
    opacity = 0.7;
    pulseDuration = 1.5;
  } else if (state === 'speaking') {
    scale = 1.1 + audioLevel * 0.8; // subtle movement
    opacity = 0.9;
  }

  return (
    <div 
      className="relative flex items-center justify-center w-64 h-64 cursor-pointer select-none"
      onClick={onClick}
    >
      {/* Glow layer */}
      <motion.div
        className="absolute w-48 h-48 rounded-full bg-orange-400/30 blur-2xl"
        animate={{
          scale: state === 'thinking' ? [1, 1.2, 1] : scale,
          opacity: state === 'thinking' ? [0.4, 0.7, 0.4] : opacity,
        }}
        transition={{
          duration: state === 'thinking' ? pulseDuration : 0.1,
          repeat: state === 'thinking' ? Infinity : 0,
          ease: "easeInOut"
        }}
      />
      
      {/* Core orb layer */}
      <motion.div
        className="relative z-10 w-32 h-32 rounded-full bg-gradient-to-br from-orange-400 to-red-500 shadow-xl"
        animate={{
          scale: state === 'thinking' ? [1, 1.05, 1] : scale * 0.9,
          opacity: state === 'idle' ? 0.8 : 1,
        }}
        transition={{
          duration: state === 'thinking' ? pulseDuration : 0.1,
          repeat: state === 'thinking' ? Infinity : 0,
          ease: "easeInOut"
        }}
      >
        {/* Subtle inner reflection */}
        <div className="absolute top-2 left-4 w-12 h-12 bg-white/30 rounded-full blur-md" />
      </motion.div>
    </div>
  );
}
