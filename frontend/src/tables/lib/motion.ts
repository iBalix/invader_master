/**
 * Constantes Framer Motion partagees pour les pages tables tactiles.
 *
 * Framer Motion v12 a un typage strict pour `ease` : il attend un
 * `Easing` (string) ou un tuple `[number, number, number, number]`. Si on ecrit
 * `ease: [0.32, 0.72, 0, 1]` directement, TS l'infere en `number[]` et le
 * build casse (cf. Railway). On centralise donc les courbes ici, typees
 * explicitement comme tuple.
 */

export const EASE_OUT_QUART: [number, number, number, number] = [0.32, 0.72, 0, 1];
