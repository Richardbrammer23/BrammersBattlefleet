import { useEffect, useState } from 'react';
import { api, errorMessage, type Player, type Profile as ProfileData } from '../api';
import { DEFAULT_AVATAR, type AvatarConfig } from '../avatar/options';
import { ACHIEVEMENTS, NAME_MAX, nameError, type AchievementCode } from '../engine';
import { AvatarCreator } from './AvatarCreator';
import { formatDuration, modeName } from './format';

interface Props {
  player: Player;
  onSaved: (p: Player) => void;
  onBack: () => void;
}

export function Profile({ player, onSaved, onBack }: Props) {
  const [name, setName] = useState(player.displayName);
  const [avatar, setAvatar] = useState<AvatarConfig>(player.avatar ?? DEFAULT_AVATAR);
  const [data, setData] = useState<ProfileData | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const nameErr = nameError(name);

  useEffect(() => {
    api.me().then(setData).catch(() => setData(null));
  }, []);

  const save = async () => {
    if (busy || nameErr) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.updateMe({ displayName: name, avatar });
      onSaved(r.player);
      setMsg({ ok: true, text: 'Profile saved.' });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const earned = new Set(data?.achievements.map((a) => a.code));

  return (
    <main className="page profile-page">
      <div className="page-head">
        <button className="btn ghost" onClick={onBack}>
          ← Back
        </button>
        <h1>Commander profile</h1>
      </div>
      <div className="profile-grid">
        <section className="panel">
          <h2>Identity</h2>
          <label className="field">
            <span>Display name</span>
            <input value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} data-testid="profile-name" />
            {nameErr && <span className="hint error">Names must be 2–{NAME_MAX} characters using letters, numbers and basic punctuation.</span>}
          </label>
          <AvatarCreator value={avatar} onChange={setAvatar} />
          {msg && <p className={msg.ok ? 'success' : 'error'}>{msg.text}</p>}
          <div className="row-actions">
            <button className="btn primary" disabled={busy || !!nameErr} onClick={() => void save()} data-testid="profile-save">
              Save Avatar &amp; Profile
            </button>
          </div>
        </section>
        <aside className="profile-side">
          <section className="panel">
            <h2>Service record</h2>
            {data ? (
              <>
                <p className="muted">
                  {data.totals.wins} wins · {data.totals.losses} losses
                </p>
                <h3>Personal bests</h3>
                {data.personalBests.length ? (
                  <ul className="pb-list">
                    {data.personalBests.map((b) => (
                      <li key={b.mode}>
                        <span className={`mode-pill ${b.mode}`}>{modeName(b.mode)}</span>
                        <span className="mono">
                          {b.humanTurns} turns · {formatDuration(b.durationMs)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted small">Win a game to set your first personal best.</p>
                )}
              </>
            ) : (
              <p className="muted">Loading…</p>
            )}
          </section>
          <section className="panel">
            <h2>Achievements</h2>
            <ul className="achievements">
              {(Object.keys(ACHIEVEMENTS) as AchievementCode[]).map((code) => (
                <li key={code} className={earned.has(code) ? 'earned' : 'locked'}>
                  <span className="medal" aria-hidden>
                    {earned.has(code) ? '★' : '☆'}
                  </span>
                  <span>
                    <strong>{ACHIEVEMENTS[code].name}</strong>
                    <span className="muted small"> — {ACHIEVEMENTS[code].description}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="panel">
            <h2>Privacy</h2>
            <p className="muted small">
              We store only your display name, avatar settings and game results. Your profile is tied to a secret token in this browser. Clearing browser data
              without your recovery code means the profile can't be restored.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}
