/**
 * Client REST du jeu d'échecs (routes /public/chess, X-Hostname automatique
 * via publicApi). Chaque réponse d'état passe par updateClock (horloge serveur).
 */

import { publicApi } from '../../../lib/tablesApi';
import { updateClock } from '../../../lib/clockSync';
import type {
  ChessLobbyItem,
  ChessStateResponse,
  ChessYou,
  CreateChessGameInput,
  PromotionPiece,
} from './chessTypes';

export interface ChessJoinResponse extends ChessStateResponse {
  playerToken: string;
  sessionId: string;
}

export interface ChessCreateResponse extends ChessStateResponse {
  sessionId: string;
  joinCode: string;
  playerToken: string;
  you: ChessYou;
}

function syncClock<T extends { state?: { serverNow?: number } }>(data: T, t0: number, t1: number): T {
  const at = data.state?.serverNow;
  if (typeof at === 'number') updateClock(at, t0, t1);
  return data;
}

export const chessApi = {
  async lobby(): Promise<ChessLobbyItem[]> {
    const { data } = await publicApi.get('/chess/sessions');
    return (data?.items ?? []) as ChessLobbyItem[];
  },

  async create(input: CreateChessGameInput): Promise<ChessCreateResponse> {
    const t0 = Date.now();
    const { data } = await publicApi.post('/chess/sessions', input);
    return syncClock(data.data as ChessCreateResponse, t0, Date.now());
  },

  async state(idOrCode: string, playerToken?: string | null): Promise<ChessStateResponse> {
    const t0 = Date.now();
    const { data } = await publicApi.get(`/chess/${idOrCode}/state`, {
      params: playerToken ? { playerToken } : undefined,
    });
    return syncClock(data.data as ChessStateResponse, t0, Date.now());
  },

  async join(
    idOrCode: string,
    body: { pseudo?: string; playerToken?: string },
  ): Promise<ChessJoinResponse> {
    const t0 = Date.now();
    const { data } = await publicApi.post(`/chess/${idOrCode}/join`, body);
    return syncClock(data.data as ChessJoinResponse, t0, Date.now());
  },

  async move(
    idOrCode: string,
    body: { playerToken: string; ply: number; from: string; to: string; promotion?: PromotionPiece },
  ): Promise<ChessStateResponse> {
    const t0 = Date.now();
    const { data } = await publicApi.post(`/chess/${idOrCode}/move`, body);
    return syncClock(data.data as ChessStateResponse, t0, Date.now());
  },

  async action(
    idOrCode: string,
    body: { playerToken: string; action: string },
  ): Promise<ChessStateResponse> {
    const t0 = Date.now();
    const { data } = await publicApi.post(`/chess/${idOrCode}/action`, body);
    return syncClock(data.data as ChessStateResponse, t0, Date.now());
  },
};

/** extrait la clé d'erreur i18n d'une erreur axios (fallback réseau) */
export function chessErrorKey(err: unknown): string {
  const maybe = err as { response?: { data?: { message?: string } } };
  const message = maybe.response?.data?.message;
  if (typeof message === 'string' && message.startsWith('error_')) return message;
  return 'error_network';
}
