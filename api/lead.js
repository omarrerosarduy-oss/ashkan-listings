// Reçoit le formulaire des pages d'annonce (laval.html, longueuil.html) et crée le lead dans GoHighLevel.
// Même mécanique que la landing acheteur (projet ashkan-landing), avec l'annonce en plus.
// Le jeton GHL vit seulement ici, côté serveur (variable GHL_TOKEN). Il n'est jamais envoyé à la page.
// Aucune donnée personnelle n'est écrite dans les journaux Vercel : seulement des identifiants et des statuts.

const GHL = 'https://services.leadconnectorhq.com';
const API_VERSION = '2021-07-28';
const LOCATION_ID = process.env.GHL_LOCATION_ID || 'UVQRmgjvu0U7JYmCBE0a';
const ASHKAN_USER_ID = 'UNSAtHoFvp9QhyQH6jeH';
// Une entrée par page d'annonce. L'étiquette d'adresse est celle que le CRM utilise déjà pour les
// demandes Centris et REALTOR.ca sur la même propriété, pour que tout se regroupe.
const ANNONCES = {
  laval: {
    adresse: '1604-255 rue Étienne-Lavoie, Laval (Aquablu)',
    court: '1604-255 Étienne-Lavoie',
    prix: 1400000,
    etiquette: '255 rue étienne-lavoie #1604',
    source: 'meta-laval',
    langue: 'en',
  },
  longueuil: {
    adresse: '205-3410 ch. de Chambly, Longueuil',
    court: '205-3410 ch. de Chambly',
    prix: 380000,
    etiquette: '3410 ch. de chambly #205',
    source: 'meta-longueuil',
    langue: 'fr',
  },
};
const ALERTE_CONTACT_ID = process.env.ALERTE_CONTACT_ID || 'cUafne3cRWoCokXJPuy0'; // fiche « Ashkan Javid » (son cellulaire)
const SUIVI_WORKFLOW_ID = process.env.SUIVI_WORKFLOW_ID || '303a6b4e-bcef-4575-991e-196c001521b5'; // 01. Suivi des Leads Acheteurs et Vendeurs

const CHAMPS = {
  langues: 'i6cxW4FYk29RNukmVZQU', // Vouvoiement | Tutoiement | Anglais
  typePropriete: 'wpTDrGHUMY6b01QmO83H',
  budgetMin: 'pL3KNV9pG09r0G6jvF59',
  budgetMax: 'L2asjtWliwkIYACm5SIN',
  delai: 'ULQ1gU3LZhR58wD8bRu7',
  preapprobation: 'UJEFdtusjZe85GTyESiF',
  secteurs: 'BKfsw0FonFN1gXrKxZ5C',
};

// OZ - Acheteur, étape « Nouveau lead ». Les étapes fermées (Gagné, Nurture, Perdu) restent en statut open dans GHL.
const PIPELINE = {
  id: 'XKYMlY1OXS93E8EqnleL',
  etape: '6a67196d-122c-4140-92a9-a16199cb5bb6',
  fermees: [
    '6a4c5caf-5e9c-4300-b34b-11699bd0c944', // Gagné
    'dc286ce4-2df4-4064-aff1-49fe79453a29', // Nurture
    'b1398515-7020-4226-b0dc-effe278b3b60', // Perdu / Non qualifié
  ],
};

