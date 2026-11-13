/**
 * Couleurs des graphiques de la section Stats.
 *
 * Palette categorielle validee par le script de controle du guide dataviz
 * (bande de luminosite, chroma, separation daltonisme entre voisins, contraste)
 * sur fond blanc. L'ordre fait partie de la validation : ne pas le changer ni
 * inserer une teinte sans relancer le controle.
 *   node validate_palette.js "#4f46e5,#eb6834,#1baf7a,#eda100,#e87ba4,#008300,#0891b2,#e34948" --mode light --surface "#ffffff"
 *
 * Le premier emplacement est l'indigo du back-office (primary-600).
 */

export const SERIES_COLORS = [
  '#4f46e5', // indigo
  '#eb6834', // orange
  '#1baf7a', // vert d'eau
  '#eda100', // jaune
  '#e87ba4', // rose
  '#008300', // vert
  '#0891b2', // cyan
  '#e34948', // rouge
] as const;

/** Tout ce qui ne tient pas dans les emplacements : jamais une teinte de plus. */
export const OTHER_COLOR = '#9ca3af';
export const OTHER_LABEL = 'Autres';

/** Serie unique : la couleur d'accent du back-office. */
export const ACCENT = '#4f46e5';
/** Serie de contexte, a cote de l'accent. */
export const ACCENT_SOFT = '#a5b4fc';

/** Statut : uniquement quand la couleur veut dire bon / mauvais. */
export const GOOD = '#059669';
export const BAD = '#dc2626';

/** Une seule teinte, clair vers fonce, pour les intensites (carte de chaleur). */
export const SEQUENTIAL = ['#e0e7ff', '#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3'];

/** Rampe ordinale (annees) : du plus ancien, clair, au plus recent, fonce. */
export const ORDINAL = ['#a5b4fc', '#6366f1', '#3730a3'];

export const INK = {
  primary: '#111827',
  secondary: '#4b5563',
  muted: '#9ca3af',
  grid: '#eef0f3',
  axis: '#d1d5db',
  surface: '#ffffff',
};

/** Nombre d'entites qui recoivent une couleur propre ; le reste part dans "Autres". */
export const MAX_COLORED = 7;

/**
 * Attribue une couleur a chaque entite selon un ordre de reference stable
 * (classement sur tout l'historique, fourni par /api/stats/meta) et non selon
 * le classement de la periode affichee : un filtre ne doit jamais repeindre
 * les series qui restent.
 */
export function buildColorMap(orderedKeys: string[]): (key: string) => string {
  const map = new Map<string, string>();
  orderedKeys.slice(0, MAX_COLORED).forEach((key, index) => map.set(key, SERIES_COLORS[index]));
  return (key: string) => map.get(key) ?? OTHER_COLOR;
}

/** Vrai si l'entite a un emplacement de couleur propre. */
export function isColored(orderedKeys: string[], key: string): boolean {
  const index = orderedKeys.indexOf(key);
  return index >= 0 && index < MAX_COLORED;
}
