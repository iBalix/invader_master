/**
 * Client REST du blackjack (routes /public/blackjack, X-Hostname automatique
 * via publicApi). Chaque réponse d'état passe par updateClock (horloge serveur).
 */

import { publicApi } from '../../../lib/tablesApi';
import { updateClock } from '../../../lib/clockSync';
import type {
  BjAct,
  BjLobbyItem,
  BjMeta,
  BjStateResponse,
  BjYou,
  CreateBjInput,
  JokerType,
} from './bjTypes';

export interface BjJoinResponse extends BjStateResponse {
  playerToken: string;
  sessionId: string;
}

export interface BjCreateResponse extends BjStateResponse {
  sessionId: string;
  joinCode: string;
  playerToken: string;
  you: BjYou;
}

function syncClock<T extends { state?: { serverNow?: number } }>(data: T, t0: number, t1: number): T {
  const at = data.state?.serverNow;
  if (typeof at === 'number') updateClock(at, t0, t1);
  return data;
}

export const bjApi = {
  async lobby(): Promise<BjLobbyItem[]> {
    const { data } = await publicApi.get('/blackjack/sessions');
    return (data?.items ?? []) as BjLobbyItem[];
  },

  async create(input: CreateBjInput): Promise<BjCreateResponse> {
    const t0 = Date.now();
    const { data } = await publicApi.post('/blackjack/sessions', input);
    return syncClock(data.data as BjCreateResponse, t0, Date.now());
  },

  async state(idOrCode: string, playerToken?: string | null): Promise<BjStateResponse> {
    const t0 = Date.now();
    const { data } = await publicApi.get(`/blackjack/${idOrCode}/state`, {
      params: playerToken ? { playerToken } : undefined,
    });
    return syncClock(data.data as BjStateResponse, t0, Date.now());
  },

  async join(idOrCode: string, body: { pseudo?: string; playerToken?: string }): Promise<BjJoinResponse> {
    const t0 = Date.now();
    const { data } = await publicApi.post(`/blackjack/${idOrCode}/join`, body);
    return syncClock(data.data as BjJoinResponse, t0, Date.now());
  },

  async bet(idOrCode: string, body: { playerToken: string; amount: number }): Promise<BjStateResponse> {
    const t0 = Date.now();
    const { data } = await publicApi.post(`/blackjack/${idOrCode}/bet`, body);
    return syncClock(data.data as BjStateResponse, t0, Date.now());
  },

  async act(
    idOrCode: string,
    body: { playerToken: string; action: BjAct; windowSeq: number },
  ): Promise<BjStateResponse> {
    const t0 = Date.now();
    const { data } = await publicApi.post(`/blackjack/${idOrCode}/act`, body);
    return syncClock(data.data as BjStateResponse, t0, Date.now());
  },

  async joker(
    idOrCode: string,
    body: { playerToken: string; joker: JokerType; target?: string | null },
  ): Promise<BjStateResponse> {
    const t0 = Date.now();
    const { data } = await publicApi.post(`/blackjack/${idOrCode}/joker`, body);
    return syncClock(data.data as BjStateResponse, t0, Date.now());
  },

  async action(idOrCode: string, body: { playerToken: string; action: BjMeta }): Promise<BjStateResponse> {
    const t0 = Date.now();
    const { data } = await publicApi.post(`/blackjack/${idOrCode}/action`, body);
    return syncClock(data.data as BjStateResponse, t0, Date.now());
  },
};

/** extrait la clé d'erreur i18n d'une erreur axios (fallback réseau) */
export function bjErrorKey(err: unknown): string {
  const maybe = err as { response?: { data?: { message?: string } } };
  const message = maybe.response?.data?.message;
  if (typeof message === 'string' && message.startsWith('error_')) return message;
  return 'error_network';
}