// Seules les valeurs proposées par le formulaire sont acceptées : rien d'autre n'entre dans les champs du CRM.
const TYPES = ['Condo', 'Maison', 'Jumele', 'Duplex/Triplex', 'Peu importe'];
const BUDGETS_MIN = ['Moins de 300k', '300 000', '350 000', '400 000', '450 000', '500 000', '600 000', '700 000', '800 000', '1 000 000'];
const BUDGETS_MAX = ['350 000', '400 000', '450 000', '500 000', '600 000', '700 000', '800 000', '1 000 000', '1 400 000', '1 500 000', '2 000 000+'];
const DELAIS = {
  Immediat: 'délai-immédiat',
  '1-3 mois': 'délai-1-3-mois',
  '3-6 mois': 'délai-3-6-mois',
  'Je magasine': 'délai-magasine',
  'Just browsing': 'délai-magasine',
};
const PREAPPROBATIONS = { Oui: 'préqualifié-oui', 'En cours': 'préqualifié-en-cours', 'Pas encore': 'préqualifié-non' };
const REGIONS = {
  Montreal: 'région-montréal',
  Laval: 'région-laval',
  'Rive-Sud': 'région-rive-sud',
  'Rive-Nord': 'région-rive-nord',
  Flexible: 'région-flexible',
};

// Filtre de première ligne seulement (l'en-tête Origin se falsifie). La vraie limite est la règle
// de limitation de débit du pare-feu Vercel sur /api/lead.
const ORIGINES = [
  /^https:\/\/ashkan-listings\.vercel\.app$/,
  /^https:\/\/ashkan-listings(-(git-[a-z0-9-]+|[a-z0-9]+))?-omarrerosarduy-1283s-projects\.vercel\.app$/,
  /^https:\/\/([a-z0-9-]+\.)?immobilierancrage\.ca$/,
];

const COURRIEL = /^[^\s@.]+(\.[^\s@.]+)*@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, erreur: 'methode' });
  }

  const origine = req.headers.origin || '';
  const extra = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!ORIGINES.some((re) => re.test(origine)) && !extra.includes(origine)) {
    return res.status(403).json({ ok: false, erreur: 'origine' });
  }

  // Exiger du JSON force un préflight CORS pour tout appel venant d'un autre site, et il échoue.
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    return res.status(415).json({ ok: false, erreur: 'format' });
  }

  if (!process.env.GHL_TOKEN) {
    console.error(JSON.stringify({ evt: 'lead', erreur: 'GHL_TOKEN manquant' }));
    return res.status(500).json({ ok: false, erreur: 'configuration' });
  }

  let corps;
  try {
    corps = req.body; // analyse paresseuse de Vercel : lève une erreur sur un JSON mal formé
  } catch {
    return res.status(400).json({ ok: false, erreur: 'format' });
  }
  if (typeof corps === 'string') corps = safeJson(corps);
  if (!corps || typeof corps !== 'object' || Array.isArray(corps)) corps = {};

  // Piège à robots : champ invisible pour un humain. S'il est rempli, on répond OK sans rien écrire.
  if (texte(corps.verif, 200)) {
    console.log(JSON.stringify({ evt: 'lead', ignore: 'pot-de-miel' }));
    return res.status(200).json({ ok: true });
  }

  const lead = valider(corps);
  if (lead.erreur) return res.status(400).json({ ok: false, erreur: lead.erreur });

  const journal = { evt: 'lead', annonce: lead.page, etapes: {} };
  try {
    const contact = await trouverOuCreerContact(lead);
    journal.contactId = contact.id;
    journal.nouveau = contact.nouveau;
    if (contact.courrielRefuse) journal.etapes.courriel = 'refusé par GHL, gardé dans la note';

    const [etiquettes, coordonnees, criteres, opportunite] = await Promise.allSettled([
      contact.nouveau ? Promise.resolve('à la création') : ajouterEtiquettes(contact.id, lead),
      contact.nouveau ? Promise.resolve('à la création') : completerCoordonnees(contact.fiche, lead),
      contact.nouveau ? Promise.resolve('à la création') : mettreAJourCriteres(contact.id, lead),
      creerOpportunite(contact.id, lead),
    ]);
    journal.etapes.etiquettes = statut(etiquettes);
    journal.etapes.coordonnees = statut(coordonnees);
    journal.etapes.criteres = statut(criteres);
    journal.etapes.opportunite = statut(opportunite);

    const oppInfo = opportunite.status === 'fulfilled' ? opportunite.value : 'échec de création, à créer à la main';
    const ref = crypto.randomUUID().slice(0, 8); // repère unique de la soumission, sert à éviter les doublons au réessai
    const note = construireNote(lead, contact, oppInfo, ref);
    const tache = construireTache(lead, ref);
    const annonce = ANNONCES[lead.page];
    const alerte =
      `Nouveau lead (annonce ${annonce.court}) : ${nomAffichable(lead.prenom)} ${nomAffichable(lead.nom)}, ${telephoneLisible(lead.telephone)}. ` +
      `Budget ${lead.budgetMin || '?'} à ${lead.budgetMax || '?'} $, délai ${lead.delai || '?'}, préqualifié ${lead.preapprobation || '?'}. Tâche de rappel créée dans le CRM.`;
    // Seulement pour un lead qui entre à « Nouveau lead » : pas de relance à un dossier déjà en cours.
    const nouvelleOpp = opportunite.status === 'fulfilled' && /^(créée|nouvelle)/.test(opportunite.value);
    const [n, t, ack, alr, suivi] = await Promise.allSettled([
      avecReessai(
        () => ghl('POST', `/contacts/${contact.id}/notes`, { body: note }),
        () => dejaEcrit(`/contacts/${contact.id}/notes`, 'notes', ref),
      ),
      avecReessai(
        () => ghl('POST', `/contacts/${contact.id}/tasks`, tache),
        () => dejaEcrit(`/contacts/${contact.id}/tasks`, 'tasks', ref),
      ),
      accuserReception(contact.id, lead),
      alerterAshkan(alerte),
      nouvelleOpp ? inscrireSuivi(contact.id) : Promise.resolve('non (pas de nouvelle opportunité)'),
    ]);
    journal.etapes.note = statut(n);
    journal.etapes.tache = statut(t);
    journal.etapes.accuse = statut(ack);
    journal.etapes.alerte = statut(alr);
    journal.etapes.suivi = statut(suivi);

    console.log(JSON.stringify(journal));
    return res.status(200).json({ ok: true });
  } catch (e) {
    journal.erreur = descriptionErreur(e);
    console.error(JSON.stringify(journal));
    return res.status(502).json({ ok: false, erreur: 'crm' });
  }
}

