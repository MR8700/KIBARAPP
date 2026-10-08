'use client';

/**
 * Arrière-plan fluide cinétique avec orbes organiques en mouvement (GPU-accéléré).
 * Reste subtil et élégant pour préserver une excellente lisibilité du texte et des formulaires.
 */
export default function FluidBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-slate-50/70 select-none"
    >
      {/* Orbe 1 : Bleu Royal & Électrique */}
      <div
        className="animate-fluid-1 absolute -top-[15%] -left-[10%] h-[460px] w-[460px] rounded-full bg-gradient-to-tr from-blue-400/25 via-blue-600/20 to-indigo-500/15 opacity-70 blur-[85px] sm:h-[620px] sm:w-[620px]"
      />

      {/* Orbe 2 : Indigo & Violet Profond */}
      <div
        className="animate-fluid-2 absolute top-[35%] -right-[15%] h-[480px] w-[480px] rounded-full bg-gradient-to-bl from-indigo-500/20 via-purple-500/15 to-blue-400/15 opacity-65 blur-[95px] sm:h-[650px] sm:w-[650px]"
      />

      {/* Orbe 3 : Cyan & Sahel Gold Doux */}
      <div
        className="animate-fluid-3 absolute -bottom-[15%] left-[15%] h-[420px] w-[420px] rounded-full bg-gradient-to-tr from-cyan-400/20 via-sky-300/15 to-amber-300/10 opacity-60 blur-[85px] sm:h-[580px] sm:w-[580px]"
      />

      {/* Trame de brume subtile */}
      <div className="absolute inset-0 bg-radial from-transparent via-white/30 to-white/60" />
    </div>
  );
}
