# RemplacerPolices.jsx

**FR** — Remplacement en masse des polices dans Adobe Illustrator (tous les `TextFrame` de la portée), avec dialogue ScriptUI bilingue FR/EN. Utile pour les flux FR / AR / EN.

**EN** — Bulk font replacement in Adobe Illustrator (all `TextFrame`s in scope), with a bilingual FR/EN ScriptUI dialog. Useful for FR / AR / EN workflows.

## Fonctionnalités

- Liste les **polices réellement utilisées** dans la portée (document, calque actif, ou sélection)
- Choix **police source** (liste déroulante des polices trouvées) et **police cible** (famille + style via `app.textFonts`, ou nom interne / PostScript)
- Bouton **Analyser** : compte TextFrames / plages (runs) / caractères concernés **sans modifier** le document
- Bouton **Appliquer** : remplace en **une seule passe** (souvent annulable d’un seul Ctrl+Z / Cmd+Z)
- Option : mettre à jour aussi les **styles de caractère / paragraphe** qui référencent la police source (les styles système protégés peuvent être ignorés)
- Ignore les textes verrouillés et les calques masqués ou verrouillés
- Messages clairs si aucun document ou aucun TextFrame
- Aucun appel réseau, aucune collecte de données
- Code 100 % original, compatible ExtendScript ES3

## Installation

1. **Fichier > Scripts > Autre script…** puis choisir `RemplacerPolices.jsx`
2. Ou copier le fichier dans le dossier Presets/Scripts d’Illustrator, puis relancer Illustrator (le script apparaît dans **Fichier > Scripts**)

## Usage

1. Ouvrir un document Illustrator (**travaillez sur une copie**)
2. Lancer le script
3. Choisir la portée, actualiser la liste des polices utilisées si besoin
4. Sélectionner la police source et la police cible (famille + style, ou nom)
5. **Analyser** pour vérifier les comptes, puis **Appliquer**

## Compatibilité

- Cible : Adobe Illustrator **CC 2018–2026**
- Statut : **non testé dans Illustrator** (syntaxe ES3 vérifiée avec acorn)

## Limites connues

- Les styles système protégés peuvent refuser l’écriture de `textFont`
- Sur de très longs textes, le parcours caractère par caractère peut être lent
- L’annulation groupée dépend d’Illustrator (pas de `beginUndoGroup` fiable partout) ; en pratique un Ctrl+Z annule souvent tout le script

## Licence

MIT — Copyright (c) 2026 Amirouche Amwanes
