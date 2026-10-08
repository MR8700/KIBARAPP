/** Messages d'erreur en langage simple (aucun jargon technique pour l'utilisateur). */
export function friendly(e: any): string {
  const n = e?.name; const m = String(e?.message ?? '');
  if (n === 'NotAllowedError') return "Vous avez annulé, ou le téléphone n'a pas pu confirmer. Réessayez et validez avec votre empreinte, votre visage ou le code de votre écran.";
  if (n === 'InvalidStateError') return "Ce téléphone est déjà enregistré. Choisissez « J'ai déjà un espace ».";
  if (n === 'NotSupportedError' || n === 'SecurityError') return "Ce navigateur ne permet pas la sécurisation. Essayez avec Chrome ou Safari à jour.";
  if (/failed to fetch|network|load failed/i.test(m)) return 'Pas de connexion Internet. Vérifiez votre réseau, puis réessayez.';
  return m || 'Un problème est survenu. Réessayez dans un instant.';
}
