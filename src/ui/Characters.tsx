/**
 * Original character art. The Devin mark is an unofficial, original tribute — it is not Cognition's
 * logo and the game is not affiliated with or endorsed by Cognition.
 */
interface Props {
  size?: number;
  className?: string;
  title?: string;
}

export function DevinMark({ size = 96, className, title = 'Devin (unofficial mark)' }: Props) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={title}>
      <defs>
        <linearGradient id="dv-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0d2b3e" />
          <stop offset="1" stopColor="#061522" />
        </linearGradient>
        <linearGradient id="dv-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3cf0c5" />
          <stop offset="1" stopColor="#2a8cff" />
        </linearGradient>
        <filter id="dv-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect x="6" y="6" width="108" height="108" rx="30" fill="url(#dv-bg)" stroke="url(#dv-ring)" strokeWidth="4" />
      <g filter="url(#dv-glow)" stroke="#3cf0c5" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M36 44 L54 60 L36 76" />
        <path d="M62 78 H86" />
      </g>
      <circle cx="88" cy="34" r="6" fill="#2a8cff" className="pulse-dot" />
    </svg>
  );
}

export function CodeAssistBot({ size = 96, className, title = 'Code Assist' }: Props) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={title}>
      <defs>
        <linearGradient id="ca-head" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#efeaff" />
          <stop offset="1" stopColor="#b9b0e6" />
        </linearGradient>
        <linearGradient id="ca-visor" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7b3cff" />
          <stop offset="1" stopColor="#1fb6ff" />
        </linearGradient>
      </defs>
      <line x1="60" y1="12" x2="60" y2="24" stroke="#9b6bff" strokeWidth="4" strokeLinecap="round" />
      <circle cx="60" cy="10" r="5" fill="#1fb6ff" className="pulse-dot" />
      <rect x="24" y="24" width="72" height="62" rx="24" fill="url(#ca-head)" />
      <rect x="32" y="40" width="56" height="26" rx="13" fill="url(#ca-visor)" />
      <circle cx="47" cy="53" r="5" fill="#fff" />
      <circle cx="73" cy="53" r="5" fill="#fff" />
      <path d="M50 74 Q60 80 70 74" stroke="#7b3cff" strokeWidth="4" fill="none" strokeLinecap="round" />
      {/* headset */}
      <path d="M20 58 Q20 18 60 18 Q100 18 100 58" stroke="#5b2fd6" strokeWidth="5" fill="none" />
      <rect x="12" y="48" width="14" height="24" rx="6" fill="#5b2fd6" />
      <rect x="94" y="48" width="14" height="24" rx="6" fill="#5b2fd6" />
      <path d="M19 72 Q22 92 42 92" stroke="#5b2fd6" strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="44" cy="92" r="4" fill="#1fb6ff" />
      <rect x="40" y="88" width="40" height="22" rx="10" fill="#cfc6f5" />
      <rect x="52" y="94" width="16" height="6" rx="3" fill="#1fb6ff" />
    </svg>
  );
}

export function TraditionalDev({ size = 96, className, title = 'Traditional Coding developer' }: Props) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={title}>
      <circle cx="60" cy="60" r="56" fill="#1d1408" stroke="#ff9f1c" strokeWidth="3" />
      {/* body */}
      <path d="M26 112 Q28 78 60 76 Q92 78 94 112 Z" fill="#c2621a" />
      <path d="M52 77 L60 90 L68 77" fill="#f4e7d3" />
      {/* head */}
      <rect x="54" y="62" width="12" height="12" rx="4" fill="#c98b62" />
      <ellipse cx="60" cy="48" rx="20" ry="22" fill="#d9a07a" />
      <path d="M40 46 Q40 22 62 24 Q82 26 80 46 Q74 34 60 34 Q48 34 40 46 Z" fill="#3a2516" />
      <rect x="45" y="44" width="12" height="9" rx="3" fill="none" stroke="#1d1408" strokeWidth="2.5" />
      <rect x="63" y="44" width="12" height="9" rx="3" fill="none" stroke="#1d1408" strokeWidth="2.5" />
      <line x1="57" y1="48" x2="63" y2="48" stroke="#1d1408" strokeWidth="2.5" />
      <path d="M53 60 Q60 65 67 60" stroke="#7a3e24" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* laptop */}
      <path d="M30 92 H90 L96 108 H24 Z" fill="#2b2f36" />
      <rect x="34" y="80" width="52" height="14" rx="2" fill="#3a3f48" />
      <circle cx="60" cy="87" r="3" fill="#ffbf47" />
    </svg>
  );
}

export function ModeCharacter({ mode, size }: { mode: 'devin' | 'codeassist' | 'traditional'; size?: number }) {
  if (mode === 'devin') return <DevinMark size={size} />;
  if (mode === 'codeassist') return <CodeAssistBot size={size} />;
  return <TraditionalDev size={size} />;
}
