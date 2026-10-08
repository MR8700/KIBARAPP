const LABELS = ['Le poste', 'Les questions', 'Aperçu', 'Partage'];
/** Indicateur d'étapes du lancement d'un recrutement (1 → 4). */
export default function Stepper({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (<div role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step} aria-label={`Étape ${step} sur 4 : ${LABELS[step - 1]}`}>
    <div className="flex gap-1.5">{LABELS.map((l, i) => <span key={l} className={`h-1.5 flex-1 rounded-full ${i < step ? 'bg-primary' : 'bg-slate-200'}`} />)}</div>
    <p className="mt-2 text-xs font-semibold text-slate-500">Étape {step} sur 4 · <span className="text-primary">{LABELS[step - 1]}</span></p></div>);
}
