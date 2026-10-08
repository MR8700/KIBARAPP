'use client';
import { useEffect, useState } from 'react';

/**
 * Bouton universel d'installation PWA compatible :
 * - Android (Chrome, Samsung Internet, Edge, etc.)
 * - iOS Safari (Guide interactif pas-à-pas « Partager » > « Sur l'écran d'accueil »)
 * - PC / Mac / ChromeOS (Chrome, Edge)
 * Détecte si l'application est déjà installée en mode standalone.
 */
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Détecte le mode standalone (déjà installé)
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    // Détecte iOS Safari
    const ua = window.navigator.userAgent.toLowerCase();
    const isApple = /iphone|ipad|ipod/.test(ua);
    setIsIos(isApple);

    // Écoute de l'événement natif d'installation Chromium / Android / Edge
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);

    window.addEventListener('appinstalled', () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  // Déjà installé ou masqué par l'utilisateur
  if (isStandalone || dismissed) return null;

  async function handleInstallClick() {
    if (deferredPrompt) {
      // Installation native (Android, Chrome, Edge)
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsStandalone(true);
        }
        setDeferredPrompt(null);
      } catch {
        // En cas d'erreur de prompt
      }
    } else if (isIos) {
      // Guide pas-à-pas pour Safari iOS
      setShowIosGuide(true);
    } else {
      // Navigateur sans beforeinstallprompt natif
      alert(
        "Pour installer KIBAR APP :\nOuvrez le menu de votre navigateur (les 3 points en haut ou en bas) puis cliquez sur 'Installer l'application' ou 'Ajouter à l'écran d'accueil'."
      );
    }
  }

  return (
    <>
      {/* Barre / Bouton flottant moderne d'installation */}
      <div className="fixed bottom-20 right-4 z-50 flex items-center gap-2 animate-bounce-short sm:bottom-6 sm:right-6">
        <button
          type="button"
          onClick={handleInstallClick}
          aria-label="Installer KIBAR APP sur cet appareil"
          className="flex items-center gap-2.5 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-600/30 ring-2 ring-white/80 backdrop-blur-md active:scale-95 transition-all"
        >
          <span className="ms text-[18px]">install_mobile</span>
          <span>Installer l'application</span>
        </button>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Masquer le bouton d'installation"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/40 text-white backdrop-blur-sm hover:bg-slate-900/60 transition"
        >
          <span className="ms text-[14px]">close</span>
        </button>
      </div>

      {/* Modal d'instructions guidé pour iPhone / iPad */}
      {showIosGuide && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-xs p-4 sm:items-center"
          onClick={() => setShowIosGuide(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl animate-[fadeup_.3s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                  <span className="ms text-[24px]">phone_iphone</span>
                </span>
                <div>
                  <h3 className="font-head text-base font-bold text-slate-900">
                    Installer sur iPhone / iPad
                  </h3>
                  <p className="text-xs text-slate-500">Accès rapide & direct</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIosGuide(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <span className="ms text-[20px]">close</span>
              </button>
            </div>

            <div className="mt-5 space-y-4 text-sm text-slate-700">
              <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-100 font-bold text-blue-700 text-xs">
                  1
                </span>
                <p className="text-xs leading-relaxed">
                  Dans Safari, appuyez sur l'icône <b>Partager</b>{' '}
                  <span className="ms inline-block text-[15px] align-middle text-blue-600">
                    ios_share
                  </span>{' '}
                  (en bas de votre écran).
                </p>
              </div>

              <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-100 font-bold text-blue-700 text-xs">
                  2
                </span>
                <p className="text-xs leading-relaxed">
                  Faites défiler vers le bas et sélectionnez{' '}
                  <b>« Sur l'écran d'accueil »</b>{' '}
                  <span className="ms inline-block text-[15px] align-middle text-blue-600">
                    add_box
                  </span>
                  .
                </p>
              </div>

              <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-100 font-bold text-blue-700 text-xs">
                  3
                </span>
                <p className="text-xs leading-relaxed">
                  Touchez <b>« Ajouter »</b> en haut à droite. KIBAR APP
                  s'ouvrira comme une vraie application !
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="btn mt-6 w-full !py-3 text-sm"
            >
              C'est compris
            </button>
          </div>
        </div>
      )}
    </>
  );
}
