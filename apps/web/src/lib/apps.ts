export const ASTATUS: Record<string, { label: string; cls: string }> = {
  NEW: { label: 'Nouveau', cls: 'bg-primary/10 text-primary' },
  REVIEWING: { label: "En cours d'examen", cls: 'bg-sahel-gold/10 text-sahel-gold' },
  SELECTED: { label: 'Retenu', cls: 'bg-success/10 text-success' },
  REJECTED: { label: 'Non retenu', cls: 'bg-error/10 text-error' },
  WAITING: { label: 'En attente', cls: 'bg-slate-100 text-slate-600' },
};
export const show = (v: any) => (Array.isArray(v) ? v.join(', ') : v === null || v === undefined || v === '' ? '—' : String(v));
export const fmt = (d: string) => new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
