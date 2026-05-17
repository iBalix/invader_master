/**
 * Recupere les parametres globaux de la carte (Happy Hour window, module commande,
 * lien Google Review) via /public/carte-settings.
 *
 * Tick interne 60s pour recalculer isHappyHourNow() sans reload.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { publicApi } from '../lib/tablesApi';

export interface CarteSettingsV2 {
  id: string;
  happyHourStart: string;
  happyHourEnd: string;
  happyHourDays: string[];
  orderingEnabled: boolean;
  googleReviewUrl: string | null;
}

const DAY_INDEX_TO_SLUG = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const [h, m] = value.split(':').map((n) => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function computeHappyHourNow(settings: CarteSettingsV2 | null, now: Date): boolean {
  if (!settings) return false;
  const slug = DAY_INDEX_TO_SLUG[now.getDay()];
  if (!settings.happyHourDays.includes(slug)) return false;
  const start = parseTimeToMinutes(settings.happyHourStart);
  const end = parseTimeToMinutes(settings.happyHourEnd);
  if (start == null || end == null) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  return cur >= start && cur < end;
}

interface State {
  loading: boolean;
  settings: CarteSettingsV2 | null;
  error: string | null;
}

interface Result extends State {
  isHappyHourNow: () => boolean;
}

export function useCarteSettings(): Result {
  const [state, setState] = useState<State>({ loading: true, settings: null, error: null });
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    let cancelled = false;
    publicApi
      .get<CarteSettingsV2>('/carte-settings')
      .then((res) => {
        if (cancelled) return;
        setState({ loading: false, settings: res.data ?? null, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          loading: false,
          settings: null,
          error: err?.response?.data?.error ?? 'Impossible de charger les parametres',
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const isHappyHourNow = useCallback(() => computeHappyHourNow(state.settings, now), [state.settings, now]);

  return useMemo(
    () => ({ ...state, isHappyHourNow }),
    [state, isHappyHourNow],
  );
}
