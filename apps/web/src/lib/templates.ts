import type { Draft, Field, FieldType } from './draft';

const f = (key: string, type: FieldType, label: string, required = false, options: string[] = [], cond?: { on: string; value: string }): Field => ({
  key, type, label, required, config: {},
  options: options.map((o) => ({ label: o, value: o.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') })),
  conditions: cond ? [{ dependsOnKey: cond.on, operator: 'eq', value: cond.value }] : [],
});
const identity = [f('nom_complet', 'text', 'Nom et prénom', true), f('telephone', 'phone', 'Numéro WhatsApp / téléphone', true), f('ville', 'text', 'Ville de résidence', true)];
const niveaux = ['BEPC', 'Baccalauréat', 'Licence (Bac+3)', 'Master (Bac+5)', 'Autre'];

export type Template = { id: string; name: string; hint: string; icon: string; title: string; description: string; draft: Draft };
export const TEMPLATES: Template[] = [
  { id: 'commercial', name: 'Agents commerciaux', hint: 'Vente, terrain, objectifs', icon: 'storefront', title: '20 agents commerciaux',
    description: "Nous recrutons des agents commerciaux motivés pour développer notre activité. Remplissez ce formulaire en quelques minutes : nous vous recontactons si votre profil nous intéresse.",
    draft: { sections: [
      { id: 's1', title: 'Informations personnelles', fields: [...identity, f('date_naissance', 'date', 'Date de naissance')] },
      { id: 's2', title: 'Études et formation', fields: [f('niveau_etudes', 'single', "Niveau d'études", true, niveaux), f('dernier_diplome', 'text', 'Dernier diplôme')] },
      { id: 's3', title: 'Expérience professionnelle', fields: [f('experience', 'yesno', 'Avez-vous déjà une expérience ?', true), f('annees_experience', 'number', "Nombre d'années", false, [], { on: 'experience', value: 'oui' }), f('dernier_poste', 'text', 'Dernier poste et société', false, [], { on: 'experience', value: 'oui' })] },
      { id: 's4', title: 'Documents', fields: [f('cv', 'file', 'Curriculum Vitae (CV)', true), f('piece_identite', 'image', "Pièce d'identité")] },
    ] } },
  { id: 'stage', name: 'Stage / Alternance', hint: 'Étudiants et jeunes diplômés', icon: 'school', title: 'Stage de 3 mois',
    description: "Nous ouvrons un stage pour un(e) étudiant(e) ou jeune diplômé(e). Présentez-vous et joignez votre CV : toutes les candidatures sont lues.",
    draft: { sections: [
      { id: 's1', title: 'Informations personnelles', fields: [...identity, f('email', 'email', 'Adresse email')] },
      { id: 's2', title: 'Votre formation', fields: [f('niveau_etudes', 'single', "Niveau d'études actuel", true, niveaux), f('etablissement', 'text', 'Établissement', true), f('motivation', 'longtext', 'Pourquoi ce stage vous intéresse ?', true)] },
      { id: 's3', title: 'Documents', fields: [f('cv', 'file', 'Curriculum Vitae (CV)', true)] },
    ] } },
  { id: 'emploi', name: 'Emploi (CDI / CDD)', hint: 'Poste technique ou administratif', icon: 'work', title: 'Technicien support',
    description: "Nous recrutons pour un poste à temps plein. Décrivez votre parcours et joignez votre CV pour postuler.",
    draft: { sections: [
      { id: 's1', title: 'Informations personnelles', fields: [...identity, f('email', 'email', 'Adresse email')] },
      { id: 's2', title: 'Parcours', fields: [f('niveau_etudes', 'single', "Niveau d'études", true, niveaux), f('experience', 'yesno', "Avez-vous de l'expérience dans ce métier ?", true), f('annees_experience', 'number', "Nombre d'années", false, [], { on: 'experience', value: 'oui' }), f('disponibilite', 'date', 'Disponible à partir du')] },
      { id: 's3', title: 'Documents', fields: [f('cv', 'file', 'Curriculum Vitae (CV)', true), f('diplomes', 'file', 'Copies des diplômes')] },
    ] } },
  { id: 'simple', name: 'Formulaire simple', hint: 'Juste les bases', icon: 'description', title: '',
    description: "Merci de remplir ce formulaire pour postuler.",
    draft: { sections: [{ id: 's1', title: 'Votre candidature', fields: [f('nom_complet', 'text', 'Nom et prénom', true), f('telephone', 'phone', 'Numéro WhatsApp / téléphone', true), f('cv', 'file', 'Curriculum Vitae (CV)')] }] } },
];
export const tplById = (id: string | null) => TEMPLATES.find((t) => t.id === id);
export const cloneDraft = (d: Draft): Draft => JSON.parse(JSON.stringify(d));
