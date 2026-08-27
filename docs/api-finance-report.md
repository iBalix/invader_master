# API — Report financier journalier

Endpoint en lecture seule qui expose le chiffre d'affaires quotidien du bar.
Conçu pour être donné tel quel à une IA chargée de produire des rapports
financiers : elle n'a besoin que de l'URL et de ce document.

- **Prod** : `https://invadermaster-backend-production.up.railway.app/public/finance-report`
- **Local** : `http://localhost:3001/public/finance-report`
- **Authentification** : aucune, l'endpoint est ouvert.
- **Code** : [`backend/src/routes/financeReport.ts`](../backend/src/routes/financeReport.ts)

## Paramètres

| param  | format       | requis | défaut          | notes                     |
|--------|--------------|--------|-----------------|---------------------------|
| `from` | `YYYY-MM-DD` | non    | `to` - 29 jours | premier jour, **inclus**  |
| `to`   | `YYYY-MM-DD` | non    | aujourd'hui     | dernier jour, **inclus**  |

Plage maximale : 1500 jours. Les données commencent au **23/02/2024**.
Montants en **EUR**, dates en **Europe/Paris**.

```bash
curl "https://invadermaster-backend-production.up.railway.app/public/finance-report?from=2026-08-01&to=2026-08-16"
```

`GET /public/finance-report/schema` renvoie ce contrat en JSON (description de
chaque champ), sans toucher la base.

## Réponse

```json
{
  "status": "success",
  "meta": {
    "from": "2026-08-09", "to": "2026-08-16", "days": 8,
    "currency": "EUR", "timezone": "Europe/Paris",
    "sources": {
      "popina": "MySQL invader.sales (import Popina), lignes produit uniquement",
      "caisse": "MySQL invader.Cash (page Comptabilite), montants positifs uniquement"
    }
  },
  "summary": {
    "ca_total": 3890.47,
    "popina_ttc": 3751.47,
    "popina_ht": 3316.52,
    "popina_tva": 434.95,
    "popina_brut": 3860.1,
    "popina_remises": 108.63,
    "caisse_ajouts": 139,
    "days_with_data": 8,
    "ca_moyen_jour_ouvre": 486.31
  },
  "items": [
    {
      "date": "2026-08-11",
      "ca_total": 1009.8,
      "popina_ttc": 954.8,
      "popina_ht": 853.28,
      "popina_tva": 101.52,
      "popina_brut": 956.5,
      "popina_remises": 1.7,
      "popina_lignes": 84,
      "caisse_ajouts": 55,
      "caisse_mouvements": 1,
      "has_data": true
    }
  ]
}
```

En erreur : `{ "status": "error", "message": "..." }` avec un `400` (paramètres
invalides, `from` postérieur à `to`, plage trop large) ou un `500`.

### Champs

| champ | signification |
|---|---|
| `ca_total` | **`popina_ttc` + `caisse_ajouts`**. C'est le CA du jour. |
| `popina_ttc` | CA encaissé en caisse Popina, TTC, remises déduites. |
| `popina_ht` / `popina_tva` | Ventilation HT / TVA collectée du CA Popina. |
| `popina_brut` / `popina_remises` | CA avant remises, et montant des remises. |
| `popina_lignes` | Nombre de lignes produit vendues (**pas** des tickets). |
| `caisse_ajouts` | Entrées d'espèces saisies sur la page Comptabilité. |
| `caisse_mouvements` | Nombre de saisies d'espèces ce jour-là. |
| `has_data` | `false` si aucune vente ni mouvement : bar fermé ou import manquant. Permet de distinguer un vrai zéro d'une absence de donnée. |

**Tous les jours de la plage sont retournés**, y compris ceux à zéro. Pour une
moyenne journalière pertinente, filtrer sur `has_data = true` (ou utiliser
`summary.ca_moyen_jour_ouvre`, déjà calculé ainsi).

## Règles de calcul, à connaître avant d'interpréter les chiffres

Trois points non évidents, tous vérifiés en base :

1. **Lignes de récapitulatif exclues.** Jusqu'au 31/12/2025, la table `sales`
   contient, en plus des lignes produit, des lignes de récap de ticket
   (catégories `Total`, `Paiement`, `Pourboire`, `Rendu`, avec `parent` vide).
   La ligne `Total` porte le montant du ticket entier : la compter reviendrait à
   **doubler le CA** sur toute la période antérieure à 2026. L'endpoint ne
   retient que les lignes produit (`parent <> ''`).

2. **Seuls les ajouts de caisse comptent.** `Cash.montant` est signé : les
   retraits d'espèces (valeurs négatives) sont ignorés, seules les entrées
   alimentent `caisse_ajouts`.

3. **Aucun nombre de tickets n'est exposé.** L'identifiant de ticket est corrompu
   sur les imports antérieurs à 2026 (valeur constante au lieu d'un identifiant),
   un comptage serait faux. Utiliser `popina_lignes` en gardant en tête que ce
   sont des lignes, pas des additions.

Enfin, une journée court de 00h00 à 23h59 : les ventes passées après minuit sont
rattachées au jour calendaire suivant, pas à la soirée qui les a générées.

## Source des données

Tout vient du **MySQL legacy OVH** (base `invader`), la même base que la page
Comptabilité du back-office, via `getMysqlPool()`
([`backend/src/config/mysql.ts`](../backend/src/config/mysql.ts)).

Le miroir Supabase alimenté par l'import finance est **très en retard** (environ
7 000 lignes `sales` contre 127 000 côté MySQL, arrêt en avril 2026) et la table
`Cash` n'y existe pas : MySQL est la seule source fiable ici.
