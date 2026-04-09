# Documentation Technique (FR)

## 1) Perimetre technique

Application Wails (Go backend + React/TypeScript frontend) pour workflow i18n FR/NL:

- generation diff Git,
- normalisation en modele standardise multi-langues,
- application locale des changements,
- verification d'alignement des cles,
- export tableau Jira/Confluence.

---

## 2) Modele standardise actuel

Format cible d'une entree:

```json
{
  "action": "add|change|delete",
  "path": "KEY.HELLO.TITLE",
  "segments": ["KEY", "HELLO", "TITLE"],
  "key": "TITLE",
  "values": {
    "fr": { "oldValue": "...", "newValue": "..." },
    "nl": { "oldValue": "...", "newValue": "..." }
  },
  "context": {
    "description": "...",
    "screenUrl": "https://...",
    "componentName": "..."
  }
}
```

Points importants:

- `oldValue/newValue` top-level ont ete supprimes du modele standardise.
- `source` a ete supprime du modele (non utilise).
- `values` est la source de verite par langue.

---

## 3) Backend Go - logique principale

### 3.1 Generation multi-langue

Fonction cle: `GenerateI18nDiff(repoPath, sourceBranch, targetBranch, frFilePath, nlFilePath)`.

Pipeline:

1. Validation des entrees (champs non vides, repo existant).
2. Lecture JSON FR/NL depuis Git sur source et target (`git show`).
3. Verification alignement des cles FR/NL sur source.
4. Verification alignement des cles FR/NL sur target.
5. Calcul des changements par comparaison source->target (mode key-centric).
6. Construction du tableau standardise unique avec `values.fr` et `values.nl`.

### 3.2 Alignement des cles

Helpers:

- collecte des chemins feuille (`A.B.C`) pour FR/NL,
- calcul des manquants dans chaque sens,
- erreur descriptive si desalignement (avec liste tronquee au-dela d'un seuil).

### 3.3 Construction des changements

Approche key-centric pour eviter les doublons:

- union des cles depuis snapshots source/target,
- determination action par presence avant/apres,
- pour `change`, comparaison des valeurs FR/NL,
- creation d'une seule entree par cle avec `values.fr` + `values.nl`.

### 3.4 Application locale

`ApplyChangeToJson(filePath, change, override)`:

- lit le JSON local,
- parse les valeurs (string, number, bool, object, array),
- applique add/modify/delete sur chemin imbrique,
- reecrit le fichier formate.

`CheckAlreadyApplied(filePath, changes)`:

- compare l'etat courant au `newValue` attendu (deep equal),
- pour delete: considere "fait" si la cle n'existe plus ou si l'ancienne valeur n'est plus presente.

---

## 4) Frontend - ecrans et comportements

### 4.1 `CreateDiff.tsx`

- Champs obligatoires: repo, source, target, fr path, nl path.
- Appel backend: `GenerateI18nDiff`.
- Stocke:
  - `diffResult.diff`
  - `diffResult.changes` (modele standardise)
- Export Jira:
  - lit FR/NL depuis `values.fr/new` et `values.nl/new` (ou old pour delete),
  - copie clipboard en `text/html` + `text/plain` (TSV fallback).

### 4.2 `ApplyChanges.tsx`

- Inputs obligatoires: cible FR, cible NL, standardise JSON.
- Conversion en "legacy diff" par langue depuis `values.fr`/`values.nl`.
- Statut deja applique calcule sur FR et NL (AND logique).
- `Apply` / `Apply All` ecrivent dans les 2 fichiers.
- Backups FR/NL geres separement.
- `Abort` restaure FR et NL.

### 4.3 `EditAppliedChanges.tsx`

- Compatibilite patch basee sur `values.fr`.
- Controle que patch considere applique avant edition.

### 4.4 `I18nChecks.tsx`

- Compare 2 JSON locaux FR/NL,
- affiche manquants dans chaque sens.

---

## 5) Verifications metier couvrees

1. **Alignement FR/NL obligatoire** avant generation diff.
2. **Double cible obligatoire** (FR+NL) pour appliquer.
3. **Validation schema standardise** (`action`, `path`, JSON array, URLs contextuelles).
4. **Controle etat reel** apres application pour eviter boucles UI.
5. **Rollback** via backups pour revenir a l'etat initial.

---

## 6) Edge cases techniques

- Changement de type de valeur (`"x"` -> `{...}`) correctement applique.
- Difference de detection add/delete entre langues evitee par generation key-centric.
- Cas "tout deja applique": l'UI n'est pas vide, etat de fin explicite.
- Clipboard bloque: fallback copie manuelle via textarea.

---

## 7) Contrats implicites / hypotheses

- Les fichiers i18n sont des objets JSON imbriques par cles (pas de schema arbitraire).
- Les chemins de cle utilisent la notation point (`A.B.C`).
- FR est souvent reference metier, mais les validations d'alignement sont bidirectionnelles.

---

## 8) Commandes de verification

Backend:

```bash
go build ./...
```

Frontend:

```bash
cd frontend
npm run build
```

---

## 9) Axes d'amelioration (proposes)

- Validation stricte du standardise (obliger presence `values.fr` et `values.nl`).
- Export des manquants de `I18nChecks` en JSON/CSV.
- Edition simultanee FR+NL dans `EditApplied`.
- Ajout de tests d'integration sur pipeline complet (generate -> apply -> verify).
