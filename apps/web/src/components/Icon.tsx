import React from 'react';

// Dictionnaire de chemins SVG vectoriels pour les icônes Material Symbols clés
// Affichage instantané (0 ms, 0 requête externe, aucun flash textuel FOUT)
const ICONS: Record<string, React.ReactNode> = {
  arrow_back: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-[1em] h-[1em]">
      <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
    </svg>
  ),
  arrow_forward: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-[1em] h-[1em]">
      <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8z" />
    </svg>
  ),
  fingerprint: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-[1em] h-[1em]">
      <path d="M17.81 4.47c-.08 0-.16-.02-.23-.06C15.66 3.42 14 3 12.01 3c-1.98 0-3.86.47-5.57 1.41-.24.13-.54.04-.68-.2-.13-.24-.04-.55.2-.68C7.82 2.52 9.86 2 12.01 2c2.13 0 3.99.47 5.92 1.5.24.13.33.43.2.67-.09.18-.21.3-.32.3zM3.51 9.72c-.25-.08-.39-.35-.31-.6.59-1.84 1.66-3.41 3.08-4.56.21-.17.53-.14.7.08.17.21.14.53-.08.7-1.3 1.05-2.28 2.49-2.81 4.17-.07.25-.34.39-.58.21zm16.98 0c-.24.08-.51-.06-.58-.31-.53-1.68-1.51-3.12-2.81-4.17-.22-.17-.25-.49-.08-.7.17-.22.49-.25.7-.08 1.42 1.15 2.49 2.72 3.08 4.56.08.25-.06.52-.31.7zM12 7c-2.76 0-5 2.24-5 5 0 .28-.22.5-.5.5s-.5-.22-.5-.5c0-3.31 2.69-6 6-6s6 2.69 6 6c0 .28-.22.5-.5.5s-.5-.22-.5-.5c0-2.76-2.24-5-5-5zm-3.5 5c0-.28.22-.5.5-.5s.5.22.5.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5c0-.28.22-.5.5-.5s.5.22.5.5c0 1.93-1.57 3.5-3.5 3.5S8.5 13.93 8.5 12zm3.5 5c-2.76 0-5-2.24-5-5 0-.28.22-.5.5-.5s.5.22.5.5c0 2.21 1.79 4 4 4s4-1.79 4-4c0-.28.22-.5.5-.5s.5.22.5.5c0 2.76-2.24 5-5 5zm0 3c-4.41 0-8-3.59-8-8 0-.28.22-.5.5-.5s.5.22.5.5c0 3.86 3.14 7 7 7s7-3.14 7-7c0-.28.22-.5.5-.5s.5.22.5.5c0 4.41-3.59 8-8 8z" />
    </svg>
  ),
  check_circle: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-[1em] h-[1em]">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
  ),
  add_circle: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-[1em] h-[1em]">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-[1em] h-[1em]">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
  ),
  person: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-[1em] h-[1em]">
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    </svg>
  ),
  groups: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-[1em] h-[1em]">
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
    </svg>
  ),
  deployed_code: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-[1em] h-[1em]">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  ),
};

export function Icon({ name, className = '' }: { name: string; className?: string }) {
  const svg = ICONS[name];
  if (svg) {
    return <span className={`inline-flex items-center justify-center ${className}`}>{svg}</span>;
  }
  // Fallback si l'icône n'est pas dans le dictionnaire
  return <span className={`ms ${className}`}>{name}</span>;
}
