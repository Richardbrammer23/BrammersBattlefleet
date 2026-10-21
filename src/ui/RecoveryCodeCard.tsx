import { useState } from 'react';

const FIRST_INTRO =
  "Your profile is remembered in this browser. To restore it on another device — or if you clear browser data — you'll need this code. You can make a new one from your profile at any time.";

export function RecoveryCodeCard({ code, title = 'Save your recovery code', intro = FIRST_INTRO }: { code: string; title?: string; intro?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const download = () => {
    const blob = new Blob([`Brammers BattleFleet AI recovery code\n\n${code}\n\nKeep this private. Anyone with this code can restore your profile.\n`], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'battlefleet-recovery-code.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="recovery">
      <h2>{title}</h2>
      <p className="muted">{intro}</p>
      <code className="recovery-code" data-testid="recovery-code">
        {code}
      </code>
      <div className="row-actions start">
        <button className="btn ghost" onClick={() => void copy()}>
          {copied ? 'Copied ✓' : 'Copy code'}
        </button>
        <button className="btn ghost" onClick={download}>
          Download .txt
        </button>
      </div>
    </div>
  );
}
