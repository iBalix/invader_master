/**
 * Client REST de Bar Invaders (routes /public/barinvaders, X-Hostname
 * automatique via publicApi). Chaque réponse d'état passe par updateClock :
 * l'horloge serveur est ce qui fait partir toutes les dalles au même instant.
 */

import { publicApi } from '../../../lib/tablesApi';
import { updateClock } from '../../../lib/clockSync';
import type {
  BarRecordItem,
  CreateInvInput,
  InvAction,
  InvCreateResponse,
  InvGameOverInput,
  InvGameOverResponse,
  InvJoinResponse,
  InvLobbyItem,
  InvStateResponse,
} from './invTypes';

function syncClock<T extends { state?: { serverNow?: number } }>(data: T, t0: number, t1: number): T {
  const at = data.state?.serverNow;
  if (typeof at === 'number') updateClock(at, t0, t1);
  return data;
}

export const invApi = {
  async lobby(): Promise<InvLobbyItem[]> {
    const { data } = await publicApi.get('/barinvaders/sessions');
    return (data?.items ?? []) as InvLobbyItem[];
  },

  async create(input: CreateInvInput): Promise<InvCreateResponse> {
    const t0 = Date.now();
    const { data } = await publicApi.post('/barinvaders/sessions', input);
    return syncClock(data.data as InvCreateResponse, t0, Date.now());
  },

  async state(idOrCode: string, playerToken?: string | null): Promise<InvStateResponse> {
    const t0 = Date.now();
    const { data } = await publicApi.get(`/barinvaders/${idOrCode}/state`, {
      params: playerToken ? { playerToken } : undefined,
    });
    return syncClock(data.data as InvStateResponse, t0, Date.now());
  },

  async join(idOrCode: string, body: { pseudo?: string; playerToken?: string }): Promise<InvJoinResponse> {
    const t0 = Date.now();
    const { data } = await publicApi.post(`/barinvaders/${idOrCode}/join`, body);
    return syncClock(data.data as InvJoinResponse, t0, Date.now());
  },

  async action(idOrCode: string, body: { playerToken: string; action: InvAction }): Promise<InvStateResponse> {
    const t0 = Date.now();
    const { data } = await publicApi.post(`/barinvaders/${idOrCode}/action`, body);
    return syncClock(data.data as InvStateResponse, t0, Date.now());
  },

  async gameOver(idOrCode: string, body: { playerToken: string } & InvGameOverInput): Promise<InvGameOverResponse> {
    const t0 = Date.now();
    const { data } = await publicApi.post(`/barinvaders/${idOrCode}/gameover`, body);
    return syncClock(data.data as InvGameOverResponse, t0, Date.now());
  },

  async records(limit = 10): Promise<BarRecordItem[]> {
    const { data } = await publicApi.get('/barinvaders/records', { params: { limit } });
    return (data?.items ?? []) as BarRecordItem[];
  },
};

/** extrait la clé d'erreur i18n d'une erreur axios (fallback réseau) */
export function invErrorKey(err: unknown): string {
  const maybe = err as { response?: { data?: { message?: string } } };
  const message = maybe.response?.data?.message;
  if (typeof message === 'string' && message.startsWith('error_')) return message;
  return 'error_network';
}