// ---------- Validation ----------

function valider(c) {
  const prenom = uneLigne(c.prenom, 60);
  const nom = uneLigne(c.nom, 60);
  const telephone = normaliserTelephone(texte(c.telephone, 40));
  const courriel = texte(c.courriel, 254).toLowerCase();
  const message = texte(c.message, 2000);

  if (!prenom || !nom) return { erreur: 'nom' };
  if (!telephone) return { erreur: 'telephone' };
  if (!courriel || !COURRIEL.test(courriel)) return { erreur: 'courriel' };
  if (!(typeof c.page === 'string' && Object.hasOwn(ANNONCES, c.page))) return { erreur: 'annonce' };

  const choix = (v, liste) => (typeof v === 'string' && liste.includes(v) ? v : '');
  const regions = Array.isArray(c.regions) ? c.regions.filter((r) => typeof r === 'string' && Object.hasOwn(REGIONS, r)) : [];

  return {
    prenom,
    nom,
    telephone,
    courriel,
    message,
    typePropriete: choix(c.typePropriete, TYPES),
    budgetMin: choix(c.budgetMin, BUDGETS_MIN),
    budgetMax: choix(c.budgetMax, BUDGETS_MAX),
    delai: choix(c.delai, Object.keys(DELAIS)),
    preapprobation: choix(c.preapprobation, Object.keys(PREAPPROBATIONS)),
    regions: [...new Set(regions)],
    page: typeof c.page === 'string' && Object.hasOwn(ANNONCES, c.page) ? c.page : '',
    utm: lireUtm(c.utm),
  };
}

