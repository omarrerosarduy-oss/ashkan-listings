# Pages d'annonce — ashkan-listings.vercel.app

- `/laval.html` : 1604-255 rue Étienne-Lavoie, Laval (Aquablu), 1 400 000 $, page en anglais
- `/longueuil.html` : 205-3410 ch. de Chambly, Longueuil, 380 000 $
- `/confidentialite`

## Ce que fait une soumission (`api/lead.js`)
Même mécanique que la landing acheteur (dépôt ashkan-landing), avec l'annonce :
source `meta-laval` ou `meta-longueuil`, étiquette d'adresse commune avec les demandes
Centris et REALTOR.ca (`255 rue étienne-lavoie #1604`, `3410 ch. de chambly #205`), `lang-en`
pour Laval, opportunité OZ - Acheteur nommée d'après l'annonce avec son prix, note, tâche,
accusé de réception (anglais pour Laval), alerte texto à Ashkan, inscription à la séquence
de relance « 01. Suivi des Leads Acheteurs et Vendeurs » pour une nouvelle opportunité.

Ajouter une annonce : une entrée dans `ANNONCES` (api/lead.js) et une page dont le script
envoie `page: '<clé>'`.

## Configuration Vercel
`GHL_TOKEN` (sensible, production), pare-feu « Limite formulaire annonces » (10 POST par
10 min par IP sur `/api/lead`), `ALERTE_CONTACT_ID=desactive` seulement pendant un essai.
