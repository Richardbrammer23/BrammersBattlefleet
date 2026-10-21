import { AVATAR_OPTIONS, AVATAR_PRESETS, type AvatarConfig } from '../avatar/options';
import { Avatar } from './Avatar';

const LABELS: Record<keyof AvatarConfig, string> = {
  preset: 'Preset style',
  hair: 'Hairstyle',
  hairColor: 'Hair colour',
  skin: 'Skin tone',
  eyes: 'Eyes',
  mouth: 'Expression',
  facialHair: 'Facial hair',
  accessory: 'Glasses & accessories',
  clothing: 'Clothing',
  clothingColor: 'Clothing colour',
};

const pretty = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface Props {
  value: AvatarConfig;
  onChange: (a: AvatarConfig) => void;
}

export function AvatarCreator({ value, onChange }: Props) {
  const set = <K extends keyof AvatarConfig>(k: K, v: AvatarConfig[K]) => {
    if (k === 'preset') {
      const preset = v as AvatarConfig['preset'];
      onChange(preset === 'custom' ? { ...value, preset } : { preset, ...AVATAR_PRESETS[preset] });
    } else onChange({ ...value, [k]: v, preset: 'custom' } as AvatarConfig);
  };

  return (
    <div className="avatar-creator">
      <div className="avatar-preview" aria-live="polite">
        <Avatar config={value} size={168} title="Avatar preview" />
        <span className="muted small">Live preview</span>
      </div>
      <div className="avatar-fields">
        {(Object.keys(AVATAR_OPTIONS) as (keyof AvatarConfig)[]).map((k) => {
          const opts = AVATAR_OPTIONS[k] as readonly string[];
          const isColour = k === 'hairColor' || k === 'skin' || k === 'clothingColor';
          return (
            <fieldset key={k} className="avatar-field">
              <legend>{LABELS[k]}</legend>
              <div className={isColour ? 'swatches' : 'chips'}>
                {opts.map((o) => (
                  <button
                    key={o}
                    type="button"
                    className={`${isColour ? 'swatch' : 'chip'} ${value[k] === o ? 'active' : ''}`}
                    style={isColour ? { background: o } : undefined}
                    aria-pressed={value[k] === o}
                    aria-label={isColour ? `${LABELS[k]} ${o}` : undefined}
                    onClick={() => set(k, o as never)}
                  >
                    {isColour ? '' : pretty(o)}
                  </button>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
