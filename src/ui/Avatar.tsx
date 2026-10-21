import type { AvatarConfig } from '../avatar/options';
import { DEFAULT_AVATAR } from '../avatar/options';

interface Props {
  config: AvatarConfig | null | undefined;
  size?: number;
  title?: string;
  className?: string;
}

function Hair({ style, color }: { style: AvatarConfig['hair']; color: string }) {
  switch (style) {
    case 'short':
      return <path d="M30 44 Q30 20 50 20 Q70 20 70 44 Q66 32 50 31 Q36 31 30 44 Z" fill={color} />;
    case 'long':
      return (
        <>
          <path d="M28 46 Q26 18 50 18 Q74 18 72 46 L74 78 Q66 70 66 56 L66 38 Q50 30 34 38 L34 56 Q34 70 26 78 Z" fill={color} />
        </>
      );
    case 'buzz':
      return <path d="M31 42 Q31 22 50 22 Q69 22 69 42 Q60 33 50 33 Q40 33 31 42 Z" fill={color} opacity="0.85" />;
    case 'curly':
      return (
        <g fill={color}>
          {[30, 38, 46, 54, 62, 70].map((x, i) => (
            <circle key={x} cx={x} cy={i % 2 ? 24 : 28} r="8" />
          ))}
          <circle cx="29" cy="38" r="6" />
          <circle cx="71" cy="38" r="6" />
        </g>
      );
    case 'bun':
      return (
        <g fill={color}>
          <circle cx="50" cy="14" r="9" />
          <path d="M30 44 Q30 20 50 20 Q70 20 70 44 Q64 30 50 30 Q36 30 30 44 Z" />
        </g>
      );
    case 'mohawk':
      return <path d="M44 34 Q44 10 50 8 Q56 10 56 34 Z" fill={color} />;
    case 'bald':
    default:
      return null;
  }
}

function Eyes({ style }: { style: AvatarConfig['eyes'] }) {
  const ink = '#1a1a1a';
  switch (style) {
    case 'focused':
      return (
        <g stroke={ink} strokeWidth="3" strokeLinecap="round">
          <line x1="38" y1="46" x2="45" y2="46" />
          <line x1="55" y1="46" x2="62" y2="46" />
        </g>
      );
    case 'happy':
      return (
        <g stroke={ink} strokeWidth="2.5" fill="none" strokeLinecap="round">
          <path d="M38 47 Q41.5 42 45 47" />
          <path d="M55 47 Q58.5 42 62 47" />
        </g>
      );
    case 'wink':
      return (
        <g>
          <circle cx="41.5" cy="46" r="3" fill={ink} />
          <path d="M55 47 Q58.5 44 62 47" stroke={ink} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </g>
      );
    default:
      return (
        <g fill={ink}>
          <circle cx="41.5" cy="46" r="3" />
          <circle cx="58.5" cy="46" r="3" />
        </g>
      );
  }
}

function Mouth({ style }: { style: AvatarConfig['mouth'] }) {
  const s = { stroke: '#6b2b20', strokeWidth: 2.5, fill: 'none', strokeLinecap: 'round' as const };
  switch (style) {
    case 'grin':
      return <path d="M41 57 Q50 66 59 57 Z" fill="#fff" stroke="#6b2b20" strokeWidth="2" strokeLinejoin="round" />;
    case 'neutral':
      return <line x1="44" y1="59" x2="56" y2="59" {...s} />;
    case 'determined':
      return <path d="M43 60 Q50 57 57 60" {...s} />;
    default:
      return <path d="M43 57 Q50 63 57 57" {...s} />;
  }
}

function FacialHair({ style, color }: { style: AvatarConfig['facialHair']; color: string }) {
  switch (style) {
    case 'stubble':
      return <path d="M34 54 Q36 72 50 73 Q64 72 66 54 Q60 66 50 66 Q40 66 34 54 Z" fill={color} opacity="0.25" />;
    case 'moustache':
      return <path d="M41 55 Q50 50 59 55 Q50 54 41 55 Z" fill={color} stroke={color} strokeWidth="2.5" strokeLinejoin="round" />;
    case 'beard':
      return <path d="M32 50 Q33 76 50 77 Q67 76 68 50 Q64 64 56 63 Q50 61 44 63 Q36 64 32 50 Z" fill={color} />;
    default:
      return null;
  }
}

