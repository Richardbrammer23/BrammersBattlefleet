export const AVATAR_OPTIONS = {
  preset: ['captain', 'engineer', 'pilot', 'analyst', 'admiral', 'custom'],
  hair: ['short', 'long', 'buzz', 'curly', 'bun', 'mohawk', 'bald'],
  hairColor: ['#1f1b18', '#4a2f1d', '#8a5a2b', '#d6a24e', '#e8e1d0', '#b33a3a', '#3a6fd8', '#8f5ae8'],
  skin: ['#f6d7c3', '#eac09f', '#d39b72', '#b07a52', '#8a5a3a', '#5e3b25'],
  eyes: ['round', 'focused', 'happy', 'wink'],
  mouth: ['smile', 'grin', 'neutral', 'determined'],
  facialHair: ['none', 'stubble', 'moustache', 'beard'],
  accessory: ['none', 'glasses', 'shades', 'headset', 'eyepatch', 'earring'],
  clothing: ['uniform', 'hoodie', 'jacket', 'tee'],
  clothingColor: ['#0f2a4a', '#1c6e5c', '#5b2a86', '#b4561f', '#2b2f36', '#8a1c2b'],
} as const;

type Options = typeof AVATAR_OPTIONS;
export type AvatarConfig = { [K in keyof Options]: Options[K][number] };

export const DEFAULT_AVATAR: AvatarConfig = {
  preset: 'captain',
  hair: 'short',
  hairColor: '#4a2f1d',
  skin: '#d39b72',
  eyes: 'round',
  mouth: 'smile',
  facialHair: 'none',
  accessory: 'none',
  clothing: 'uniform',
  clothingColor: '#0f2a4a',
};

export const AVATAR_PRESETS: Record<Exclude<AvatarConfig['preset'], 'custom'>, Omit<AvatarConfig, 'preset'>> = {
  captain: { hair: 'short', hairColor: '#4a2f1d', skin: '#d39b72', eyes: 'round', mouth: 'smile', facialHair: 'none', accessory: 'none', clothing: 'uniform', clothingColor: '#0f2a4a' },
  engineer: { hair: 'curly', hairColor: '#1f1b18', skin: '#8a5a3a', eyes: 'focused', mouth: 'grin', facialHair: 'none', accessory: 'glasses', clothing: 'hoodie', clothingColor: '#1c6e5c' },
  pilot: { hair: 'bun', hairColor: '#d6a24e', skin: '#f6d7c3', eyes: 'happy', mouth: 'smile', facialHair: 'none', accessory: 'headset', clothing: 'jacket', clothingColor: '#b4561f' },
  analyst: { hair: 'long', hairColor: '#8a5a2b', skin: '#eac09f', eyes: 'focused', mouth: 'neutral', facialHair: 'none', accessory: 'glasses', clothing: 'tee', clothingColor: '#5b2a86' },
  admiral: { hair: 'buzz', hairColor: '#e8e1d0', skin: '#b07a52', eyes: 'round', mouth: 'determined', facialHair: 'beard', accessory: 'none', clothing: 'uniform', clothingColor: '#2b2f36' },
};

/** Returns a sanitised config, or null if any field is not an allowed option. */
export function parseAvatar(input: unknown): AvatarConfig | null {
  if (!input || typeof input !== 'object') return null;
  const out: Record<string, string> = {};
  for (const [k, allowed] of Object.entries(AVATAR_OPTIONS)) {
    const v = (input as Record<string, unknown>)[k];
    if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) return null;
    out[k] = v;
  }
  return out as AvatarConfig;
}