// Paramètres de campagne transmis par la page (utm_*). Texte court, une ligne, jamais interprété.
function lireUtm(u) {
  if (!u || typeof u !== 'object') return {};
  const garde = {};
  for (const cle of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const v = uneLigne(u[cle], 100);
    // Lettres, chiffres, espaces et ponctuation de nommage seulement : pas de « : », « @ » ni lien.
    if (v && /^[\p{L}\p{N} ._~+|()—–-]+$/u.test(v)) garde[cle] = v;
  }
  return garde;
}

function texte(v, max) {
  if (typeof v !== 'string') return '';
  return v
    .replace(/[\u0085\u2028\u2029]/g, '\n') // séparateurs de ligne Unicode ramenés à un vrai saut de ligne
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
    .trim()
    .slice(0, max);
}

// Prénom et nom : une seule ligne, pour qu'ils ne puissent pas fabriquer de fausses lignes dans la note.
function uneLigne(v, max) {
  return texte(typeof v === 'string' ? v.replace(/\s+/g, ' ') : v, max);
}

// Numéros nord-américains valides, ou format international avec « + ».
function normaliserTelephone(brut) {
  if (!brut) return '';
  const chiffres = brut.replace(/\D/g, '');
  let e164 = '';
  if (brut.trim().startsWith('+')) e164 = chiffres.length >= 8 && chiffres.length <= 15 ? `+${chiffres}` : '';
  else if (chiffres.length === 10) e164 = `+1${chiffres}`;
  else if (chiffres.length === 11 && chiffres.startsWith('1')) e164 = `+${chiffres}`;
  // Plan nord-américain : indicatif régional et central commencent par 2 à 9.
  if (e164.startsWith('+1') && !/^\+1[2-9]\d{2}[2-9]\d{6}$/.test(e164)) return '';
  return e164;
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

// ---------- GoHighLevel ----------

async function ghl(methode, chemin, corps) {
  const reponse = await fetch(`${GHL}${chemin}`, {
    method: methode,
    headers: {
      Authorization: `Bearer ${process.env.GHL_TOKEN.replace(/^Bearer\s+/i, '')}`,
      Version: API_VERSION,
      Accept: 'application/json',
      ...(corps ? { 'Content-Type': 'application/json' } : {}),
    },
    body: corps ? JSON.stringify(corps) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  const brut = await reponse.text();
  const donnees = brut ? safeJson(brut) : {};
  if (!reponse.ok) {
    const err = new Error(`GHL ${methode} ${chemin.split('?')[0]} -> ${reponse.status}`);
    err.status = reponse.status;
    err.donnees = donnees;
    throw err;
  }
  return donnees;
}

function etiquettesDuLead(lead) {
  const annonce = ANNONCES[lead.page];
  const t = ['acheteur', annonce.etiquette, ...(annonce.langue === 'en' ? ['lang-en'] : [])];
  if (lead.delai) t.push(DELAIS[lead.delai]);
  if (lead.preapprobation) t.push(PREAPPROBATIONS[lead.preapprobation]);
  for (const r of lead.regions) t.push(REGIONS[r]);
  return t;
}

function champsCriteres(lead) {
  const valeurs = {
    typePropriete: lead.typePropriete,
    budgetMin: lead.budgetMin,
    budgetMax: lead.budgetMax,
    delai: lead.delai,
    preapprobation: lead.preapprobation,
    secteurs: lead.regions.join(', '),
  };
  return Object.entries(valeurs)
    .filter(([, v]) => v)
    .map(([cle, v]) => ({ id: CHAMPS[cle], field_value: v }));
}

async function trouverOuCreerContact(lead) {
  const params = new URLSearchParams({ locationId: LOCATION_ID, number: lead.telephone, email: lead.courriel });
  let doublon;
  try {
    doublon = await ghl('GET', `/contacts/search/duplicate?${params}`);
  } catch (e) {
    // Courriel refusé dès la recherche : on cherche par téléphone seulement.
    if (e.status !== 400 && e.status !== 422) throw e;
    params.delete('email');
    doublon = await ghl('GET', `/contacts/search/duplicate?${params}`);
  }
  if (doublon.contact && doublon.contact.id) return { id: doublon.contact.id, nouveau: false, fiche: doublon.contact };

  const fiche = {
    locationId: LOCATION_ID,
    firstName: lead.prenom,
    lastName: lead.nom,
    phone: lead.telephone,
    source: ANNONCES[lead.page].source,
    tags: etiquettesDuLead(lead),
    assignedTo: ASHKAN_USER_ID,
    customFields: [
      { id: CHAMPS.langues, field_value: ANNONCES[lead.page].langue === 'en' ? 'Anglais' : 'Vouvoiement' },
      ...champsCriteres(lead),
    ],
  };
  try {
    const cree = await ghl('POST', '/contacts/', { ...fiche, email: lead.courriel });
    return { id: cree.contact.id, nouveau: true };
  } catch (e) {
    // Course entre la recherche et la création : GHL renvoie l'identifiant du contact existant.
    const existant = e.donnees && e.donnees.meta && e.donnees.meta.contactId;
    if (e.status === 400 && existant) return { id: existant, nouveau: false };
    // Courriel refusé par GHL : on ne perd pas le lead pour autant, le courriel ira dans la note.
    if (e.status === 400 || e.status === 422) {
      const cree = await ghl('POST', '/contacts/', fiche);
      return { id: cree.contact.id, nouveau: true, courrielRefuse: true };
    }
    throw e;
  }
}

// Délai, préqualification et régions décrivent l'état actuel du lead. On ajoute d'abord les nouvelles
// étiquettes (ajout idempotent, donc réessayable), puis on retire les anciennes valeurs, mais seulement
// dans une famille où le visiteur vient de répondre : une question laissée vide n'efface rien.
async function ajouterEtiquettes(contactId, lead) {
  const nouvelles = etiquettesDuLead(lead);
  await avecReessai(
    () => ghl('POST', `/contacts/${contactId}/tags`, { tags: nouvelles }),
    async () => false,
  );
  const familles = [
    lead.delai ? Object.values(DELAIS) : [],
    lead.preapprobation ? Object.values(PREAPPROBATIONS) : [],
    lead.regions.length ? Object.values(REGIONS) : [],
  ].flat();
  const perimees = familles.filter((t) => !nouvelles.includes(t));
  if (!perimees.length) return 'ok';
  try {
    await ghl('DELETE', `/contacts/${contactId}/tags`, { tags: perimees });
    return 'ok';
  } catch (e) {
    return `ajoutées, anciennes non retirées (${descriptionErreur(e)})`;
  }
}

// Contact déjà connu : on ne touche ni au nom ni aux coordonnées, seulement aux critères qu'il vient de donner.
async function mettreAJourCriteres(contactId, lead) {
  const champs = champsCriteres(lead);
  if (!champs.length) return 'rien à mettre à jour';
  await ghl('PUT', `/contacts/${contactId}`, { customFields: champs });
  return 'ok';
}

// Ne recule jamais un dossier en cours. Un ancien dossier (Gagné, Nurture, Perdu) n'empêche pas
// d'ouvrir une nouvelle opportunité à « Nouveau lead ».
async function creerOpportunite(contactId, lead) {
  const params = new URLSearchParams({
    location_id: LOCATION_ID,
    contact_id: contactId,
    pipeline_id: PIPELINE.id,
    status: 'open',
  });
  const existantes = (await ghl('GET', `/opportunities/search?${params}`)).opportunities || [];
  const enCours = existantes.filter((o) => !PIPELINE.fermees.includes(o.pipelineStageId));
  if (enCours.length) return 'dossier déjà en cours dans OZ - Acheteur, laissé à son étape (voir la note pour l’annonce)';

  // Même convention que les leads Meta du 1919 Beaudry : nom de l'annonce et prix affiché.
  const annonce = ANNONCES[lead.page];
  await ghl('POST', '/opportunities/', {
    locationId: LOCATION_ID,
    pipelineId: PIPELINE.id,
    pipelineStageId: PIPELINE.etape,
    contactId,
    name: `${lead.prenom} ${lead.nom} — ${annonce.court} | Meta`,
    status: 'open',
    assignedTo: ASHKAN_USER_ID,
    monetaryValue: annonce.prix,
  });
  return existantes.length
    ? 'nouvelle opportunité à Nouveau lead (un ancien dossier fermé existe)'
    : 'créée à l’étape Nouveau lead';
}

// Les lignes générées d'abord, puis le texte du visiteur clairement encadré : c'est une donnée
// saisie par un inconnu, jamais une consigne.
function construireNote(lead, contact, oppInfo, ref) {
  const lignes = [
    `Demande reçue par la page de l'annonce ${ANNONCES[lead.page].adresse}, le ${horodatage()}. Réf. ${ref}`,
    `Type de propriété : ${lead.typePropriete || '—'}`,
    `Budget : ${lead.budgetMin || '—'} à ${lead.budgetMax || '—'} $`,
    `Délai d'achat : ${lead.delai || '—'}`,
    `Préqualifié : ${lead.preapprobation || '—'}`,
    `Régions : ${lead.regions.join(', ') || '—'}`,
    `Opportunité : ${oppInfo}`,
  ];
  const utm = Object.entries(lead.utm).map(([k, v]) => `> ${k} = ${v}`);
  if (utm.length) {
    lignes.push('--- Campagne, valeurs transmises par l\'adresse de la page, non vérifiées ---', ...utm, '--- Fin campagne ---');
  }
  if (!contact.nouveau || contact.courrielRefuse) {
    lignes.push(`Coordonnées saisies sur la page : ${lead.prenom} ${lead.nom}, ${lead.telephone}, ${lead.courriel}`);
  }
  if (contact.courrielRefuse) lignes.push('Le courriel saisi a été refusé par le CRM, à vérifier avec le client.');
  lignes.push(...texteVisiteur(lead.message));
  return lignes.join('\n');
}

function construireTache(lead, ref) {
  return {
    title: `Rappeler ${lead.prenom} ${lead.nom} (annonce ${ANNONCES[lead.page].court})`,
    body: [`Demande reçue par la page de l'annonce ${ANNONCES[lead.page].adresse}. Réf. ${ref}`, ...texteVisiteur(lead.message)].join('\n'),
    dueDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    completed: false,
    assignedTo: ASHKAN_USER_ID,
  };
}

function texteVisiteur(message) {
  if (!message) return ['Commentaire du visiteur : (aucun)'];
  return [
    '--- Commentaire du visiteur, texte libre non vérifié ---',
    ...message.split(/\r\n|\r|\n/).map((l) => `> ${l}`),
    '--- Fin du commentaire du visiteur ---',
  ];
}

async function dejaEcrit(chemin, cle, ref) {
  const liste = (await ghl('GET', chemin))[cle] || [];
  return liste.some((x) => String(x.body || '').includes(`Réf. ${ref}`));
}

// Réessaie une fois sur 429, 5xx ou délai dépassé. Avant de relancer un POST dont la réponse
// s'est perdue, on vérifie qu'il n'a pas déjà été écrit, pour ne pas créer de doublon.
async function avecReessai(fn, dejaFait) {
  try {
    return await fn();
  } catch (e) {
    if (e.status && e.status < 500 && e.status !== 429) throw e;
    await new Promise((r) => setTimeout(r, 600));
    if (e.status !== 429 && (await dejaFait().catch(() => false))) return 'ok (confirmé après délai)';
    return fn();
  }
}

// ---------- Textos ----------

// Nom affichable dans un texto : lettres, espaces, apostrophes et traits d'union seulement,
// pour que personne ne puisse glisser un lien ou un numéro dans un message envoyé par le CRM.
function nomAffichable(v) {
  return String(v || '').replace(/[^\p{L}' -]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 30);
}

function telephoneLisible(e164) {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

function envoyerSms(contactId, message) {
  return ghl('POST', '/conversations/messages', { type: 'SMS', contactId, message });
}

// Accusé de réception immédiat, comme pour les leads Meta. Seulement vers un numéro nord-américain :
// le formulaire ne doit pas servir à faire envoyer des textos à l'étranger.
async function accuserReception(contactId, lead) {
  if (!lead.telephone.startsWith('+1')) return 'non envoyé (numéro hors Amérique du Nord)';
  const prenom = nomAffichable(lead.prenom);
  const annonce = ANNONCES[lead.page];
  const message =
    annonce.langue === 'en'
      ? `Hello${prenom ? ` ${prenom}` : ''}, thank you for your interest in ${annonce.adresse}. Ashkan Javid, real estate broker with Royal LePage Urbain, will contact you shortly. Reply STOP to opt out of texts.`
      : `Bonjour${prenom ? ` ${prenom}` : ''}, merci pour votre intérêt envers ${annonce.adresse}. Ashkan Javid, courtier immobilier chez Royal LePage Urbain, vous contactera sous peu. Répondez STOP pour ne plus recevoir de textos.`;
  await envoyerSms(contactId, message);
  return 'envoyé';
}

// Alerte texto à Ashkan sur sa propre fiche du CRM, pour qu'il rappelle vite.
// ALERTE_CONTACT_ID=desactive coupe l'alerte, le temps d'un essai en production.
async function alerterAshkan(resume) {
  if (ALERTE_CONTACT_ID === 'desactive') return 'désactivée (essai)';
  await envoyerSms(ALERTE_CONTACT_ID, resume);
  return 'envoyée';
}

// Inscrit le lead à la séquence de relance du CRM, comme le faisaient les workflows d'entrée
// FB-Intake et OZ-Intake (dernière action « Add to Workflow »). Le workflow 02 l'en retire dès
// qu'il répond, appelle ou change d'étape.
async function inscrireSuivi(contactId) {
  await ghl('POST', `/contacts/${contactId}/workflow/${SUIVI_WORKFLOW_ID}`, {});
  return 'inscrit';
}

// Contact déjà connu : on ne remplace jamais ce qui existe, on remplit seulement les champs vides.
// Sans numéro au dossier, le CRM ne peut pas envoyer l'accusé de réception au lead.
async function completerCoordonnees(fiche, lead) {
  const manquants = {};
  if (!fiche.phone && lead.telephone) manquants.phone = lead.telephone;
  if (!fiche.email && lead.courriel) manquants.email = lead.courriel;
  if (!fiche.firstName && lead.prenom) manquants.firstName = lead.prenom;
  if (!fiche.lastName && lead.nom) manquants.lastName = lead.nom;
  if (!Object.keys(manquants).length) return 'rien à compléter';
  try {
    await ghl('PUT', `/contacts/${fiche.id}`, manquants);
    return `complété : ${Object.keys(manquants).join(', ')}`;
  } catch (e) {
    // Par exemple un numéro déjà utilisé par une autre fiche : on continue sans bloquer le lead.
    return `non complété (${descriptionErreur(e)})`;
  }
}

function horodatage() {
  return new Intl.DateTimeFormat('fr-CA', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Toronto',
  }).format(new Date());
}

function statut(r) {
  if (r.status === 'fulfilled') return typeof r.value === 'string' ? r.value : 'ok';
  return `échec : ${descriptionErreur(r.reason)}`;
}

// Les messages de validation de GHL décrivent des champs (« property x should not exist »),
// jamais leur contenu : on peut les journaliser.
function descriptionErreur(e) {
  if (!e) return 'inconnue';
  const msg = e.donnees && e.donnees.message;
  let details = '';
  if (Array.isArray(msg)) details = ` (${msg.join('; ').slice(0, 200)})`;
  // Message en texte : gardé seulement s'il ne contient ni numéro ni courriel.
  else if (typeof msg === 'string' && !/\d{6,}|@/.test(msg)) details = ` (${msg.slice(0, 200)})`;
  return `${String(e.message || e).slice(0, 200)}${details}`;
}