function Accessory({ style }: { style: AvatarConfig['accessory'] }) {
  switch (style) {
    case 'glasses':
      return (
        <g fill="none" stroke="#111" strokeWidth="2">
          <circle cx="41.5" cy="46" r="6.5" />
          <circle cx="58.5" cy="46" r="6.5" />
          <line x1="48" y1="46" x2="52" y2="46" />
        </g>
      );
    case 'shades':
      return (
        <g fill="#0b0b0f">
          <rect x="33" y="41" width="15" height="10" rx="4" />
          <rect x="52" y="41" width="15" height="10" rx="4" />
          <rect x="47" y="44" width="6" height="2" />
        </g>
      );
    case 'headset':
      return (
        <g>
          <path d="M28 46 Q28 16 50 16 Q72 16 72 46" stroke="#2de2b0" strokeWidth="4" fill="none" />
          <rect x="24" y="40" width="8" height="14" rx="3" fill="#2de2b0" />
          <path d="M28 54 Q30 64 42 63" stroke="#2de2b0" strokeWidth="2.5" fill="none" />
        </g>
      );
    case 'eyepatch':
      return (
        <g>
          <line x1="30" y1="36" x2="70" y2="52" stroke="#111" strokeWidth="2" />
          <ellipse cx="58.5" cy="46" rx="6" ry="5" fill="#111" />
        </g>
      );
    case 'earring':
      return <circle cx="31" cy="58" r="2.6" fill="#ffd166" />;
    default:
      return null;
  }
}

function Clothing({ style, color }: { style: AvatarConfig['clothing']; color: string }) {
  const body = <path d="M14 100 Q16 76 50 74 Q84 76 86 100 Z" fill={color} />;
  switch (style) {
    case 'uniform':
      return (
        <g>
          {body}
          <path d="M42 75 L50 88 L58 75" fill="#e9eef5" />
          <rect x="62" y="84" width="10" height="3" rx="1" fill="#ffd166" />
          <rect x="62" y="89" width="10" height="3" rx="1" fill="#2de2b0" />
        </g>
      );
    case 'hoodie':
      return (
        <g>
          {body}
          <path d="M34 76 Q50 92 66 76" stroke="#00000055" strokeWidth="4" fill="none" />
          <line x1="46" y1="84" x2="46" y2="96" stroke="#ffffff88" strokeWidth="2" />
          <line x1="54" y1="84" x2="54" y2="96" stroke="#ffffff88" strokeWidth="2" />
        </g>
      );
    case 'jacket':
      return (
        <g>
          {body}
          <path d="M44 75 L50 100 L56 75" fill="#f4f4f4" />
          <path d="M44 75 L38 92 L50 100 Z M56 75 L62 92 L50 100 Z" fill="#00000033" />
        </g>
      );
    default:
      return (
        <g>
          {body}
          <path d="M42 75 Q50 82 58 75" stroke="#00000044" strokeWidth="3" fill="none" />
        </g>
      );
  }
}

/** Layered SVG avatar rendered entirely from structured config data. */
export function Avatar({ config, size = 40, title, className }: Props) {
  const a = config ?? DEFAULT_AVATAR;
  const behind = a.hair === 'long';
  return (
    <svg className={`avatar ${className ?? ''}`} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title ?? 'Player avatar'}>
      <circle cx="50" cy="50" r="50" fill="#0d2238" />
      <clipPath id="av-clip">
        <circle cx="50" cy="50" r="50" />
      </clipPath>
      <g clipPath="url(#av-clip)">
        {behind && <Hair style={a.hair} color={a.hairColor} />}
        <Clothing style={a.clothing} color={a.clothingColor} />
        <rect x="44" y="62" width="12" height="14" rx="4" fill={a.skin} />
        <ellipse cx="50" cy="48" rx="19" ry="22" fill={a.skin} />
        <ellipse cx="31" cy="50" rx="3" ry="5" fill={a.skin} />
        <ellipse cx="69" cy="50" rx="3" ry="5" fill={a.skin} />
        {!behind && <Hair style={a.hair} color={a.hairColor} />}
        {behind && <path d="M31 40 Q34 26 50 26 Q66 26 69 40 Q60 32 50 32 Q40 32 31 40 Z" fill={a.hairColor} />}
        <Eyes style={a.eyes} />
        <FacialHair style={a.facialHair} color={a.hairColor} />
        <Mouth style={a.mouth} />
        <Accessory style={a.accessory} />
      </g>
    </svg>
  );
}
