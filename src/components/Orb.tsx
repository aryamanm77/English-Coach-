import { motion } from 'framer-motion';

type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface OrbProps {
  state: OrbState;
  audioLevel: number; // 0 to 1
  onClick?: () => void;
}

export default function Orb({ state, audioLevel, onClick }: OrbProps) {
  // Base visual styles depending on state
  const baseScale = state === 'idle' ? 1 : state === 'listening' ? 1.1 + (audioLevel * 1.5) : state === 'speaking' ? 1.1 + (audioLevel * 0.8) : 1.05;

  return (
    <div 
      className="relative flex items-center justify-center w-72 h-72 cursor-pointer select-none"
      onClick={onClick}
    >
      <motion.svg 
        viewBox="0 0 200 200" 
        className="w-full h-full drop-shadow-2xl"
        animate={{
          scale: state === 'thinking' ? [1, 1.1, 1] : baseScale,
          rotate: state === 'thinking' ? 360 : state === 'listening' || state === 'speaking' ? [0, 360] : 0,
        }}
        transition={{
          rotate: { duration: 8, repeat: Infinity, ease: "linear" },
          scale: { duration: state === 'thinking' ? 2 : 0.1, repeat: state === 'thinking' ? Infinity : 0 }
        }}
      >
        <defs>
          <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4F46E5" /> {/* Indigo */}
            <stop offset="100%" stopColor="#9333EA" /> {/* Purple */}
          </linearGradient>
          <linearGradient id="grad2" x1="100%" y1="0%" x2="0%" y2="100%">
             <stop offset="0%" stopColor="#3B82F6" /> {/* Blue */}
             <stop offset="100%" stopColor="#06B6D4" /> {/* Cyan */}
          </linearGradient>
        </defs>
        
        {/* Outer subtle ring */}
        <motion.circle 
          cx="100" cy="100" r="90" 
          fill="none" stroke="url(#grad2)" strokeWidth="2" strokeDasharray="20 10"
          animate={{
             rotate: [0, -360],
             opacity: state === 'idle' ? 0.3 : 0.8
          }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
        />
        
        {/* Inner fluid shape 1 */}
        <motion.path
          d="M 100, 20 C 140, 20 180, 60 180, 100 C 180, 140 140, 180 100, 180 C 60, 180 20, 140 20, 100 C 20, 60 60, 20 100, 20 Z"
          fill="url(#grad1)"
          animate={{
            d: state === 'listening' || state === 'speaking' 
              ? [
                  "M 100, 20 C 150, 30 170, 70 180, 100 C 190, 130 140, 170 100, 180 C 50, 190 30, 140 20, 100 C 10, 60 60, 10 100, 20 Z",
                  "M 100, 30 C 130, 20 180, 50 170, 100 C 160, 150 150, 180 100, 170 C 60, 160 20, 150 30, 100 C 40, 50 70, 40 100, 30 Z",
                  "M 100, 20 C 140, 20 180, 60 180, 100 C 180, 140 140, 180 100, 180 C 60, 180 20, 140 20, 100 C 20, 60 60, 20 100, 20 Z"
                ]
              : "M 100, 20 C 140, 20 180, 60 180, 100 C 180, 140 140, 180 100, 180 C 60, 180 20, 140 20, 100 C 20, 60 60, 20 100, 20 Z"
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          style={{ mixBlendMode: 'normal', opacity: 0.9 }}
        />
        
        {/* Inner fluid shape 2 */}
         <motion.path
          d="M 100, 30 C 140, 30 170, 60 170, 100 C 170, 140 140, 170 100, 170 C 60, 170 30, 140 30, 100 C 30, 60 60, 30 100, 30 Z"
          fill="url(#grad2)"
          animate={{
            d: state === 'listening' || state === 'speaking' 
              ? [
                  "M 100, 30 C 130, 20 180, 50 170, 100 C 160, 150 150, 180 100, 170 C 60, 160 20, 150 30, 100 C 40, 50 70, 40 100, 30 Z",
                  "M 100, 20 C 150, 30 170, 70 180, 100 C 190, 130 140, 170 100, 180 C 50, 190 30, 140 20, 100 C 10, 60 60, 10 100, 20 Z",
                  "M 100, 30 C 140, 30 170, 60 170, 100 C 170, 140 140, 170 100, 170 C 60, 170 30, 140 30, 100 C 30, 60 60, 30 100, 30 Z"
                ]
              : "M 100, 30 C 140, 30 170, 60 170, 100 C 170, 140 140, 170 100, 170 C 60, 170 30, 140 30, 100 C 30, 60 60, 30 100, 30 Z"
          }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          style={{ mixBlendMode: 'normal', opacity: 0.7 }}
        />
        
        {/* Core circle */}
        <circle cx="100" cy="100" r="35" fill="white" opacity="0.2" />
        <circle cx="100" cy="100" r="20" fill="white" opacity="0.4" />
      </motion.svg>
    </div>
  );
}
