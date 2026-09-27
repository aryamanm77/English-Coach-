import { motion, useAnimation, useMotionValue, useTransform } from 'framer-motion';
import { useEffect } from 'react';

type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

interface OrbProps {
  state: OrbState;
  audioLevel?: number;
  onClick?: () => void;
}

const stateConfig = {
  idle: {
    primary: ['#6366F1', '#A78BFA'],
    secondary: ['#A78BFA', '#EC4899'],
    scale: 1,
    speed: 8,
    opacity: 0.85,
  },
  listening: {
    primary: ['#10B981', '#34D399'],
    secondary: ['#34D399', '#6EE7B7'],
    scale: 1.08,
    speed: 3,
    opacity: 1,
  },
  thinking: {
    primary: ['#F59E0B', '#FBBF24'],
    secondary: ['#F472B6', '#C084FC'],
    scale: 1.04,
    speed: 5,
    opacity: 0.9,
  },
  speaking: {
    primary: ['#6366F1', '#8B5CF6'],
    secondary: ['#EC4899', '#F97316'],
    scale: 1.06,
    speed: 2.5,
    opacity: 1,
  },
  error: {
    primary: ['#EF4444', '#F87171'],
    secondary: ['#F97316', '#FCA5A5'],
    scale: 1,
    speed: 6,
    opacity: 0.8,
  },
};

export default function Orb({ state, audioLevel = 0, onClick }: OrbProps) {
  const cfg = stateConfig[state];
  const dynamicScale = state === 'listening'
    ? cfg.scale + audioLevel * 0.25
    : state === 'speaking'
    ? cfg.scale + audioLevel * 0.15
    : cfg.scale;

  return (
    <div
      className="relative flex items-center justify-center cursor-pointer select-none"
      style={{ width: 240, height: 240 }}
      onClick={onClick}
    >
      {/* Outer glow rings */}
      {(state === 'listening' || state === 'speaking') && (
        <>
          <div
            className="absolute rounded-full pulse-ring"
            style={{
              width: 260,
              height: 260,
              background: `radial-gradient(circle, ${cfg.primary[0]}22 0%, transparent 70%)`,
            }}
          />
          <div
            className="absolute rounded-full pulse-ring"
            style={{
              width: 300,
              height: 300,
              background: `radial-gradient(circle, ${cfg.primary[1]}11 0%, transparent 70%)`,
              animationDelay: '0.4s',
            }}
          />
        </>
      )}

      {/* SVG Orb */}
      <motion.div
        animate={{ scale: dynamicScale }}
        transition={{ type: 'spring', stiffness: 120, damping: 14 }}
        style={{ width: 200, height: 200, position: 'relative' }}
      >
        <motion.svg
          viewBox="0 0 200 200"
          style={{ width: '100%', height: '100%', filter: `drop-shadow(0 0 32px ${cfg.primary[0]}80)` }}
          animate={{ rotate: state === 'thinking' ? 360 : 0 }}
          transition={{ rotate: { duration: cfg.speed, repeat: Infinity, ease: 'linear' } }}
        >
          <defs>
            <radialGradient id={`rg-${state}`} cx="40%" cy="35%" r="65%">
              <stop offset="0%" stopColor={cfg.primary[0]} />
              <stop offset="60%" stopColor={cfg.secondary[0]} />
              <stop offset="100%" stopColor={cfg.secondary[1]} />
            </radialGradient>
            <filter id="blur-orb">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
            </filter>
          </defs>

          {/* Background blur blob */}
          <motion.ellipse
            cx="100" cy="110" rx="85" ry="75"
            fill={cfg.secondary[0]}
            opacity={0.3}
            filter="url(#blur-orb)"
            animate={{ rx: [85, 80, 88, 85], ry: [75, 80, 72, 75] }}
            transition={{ duration: cfg.speed * 0.8, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Main fluid shape */}
          <motion.path
            fill={`url(#rg-${state})`}
            animate={{
              d: [
                'M 100 20 C 145 20 180 55 180 100 C 180 145 145 180 100 180 C 55 180 20 145 20 100 C 20 55 55 20 100 20 Z',
                'M 100 25 C 150 15 185 60 178 105 C 171 150 138 182 95 180 C 52 178 18 140 22 97 C 26 54 60 32 100 25 Z',
                'M 100 18 C 148 22 182 58 180 102 C 178 146 142 183 98 181 C 54 179 19 143 20 99 C 21 55 58 15 100 18 Z',
                'M 100 20 C 145 20 180 55 180 100 C 180 145 145 180 100 180 C 55 180 20 145 20 100 C 20 55 55 20 100 20 Z',
              ],
            }}
            transition={{ duration: cfg.speed, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Specular highlight */}
          <ellipse cx="75" cy="65" rx="28" ry="18" fill="white" opacity={0.18} />
          <ellipse cx="68" cy="60" rx="12" ry="8" fill="white" opacity={0.22} />

          {/* Inner icon based on state */}
          {state === 'idle' && (
            <g opacity={0.7}>
              <circle cx="100" cy="100" r="16" fill="white" opacity={0.2} />
              <path d="M93 93 L107 93 L107 107 L93 107 Z" fill="white" opacity={0.4} rx="3" />
            </g>
          )}
          {state === 'listening' && (
            <g transform="translate(100,100)" opacity={0.9}>
              {[0,1,2,3,4].map((i) => (
                <motion.rect
                  key={i}
                  x={-18 + i * 9} y={-12} width={6} rx={3}
                  fill="white"
                  animate={{ height: [8, 20 + i * 4, 8], y: [-4, -10 - i * 2, -4] }}
                  transition={{ duration: 0.6 + i * 0.1, repeat: Infinity, delay: i * 0.1 }}
                />
              ))}
            </g>
          )}
          {state === 'thinking' && (
            <g transform="translate(100,100)" opacity={0.85}>
              {[0,1,2].map((i) => (
                <motion.circle
                  key={i}
                  cx={-14 + i * 14} cy={0} r={5}
                  fill="white"
                  animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.25 }}
                />
              ))}
            </g>
          )}
          {state === 'speaking' && (
            <g transform="translate(100,100)" opacity={0.9}>
              {[0,1,2,3,4,5].map((i) => (
                <motion.rect
                  key={i}
                  x={-24 + i * 9} y={-12} width={6} rx={3}
                  fill="white"
                  animate={{ height: [6, 22 + Math.sin(i) * 8, 6] }}
                  transition={{ duration: 0.4 + i * 0.07, repeat: Infinity, delay: i * 0.08 }}
                />
              ))}
            </g>
          )}
          {state === 'error' && (
            <g transform="translate(100,100)" opacity={0.9}>
              <text textAnchor="middle" dy="8" fontSize="28" fill="white">!</text>
            </g>
          )}
        </motion.svg>
      </motion.div>
    </div>
  );
}
