import { useState } from 'react';
import { api, errorMessage, setToken, type Player } from '../api';
import { DEFAULT_AVATAR, type AvatarConfig } from '../avatar/options';
import { NAME_MAX, nameError } from '../engine';
import { AvatarCreator } from './AvatarCreator';
import { RecoveryCodeCard } from './RecoveryCodeCard';
import { DevinMark } from './Characters';

interface Props {
  onDone: (player: Player) => void;
}

const NAME_HINT: Record<string, string> = {
  too_short: 'At least 2 characters.',
  too_long: `${NAME_MAX} characters maximum.`,
  invalid_characters: "Letters, numbers, spaces, . _ ' - only.",
  not_allowed: 'Please choose a different name.',
};

export function Welcome({ onDone }: Props) {
  const [step, setStep] = useState<'name' | 'avatar' | 'code' | 'recover'>('name');
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<AvatarConfig>(DEFAULT_AVATAR);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ player: Player; code: string } | null>(null);
  const [code, setCode] = useState('');
  const nameErr = name ? nameError(name) : 'too_short';

  const create = async (withAvatar: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.createPlayer(name, withAvatar ? avatar : null);
      setToken(r.token);
      setCreated({ player: r.player, code: r.recoveryCode });
      setStep('code');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const recover = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.recover(code);
      setToken(r.token);
      onDone(r.player);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="welcome">
      <div className="panel welcome-card">
        <div className="welcome-brand">
          <DevinMark size={56} title="BattleFleet emblem" />
          <div>
            <p className="eyebrow">Brammers BattleFleet AI</p>
            <h1>Welcome aboard, Commander</h1>
          </div>
        </div>

        {step === 'name' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!nameErr) setStep('avatar');
            }}
          >
            <p className="muted">Choose a call sign for the public leaderboard. No email or login required.</p>
            <label className="field">
              <span>Display name</span>
              <input
                autoFocus
                value={name}
                maxLength={NAME_MAX}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Captain Rich"
                aria-invalid={!!name && !!nameErr}
                data-testid="name-input"
              />
              <span className={`hint ${name && nameErr ? 'error' : ''}`}>
                {name && nameErr ? NAME_HINT[nameErr] : `${name.trim().length}/${NAME_MAX}`}
              </span>
            </label>
            <div className="row-actions">
              <button type="button" className="btn ghost" onClick={() => setStep('recover')}>
                I have a recovery code
              </button>
              <button className="btn primary" disabled={!!nameErr} data-testid="name-continue">
                Continue
              </button>
            </div>
          </form>
        )}

        {step === 'avatar' && (
          <>
            <p className="muted">Design your avatar — or skip and use the default. You can change it any time.</p>
            <AvatarCreator value={avatar} onChange={setAvatar} />
            {error && <p className="error">{error}</p>}
            <div className="row-actions">
              <button className="btn ghost" onClick={() => void create(false)} disabled={busy} data-testid="skip-avatar">
                Skip for now
              </button>
              <button className="btn primary" onClick={() => void create(true)} disabled={busy} data-testid="save-avatar">
                Save Avatar
              </button>
            </div>
          </>
        )}

        {step === 'code' && created && (
          <>
            <RecoveryCodeCard code={created.code} />
            <div className="row-actions">
              <button className="btn primary" onClick={() => onDone(created.player)} data-testid="profile-done">
                Continue to command centre
              </button>
            </div>
          </>
        )}

        {step === 'recover' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void recover();
            }}
          >
            <p className="muted">Enter the recovery code you saved to restore your profile on this device.</p>
            <label className="field">
              <span>Recovery code</span>
              <input autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" className="mono" />
            </label>
            {error && <p className="error">{error}</p>}
            <div className="row-actions">
              <button type="button" className="btn ghost" onClick={() => setStep('name')}>
                Back
              </button>
              <button className="btn primary" disabled={busy || code.replace(/[^0-9a-z]/gi, '').length < 24}>
                Restore profile
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
