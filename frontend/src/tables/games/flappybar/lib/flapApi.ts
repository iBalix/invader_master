/**
 * Client REST de Flappy Bar (routes /public/flappybar, X-Hostname automatique
 * via publicApi). Chaque réponse d'état passe par updateClock : l'horloge
 * serveur est ce qui fait partir toutes les dalles au même instant.
 */

import { publicApi } from '../../../lib/tablesApi';
import { updateClock } from '../../../lib/clockSync';
import type {
  BarRecordItem,
  CreateFlapInput,
  FlapAction,
  FlapCreateResponse,
  FlapDeathInput,
  FlapDeathResponse,
  FlapJoinResponse,
  FlapLobbyItem,
  FlapStateResponse,
} from './flapTypes';

function syncClock<T extends { state?: { serverNow?: number } }>(data: T, t0: number, t1: number): T {
  const at = data.state?.serverNow;
  if (typeof at === 'number') updateClock(at, t0, t1);
  return data;
}

export const flapApi = {
  async lobby(): Promise<FlapLobbyItem[]> {
    const { data } = await publicApi.get('/flappybar/sessions');
    return (data?.items ?? []) as FlapLobbyItem[];
  },

  async create(input: CreateFlapInput): Promise<FlapCreateResponse> {
    const t0 = Date.now();
    const { data } = await publicApi.post('/flappybar/sessions', input);
    return syncClock(data.data as FlapCreateResponse, t0, Date.now());
  },

  async state(idOrCode: string, playerToken?: string | null): Promise<FlapStateResponse> {
    const t0 = Date.now();
    const { data } = await publicApi.get(`/flappybar/${idOrCode}/state`, {
      params: playerToken ? { playerToken } : undefined,
    });
    return syncClock(data.data as FlapStateResponse, t0, Date.now());
  },

  async join(idOrCode: string, body: { pseudo?: string; playerToken?: string }): Promise<FlapJoinResponse> {
    const t0 = Date.now();
    const { data } = await publicApi.post(`/flappybar/${idOrCode}/join`, body);
    return syncClock(data.data as FlapJoinResponse, t0, Date.now());
  },

  async action(idOrCode: string, body: { playerToken: string; action: FlapAction }): Promise<FlapStateResponse> {
    const t0 = Date.now();
    const { data } = await publicApi.post(`/flappybar/${idOrCode}/action`, body);
    return syncClock(data.data as FlapStateResponse, t0, Date.now());
  },

  async death(idOrCode: string, body: { playerToken: string } & FlapDeathInput): Promise<FlapDeathResponse> {
    const t0 = Date.now();
    const { data } = await publicApi.post(`/flappybar/${idOrCode}/round/death`, body);
    return syncClock(data.data as FlapDeathResponse, t0, Date.now());
  },

  async records(limit = 10): Promise<BarRecordItem[]> {
    const { data } = await publicApi.get('/flappybar/records', { params: { limit } });
    return (data?.items ?? []) as BarRecordItem[];
  },
};

/** extrait la clé d'erreur i18n d'une erreur axios (fallback réseau) */
export function flapErrorKey(err: unknown): string {
  const maybe = err as { response?: { data?: { message?: string } } };
  const message = maybe.response?.data?.message;
  if (typeof message === 'string' && message.startsWith('error_')) return message;
  return 'error_network';
}
