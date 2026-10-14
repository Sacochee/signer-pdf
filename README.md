# Signer PDF

Extension Chrome (ordinateur) pour poser sa signature enregistrée sur un PDF, puis enregistrer le document signé. Tout se passe sur ton ordinateur : ni le document ni la signature ne sont envoyés à un serveur.

## Installation

Fonctionne dans Chrome, Edge, Brave, Opera et Vivaldi sur ordinateur (pas sur mobile, ni dans Firefox pour l'instant).

1. Télécharge le fichier `signer-pdf-x.y.z.zip` de la [dernière version](https://github.com/Sacochee/signer-pdf/releases/latest).
2. Décompresse-le dans un dossier que tu garderas (par exemple `Documents\Signer PDF`). Le navigateur lit l'extension dans ce dossier : ne le supprime pas.
3. Ouvre la page des extensions : `chrome://extensions` (Chrome, Brave, Vivaldi), `edge://extensions` (Edge) ou `opera://extensions` (Opera).
4. Active le **Mode développeur**.
5. Clique sur **Charger l'extension non empaquetée** (ou « Charger l'extension décompressée ») et choisis le dossier décompressé, celui qui contient `manifest.json`.
6. Épingle l'icône bleue « Signer PDF » dans la barre d'outils (icône puzzle, puis punaise).
7. Pour les PDF ouverts depuis ton ordinateur (`file:///...`) : bouton **Détails** de l'extension, active **Autoriser l'accès aux URL de fichier**.

**Mettre à jour** : remplace le contenu du dossier par celui de la nouvelle version, puis clique sur la flèche de rechargement de l'extension. Tes signatures enregistrées sont conservées.

## Confidentialité

L'extension ne contient aucun serveur, aucune statistique, aucun traceur. Les documents sont lus et modifiés dans le navigateur ; les signatures et mentions enregistrées restent dans le stockage local de l'extension, sur ton ordinateur. La permission d'accès aux sites sert uniquement à relire le PDF ouvert dans l'onglet (y compris quand il faut être connecté au site pour le voir).

## Utilisation

1. **Ajoute ta signature une fois** : clique sur l'icône, puis **+ Ajouter une signature**. PNG, JPG, WebP ou SVG. Pour un scan ou une photo sur papier blanc, laisse cochée l'option « Retirer le fond » : le papier (même gris ou mal éclairé), les points ou carreaux du carnet et les ombres sont effacés, puis l'image est recadrée sur la signature.
2. **Ouvre un PDF dans Chrome** (lien, pièce jointe ouverte dans un onglet, fichier local). L'icône affiche le badge `PDF`.
3. **Clique sur l'icône** : le PDF s'ouvre dans l'éditeur, dans un nouvel onglet.
4. **Pose la signature** : clique sur la miniature (elle se place sur la page affichée), ou double-clique à l'endroit voulu sur le document.
5. **Ajuste** : fais glisser pour déplacer, tire le rond bleu dans le coin pour agrandir. Touche Suppr ou ✕ pour retirer. Le bouton ⧉ copie la signature à la même place sur toutes les pages (pratique pour parapher).
6. **Enregistre** avec **Enregistrer le PDF signé** (ou Ctrl + S). Chrome demande où sauvegarder `nom - signé.pdf`.

### Mentions manuscrites

Dans la section **Mentions** de la colonne de gauche :

- clique sur une mention toute prête (« Lu et approuvé », « Bon pour accord », « Le 14/10/2026 »…) : elle se pose sur la page affichée, sous ce qui s'y trouve déjà ;
- « Fait à …, le … » ouvre une fenêtre pour compléter la ville. Coche **Ajouter à mes mentions** pour la retrouver la prochaine fois, avec la date toujours mise à jour ;
- **+ Écrire une mention** pour un texte libre (Maj + Entrée pour aller à la ligne). `{date}` est remplacé par la date du jour ;
- choisis l'écriture (**Stylo** ou **Cursive**) et la couleur (bleu ou noir). Si une mention est sélectionnée sur le document, elle change aussi ;
- double-clic sur une mention posée (ou bouton ✎) pour corriger le texte.

Les mentions se déplacent et s'agrandissent comme la signature. Elles sont écrites dans le PDF avec la police manuscrite embarquée, le rendu est donc identique sur tous les ordinateurs.

Autres façons d'ouvrir un document :
- clic droit sur un lien vers un PDF, puis **Signer ce PDF** ;
- glisser un PDF (ou une image PNG/JPG, convertie en PDF) dans l'éditeur ;
- clic droit sur l'icône, puis **Ouvrir l'outil de signature**.

### Pièces jointes Gmail

L'aperçu intégré de Gmail n'est pas un vrai fichier PDF, l'extension ne peut pas le lire. Le plus simple : télécharger la pièce jointe et la glisser dans l'éditeur (ou l'ouvrir depuis la barre de téléchargements de Chrome, puis cliquer sur l'icône).

## Limites connues

- Les PDF protégés par leur auteur (chiffrés ou avec mot de passe) ne peuvent pas être modifiés : un message l'indique dès l'ouverture.
- Si le PDF porte déjà une signature électronique certifiée, un avertissement s'affiche : l'enregistrer modifié la rend invalide.
- La signature est ajoutée comme une image. Ce n'est pas une signature électronique certifiée (eIDAS / certificat).
- Chrome sur Android et iPhone n'accepte pas les extensions.

## Développement

```bash
npm install          # pdf.js et pdf-lib
npm run vendor       # copie les bibliothèques dans extension/vendor (obligatoire en Manifest V3)
npm test             # tests unitaires (positionnement, pages tournées, traitement d'image)
npm run samples      # crée dev/sample.pdf et dev/signature.svg
npm run dev          # http://localhost:8123/extension/editor/editor.html?src=/dev/sample.pdf
npm run zip          # dist/signer-pdf-<version>.zip, à joindre à une release GitHub
```

En mode `npm run dev`, l'éditeur tourne comme une page web normale (stockage dans `localStorage`, téléchargement classique), ce qui permet de le tester sans recharger l'extension.

Structure :

| Fichier | Rôle |
| --- | --- |
| `extension/background.js` | Détecte les onglets PDF, ouvre l'éditeur, menu contextuel |
| `extension/editor/editor.js` | État de l'éditeur et branchement de l'interface |
| `extension/editor/pdf-view.js` | Affichage des pages (pdf.js), rendu à la demande |
| `extension/editor/placements.js` | Signatures posées : déplacement, redimensionnement |
| `extension/editor/geometry.js` | Conversion écran vers coordonnées PDF (pages tournées comprises) |
| `extension/editor/signatures.js` | Import, nettoyage et stockage des signatures |
| `extension/editor/image-math.js` | Fond transparent, recadrage |
| `extension/editor/loader.js` | Lecture du PDF depuis l'onglet ou un fichier |
| `extension/editor/export.js` | Écriture du PDF signé (pdf-lib) |
| `extension/editor/mentions.js` | Mentions : panneau, fenêtre de saisie, rendu à l'écran |
| `extension/editor/fonts.js` | Polices manuscrites (écran et PDF), chargement de fontkit |
| `extension/editor/text-layout.js` | Mise en page du texte (lignes, date, position dans le PDF) |
| `extension/editor/platform.js` | Accès aux API Chrome, avec repli pour le mode web |

## Polices

- Kalam (écriture « Stylo ») : SIL Open Font License, voir `extension/fonts/Kalam-OFL.txt`.
- Homemade Apple (écriture « Cursive ») : Apache License 2.0, voir `extension/fonts/HomemadeApple-LICENSE.txt`.

Elles sont embarquées entières dans le PDF : le « sous-ensemble » de pdf-lib perd des lettres de Kalam.
