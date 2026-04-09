# Documentation Utilisateur (FR)

## 1) Objectif de l'application

Cette application permet de:

- generer des diffs i18n entre 2 branches Git,
- normaliser ces changements en JSON standardise multi-langues,
- appliquer ces changements sur des fichiers locaux FR/NL,
- verifier l'alignement des cles entre fichiers de langue,
- preparer un tableau copiable pour Jira/Confluence.

L'application est orientee FR/NL aujourd'hui (avec colonne DE reservee dans l'export Jira).

---

## 2) Menu **Create Diff**

### A quoi sert ce menu

Comparer 2 branches (`source` -> `target`) pour 2 fichiers i18n:

- un fichier FR,
- un fichier NL,

et produire:

- un diff texte,
- un JSON standardise unique (une entree par cle),
- un tableau Jira/Confluence copiable.

### Champs obligatoires

- `Repository Path`
- `Source Branch`
- `Target Branch`
- `FR File Path (relative to repo)`
- `NL File Path (relative to repo)`

Si un champ manque, la generation est bloquee.

### Verifications faites avant generation

1. Le repository existe.
2. Les fichiers FR et NL existent sur la branche source.
3. Les fichiers FR et NL existent sur la branche target.
4. FR et NL sont alignes en cles sur source.
5. FR et NL sont alignes en cles sur target.

Si un alignement echoue, la generation s'arrete avec un message listant les cles manquantes dans chaque sens.

### Resultat attendu

- Un seul modele standardise multi-langues avec `values.fr` et `values.nl`.
- Une cle n'apparait qu'une fois dans l'array (pas de doublon FR/NL pour la meme cle).

### Export Jira / Confluence

Depuis le diff, vous pouvez:

- generer un tableau,
- le copier (format riche HTML + texte tabule TSV),
- le coller directement dans Jira.

Colonnes:

- Path
- Action (`🟢 + add`, `✏️ modified`, `➖ delete`)
- Traduction FR
- Traduction NL
- Traduction DE (vide)
- Limitations techniques eventuelles (vide)
- transversalite (vide)

### Generer un tableau depuis un JSON standardise existant

Une section dediee permet de:

- selectionner un fichier JSON standardise,
- generer le tableau Jira sans refaire une diff Git.

---

## 3) Menu **Apply Changes**

### A quoi sert ce menu

Appliquer un fichier standardise sur **2 fichiers locaux**:

- cible FR,
- cible NL.

### Champs obligatoires

- `Target FR File`
- `Target NL File`
- `Changes File` (JSON standardise)

### Verifications de chargement

- Le fichier de changements est un array JSON.
- Chaque item contient au minimum `action` et `path`.
- Si `context.screenUrl` est present, l'URL doit etre valide (`http/https`).

### Modes de revue

- **Review Remaining**: affiche seulement ce qui reste a traiter.
- **Review All**: affiche l'ensemble.

Comportement dans les 2 modes:

- `Apply`: applique la ligne courante (FR + NL), puis passe a la suivante.
- `Reject`: rejette la ligne courante, puis passe a la suivante.
- `Apply All`: applique toutes les lignes restantes.

### Ce qui est ecrit sur disque

- Les changements sont appliques directement dans les fichiers FR et NL.
- Les valeurs viennent de:
  - `values.fr.*` pour FR,
  - `values.nl.*` pour NL.

### Sauvegarde / annulation

- Une sauvegarde FR et une sauvegarde NL sont creees avant ecriture.
- `Abort and restore original` restaure les 2 fichiers depuis backup.

### Cas deja appliques

- Le statut "deja applique" est calcule sur FR **et** NL.
- Une ligne est consideree appliquee seulement si les 2 fichiers sont coherents.

---

## 4) Menu **Edit Applied**

### A quoi sert ce menu

Permet d'editer des valeurs appliquees, ligne par ligne.

### Particularites

- Le controle de compatibilite lit les valeurs FR (`values.fr`) du standardise.
- Si le patch n'est pas considere applique, l'ecran bloque l'edition pour eviter les incoherences.

---

## 5) Menu **I18n Checks**

### A quoi sert ce menu

Comparer 2 fichiers i18n locaux (FR et NL) pour detecter:

- les cles manquantes dans NL (FR -> NL),
- les cles manquantes dans FR (NL -> FR).

### Utilisation

1. Choisir le fichier FR.
2. Choisir le fichier NL.
3. Lancer `Run key checks`.

### Notes

- FR est indique comme reference metier habituelle.
- La verification reste bidirectionnelle.

---

## 6) Edge cases couverts

- Changement de type (ex: string -> objet) gere lors de l'application.
- Evite les boucles "deja applique / pas applique" grace au recalcul d'etat reel.
- Si tous les changements sont deja appliques au chargement, l'ecran affiche un etat de fin explicite.
- Le generateur de diff bloque les cas FR/NL desalignes pour eviter un standardise ambigu.

---

## 7) Checklist d'utilisation recommandee

1. Utiliser **I18n Checks** pour verifier l'alignement FR/NL.
2. Generer le diff dans **Create Diff**.
3. Verifier le JSON standardise et/ou generer le tableau Jira.
4. Appliquer via **Apply Changes** (FR + NL).
5. Si besoin, corriger finement dans **Edit Applied**.
