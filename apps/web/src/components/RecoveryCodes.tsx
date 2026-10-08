'use client';
import { useState } from 'react';

/** Affiche les codes de secours une seule fois, avec copie et téléchargement. */
export default function RecoveryCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = `KIBAR — codes de secours (usage unique)\n\n${codes.join('\n')}\n`;
  async function copy() { try { await navigator.clipboard.writeText(codes.join('\n')); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* presse-papiers refusé */ } }
  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); const a = document.createElement('a');
    a.href = url; a.download = 'kibar-codes-de-secours.txt'; a.click(); URL.revokeObjectURL(url);
  }
  return (<div>
    <ul className="card grid grid-cols-2 gap-2 font-mono text-xs">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
    <div className="mt-3 flex gap-2 text-xs font-semibold">
      <button className="flex-1 rounded-xl border border-line bg-white px-3 py-2.5" onClick={copy}>{copied ? 'Copié ✓' : 'Copier'}</button>
      <button className="flex-1 rounded-xl border border-line bg-white px-3 py-2.5" onClick={download}>Télécharger</button></div>
  </div>);
}
