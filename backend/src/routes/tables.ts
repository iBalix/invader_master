/**
 * Public routes for the tables tactiles V2 interface.
 * Mounted on /public/tables - no auth, identification via X-Hostname header.
 */

import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { requireOrderingEnabled } from '../middleware/requireOrderingEnabled.js';
import { resolveEffectiveDesign } from '../lib/designResolver.js';
import {
  ackOrder,
  createOrder,
  endOrder,
  getDisplayOrderFor,
  getLiveOrderFor,
  reportFocus,
  toPublicOrder,
} from '../services/tableLaunch.js';

export const tablesRoutes = Router();

function toCamelDesign(row: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
  }
  return out;
}

const HOSTNAME_RE = /^TABLE\d{2}-[12]$/;

function parseHostname(raw: string | undefined | null): { hostname: string; tableNumber: string; role: 'master' | 'slave' } | null {
  if (!raw) return null;
  const hostname = raw.trim().toUpperCase();
  if (!HOSTNAME_RE.test(hostname)) return null;
  const [tableNumber, suffix] = hostname.split('-');
  return { hostname, tableNumber, role: suffix === '1' ? 'master' : 'slave' };
}

function getHostnameFromReq(req: any): { hostname: string; tableNumber: string; role: 'master' | 'slave' } | null {
  const param = (req.params?.hostname as string) ?? '';
  const header = (req.headers['x-hostname'] as string) ?? '';
  return parseHostname(param || header);
}

async function upsertDevice(parsed: { hostname: string; tableNumber: string; role: 'master' | 'slave' }) {
  const now = new Date().toISOString();
  const { data: existing } = await supabaseAdmin
    .from('table_devices')
    .select('id')
    .eq('hostname', parsed.hostname)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from('table_devices')
      .update({ last_seen_at: now })
      .eq('id', existing.id);
  } else {
    await supabaseAdmin.from('table_devices').insert({
      hostname: parsed.hostname,
      table_number: parsed.tableNumber,
      role: parsed.role,
      display_name: `${parsed.tableNumber} ${parsed.role === 'master' ? 'principal' : 'secondaire'}`,
      last_seen_at: now,
    });
  }
}

// ------------------------------------------------------------
// POST /public/tables/heartbeat
// Body: { hostname } (or X-Hostname header)
// ------------------------------------------------------------
tablesRoutes.post('/heartbeat', async (req, res) => {
  const parsed = parseHostname(req.body?.hostname ?? req.headers['x-hostname']);
  if (!parsed) {
    res.status(400).json({ status: 'error', message: 'hostname invalide (attendu TABLEXX-1 ou TABLEXX-2)' });
    return;
  }
  try {
    await upsertDevice(parsed);
    const { data: device } = await supabaseAdmin
      .from('table_devices')
      .select('*')
      .eq('hostname', parsed.hostname)
      .single();
    res.json({ status: 'success', device });
  } catch (err) {
    console.error('[tables/heartbeat] error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// ------------------------------------------------------------
// GET /public/tables/settings
// Reglages globaux (singleton) — declaree AVANT les routes :hostname pour
// ne pas etre captee par le param.
// ------------------------------------------------------------
tablesRoutes.get('/settings', async (_req, res) => {
  try {
    const { data } = await supabaseAdmin.from('tables_settings').select('*').limit(1).maybeSingle();
    res.json({ status: 'success', settings: data ?? null });
  } catch (err) {
    console.error('[tables/settings] error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// ------------------------------------------------------------
// GET /public/tables/design — design effectif de CETTE borne
//
// Le hostname etait deja envoye par l'intercepteur X-Hostname mais ignore ici,
// d'ou un fond identique sur toutes les bornes du bar. On le lit desormais :
// en mode « un design par table », la table N recoit le Nieme design.
//
// `designs` renvoie le groupe eligible au meme instant : c'est la liste dans
// laquelle la pastille de l'accueil fait tourner le fond localement.
// ------------------------------------------------------------
tablesRoutes.get('/design', async (req, res) => {
  try {
    const parsed = getHostnameFromReq(req);
    const { design, group } = await resolveEffectiveDesign(parsed?.tableNumber);
    res.json({
      status: 'success',
      design: toCamelDesign(design as Record<string, unknown> | null),
      designs: group.map((d) => toCamelDesign(d as unknown as Record<string, unknown>)),
    });
  } catch (err) {
    console.error('[tables/design] error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// ------------------------------------------------------------
// GET /public/tables/:hostname/state
// Etat global pour le boot d'une table : config + live event + featured + next event
// ------------------------------------------------------------
tablesRoutes.get('/:hostname/state', async (req, res) => {
  const parsed = getHostnameFromReq(req);
  if (!parsed) {
    res.status(400).json({ status: 'error', message: 'hostname invalide' });
    return;
  }
  try {
    await upsertDevice(parsed);

    const [deviceQ, liveQ, featuredQ, nextEventQ, settingsQ] = await Promise.all([
      supabaseAdmin.from('table_devices').select('*').eq('hostname', parsed.hostname).single(),
      supabaseAdmin.from('live_event_state').select('*').eq('id', 1).maybeSingle(),
      supabaseAdmin
        .from('table_featured')
        .select('*')
        .eq('active', true)
        .order('position', { ascending: true }),
      supabaseAdmin
        .from('events')
        .select('*')
        .eq('active', true)
        .gte('date', new Date().toISOString())
        .order('date', { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin.from('tables_settings').select('*').limit(1).maybeSingle(),
    ]);

    const featured = featuredQ.data ?? [];

    res.json({
      status: 'success',
      device: deviceQ.data ?? null,
      liveEvent: liveQ.data ?? { is_live: false },
      screensaverFeatured: featured.filter((f) => f.show_on_screensaver),
      homeFeatured: featured.filter((f) => f.show_on_home),
      nextEvent: nextEventQ.data ?? null,
      settings: settingsQ.data ?? null,
    });
  } catch (err) {
    console.error('[tables/state] error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// ------------------------------------------------------------
// GET /public/tables/:hostname/screensaver
// ------------------------------------------------------------
tablesRoutes.get('/:hostname/screensaver', async (req, res) => {
  const parsed = getHostnameFromReq(req);
  if (!parsed) {
    res.status(400).json({ status: 'error', message: 'hostname invalide' });
    return;
  }
  try {
    const { data, error } = await supabaseAdmin
      .from('table_featured')
      .select('*')
      .eq('active', true)
      .eq('show_on_screensaver', true)
      .order('position', { ascending: true });
    if (error) throw error;
    res.json({ status: 'success', items: data ?? [] });
  } catch (err) {
    console.error('[tables/screensaver] error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// ------------------------------------------------------------
// GET /public/tables/:hostname/home
// Featured accueil + bloc events (priorite : live > a venir > rien)
// ------------------------------------------------------------
tablesRoutes.get('/:hostname/home', async (req, res) => {
  const parsed = getHostnameFromReq(req);
  if (!parsed) {
    res.status(400).json({ status: 'error', message: 'hostname invalide' });
    return;
  }
  try {
    const [featuredQ, liveQ, nextEventQ, settingsQ, menuVideosQ, gameVideosQ] = await Promise.all([
      supabaseAdmin
        .from('table_featured')
        .select('*')
        .eq('active', true)
        .eq('show_on_home', true)
        .order('position', { ascending: true }),
      supabaseAdmin.from('live_event_state').select('*').eq('id', 1).maybeSingle(),
      supabaseAdmin
        .from('events')
        .select('*')
        .eq('active', true)
        .gte('date', new Date().toISOString())
        .order('date', { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin.from('tables_settings').select('*').limit(1).maybeSingle(),
      supabaseAdmin.from('menu_products_v2').select('video_url').not('video_url', 'is', null),
      supabaseAdmin
        .from('games_v2')
        .select('youtube_video_id, youtube_start_sec')
        .not('youtube_video_id', 'is', null),
    ]);

    const menuVideos = (menuVideosQ.data ?? [])
      .map((r) => r.video_url)
      .filter((u): u is string => !!u);
    const gameVideos = (gameVideosQ.data ?? [])
      .filter((r) => !!r.youtube_video_id)
      .map((r) => ({ videoId: r.youtube_video_id as string, startSec: r.youtube_start_sec ?? 0 }));

    res.json({
      status: 'success',
      featured: featuredQ.data ?? [],
      liveEvent: liveQ.data ?? { is_live: false },
      nextEvent: nextEventQ.data ?? null,
      settings: settingsQ.data ?? null,
      menuVideos,
      gameVideos,
    });
  } catch (err) {
    console.error('[tables/home] error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// ------------------------------------------------------------
// Pricing helpers (Happy Hour + coupons)
// ------------------------------------------------------------
function isHappyHourNow(): boolean {
  // Lun-Ven 17h30-19h00 Europe/Paris
  // Doit rester aligne avec le front (isHappyHourClient + isHappyHourCategoryWindow).
  const now = new Date();
  const opts = { timeZone: 'Europe/Paris' } as const;
  const dayName = now.toLocaleString('en-US', { ...opts, weekday: 'short' });
  const hour = Number(now.toLocaleString('en-US', { ...opts, hour: 'numeric', hour12: false }));
  const minute = Number(now.toLocaleString('en-US', { ...opts, minute: 'numeric' }));
  const dayOk = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(dayName);
  const minutes = hour * 60 + minute;
  return dayOk && minutes >= 17 * 60 + 30 && minutes < 19 * 60;
}

interface CartItemInput {
  productId: string;
  quantity: number;
}

interface PricedItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  appliedPrice: number;
  happyHourApplied: boolean;
  subtotal: number;
}

interface PricedCart {
  items: PricedItem[];
  subtotal: number;
  happyHourDiscount: number;
  couponDiscount: number;
  total: number;
  coupon: {
    id: string;
    code: string;
    discount_type: 'percentage' | 'amount';
    discount_value: number;
  } | null;
  couponError: string | null;
  happyHourActive: boolean;
}

async function priceCart(itemsIn: CartItemInput[], code: string | null | undefined): Promise<PricedCart> {
  const cleanItems = (itemsIn ?? [])
    .filter((i) => i && typeof i.productId === 'string' && Number.isFinite(i.quantity) && i.quantity > 0)
    .map((i) => ({ productId: i.productId, quantity: Math.max(1, Math.floor(i.quantity)) }));

  if (cleanItems.length === 0) {
    return { items: [], subtotal: 0, happyHourDiscount: 0, couponDiscount: 0, total: 0, coupon: null, couponError: null, happyHourActive: isHappyHourNow() };
  }

  const ids = Array.from(new Set(cleanItems.map((i) => i.productId)));
  const { data: products } = await supabaseAdmin
    .from('menu_products')
    .select('id, name, price, price_hh')
    .in('id', ids);

  const productMap = new Map((products ?? []).map((p) => [p.id, p]));
  const happyHour = isHappyHourNow();

  const items: PricedItem[] = [];
  let subtotal = 0;
  let happyHourDiscount = 0;

  for (const it of cleanItems) {
    const p = productMap.get(it.productId);
    if (!p) continue;
    const unit = Number(p.price ?? 0);
    const hh = p.price_hh != null ? Number(p.price_hh) : null;
    const useHH = happyHour && hh !== null && hh > 0 && hh < unit;
    const applied = useHH ? hh! : unit;
    const sub = +(applied * it.quantity).toFixed(2);
    const baseSub = +(unit * it.quantity).toFixed(2);
    subtotal = +(subtotal + baseSub).toFixed(2);
    happyHourDiscount = +(happyHourDiscount + (baseSub - sub)).toFixed(2);
    items.push({
      productId: p.id,
      productName: p.name,
      quantity: it.quantity,
      unitPrice: unit,
      appliedPrice: applied,
      happyHourApplied: useHH,
      subtotal: sub,
    });
  }

  let coupon: PricedCart['coupon'] = null;
  let couponDiscount = 0;
  let couponError: string | null = null;
  const totalAfterHH = +(subtotal - happyHourDiscount).toFixed(2);

  if (code && code.trim().length > 0) {
    const codeClean = code.trim().toUpperCase();
    const { data: c } = await supabaseAdmin
      .from('coupons')
      .select('*')
      .eq('code', codeClean)
      .maybeSingle();
    if (!c) {
      couponError = 'Code promo introuvable';
    } else if (!c.active) {
      couponError = 'Code promo desactive';
    } else if (c.valid_from && new Date(c.valid_from) > new Date()) {
      couponError = 'Code promo non encore valide';
    } else if (c.valid_until && new Date(c.valid_until) < new Date()) {
      couponError = 'Code promo expire';
    } else if (c.max_uses != null && c.current_uses >= c.max_uses) {
      couponError = 'Code promo epuise';
    } else if (c.min_order_amount != null && totalAfterHH < Number(c.min_order_amount)) {
      couponError = `Minimum ${Number(c.min_order_amount).toFixed(2)} EUR pour ce code`;
    } else {
      coupon = {
        id: c.id,
        code: c.code,
        discount_type: c.discount_type,
        discount_value: Number(c.discount_value),
      };
      if (c.discount_type === 'percentage') {
        couponDiscount = +(totalAfterHH * (Number(c.discount_value) / 100)).toFixed(2);
      } else {
        couponDiscount = +Math.min(Number(c.discount_value), totalAfterHH).toFixed(2);
      }
    }
  }

  const total = +Math.max(0, subtotal - happyHourDiscount - couponDiscount).toFixed(2);

  return {
    items,
    subtotal,
    happyHourDiscount,
    couponDiscount,
    total,
    coupon,
    couponError,
    happyHourActive: happyHour,
  };
}

// ------------------------------------------------------------
// POST /public/tables/:hostname/orders/preview
// Body: { items: [{productId, quantity}], couponCode? }
// ------------------------------------------------------------
tablesRoutes.post('/:hostname/orders/preview', async (req, res) => {
  const parsed = getHostnameFromReq(req);
  if (!parsed) {
    res.status(400).json({ status: 'error', message: 'hostname invalide' });
    return;
  }
  try {
    const { items, couponCode } = req.body ?? {};
    const priced = await priceCart(items, couponCode);
    res.json({ status: 'success', ...priced });
  } catch (err) {
    console.error('[tables/orders/preview] error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// ------------------------------------------------------------
// POST /public/tables/:hostname/orders
// Body: { items: [{productId, quantity}], couponCode?, paymentMethod: 'card'|'cash', customerNote? }
// ------------------------------------------------------------
tablesRoutes.post('/:hostname/orders', requireOrderingEnabled, async (req, res) => {
  const parsed = getHostnameFromReq(req);
  if (!parsed) {
    res.status(400).json({ status: 'error', message: 'hostname invalide' });
    return;
  }
  try {
    const { items, couponCode, paymentMethod, customerNote } = req.body ?? {};
    if (!['card', 'cash'].includes(paymentMethod)) {
      res.status(400).json({ status: 'error', message: 'paymentMethod doit etre "card" ou "cash"' });
      return;
    }
    const priced = await priceCart(items, couponCode);
    if (priced.items.length === 0) {
      res.status(400).json({ status: 'error', message: 'Panier vide' });
      return;
    }
    if (priced.couponError && couponCode) {
      res.status(400).json({ status: 'error', message: priced.couponError });
      return;
    }

    await upsertDevice(parsed);

    const { data: order, error: orderErr } = await supabaseAdmin
      .from('table_orders')
      .insert({
        hostname: parsed.hostname,
        table_number: parsed.tableNumber,
        status: 'received',
        payment_method: paymentMethod,
        subtotal: priced.subtotal,
        happy_hour_discount: priced.happyHourDiscount,
        coupon_id: priced.coupon?.id ?? null,
        coupon_code: priced.coupon?.code ?? null,
        coupon_discount: priced.couponDiscount,
        total: priced.total,
        customer_note: customerNote || null,
      })
      .select()
      .single();

    if (orderErr || !order) {
      console.error('[tables/orders] insert error:', orderErr);
      res.status(500).json({ status: 'error', message: 'Erreur creation commande' });
      return;
    }

    const itemRows = priced.items.map((it) => ({
      order_id: order.id,
      product_id: it.productId,
      product_name: it.productName,
      quantity: it.quantity,
      unit_price: it.unitPrice,
      applied_price: it.appliedPrice,
      happy_hour_applied: it.happyHourApplied,
      subtotal: it.subtotal,
    }));
    await supabaseAdmin.from('table_order_items').insert(itemRows);

    if (priced.coupon) {
      const { data: c } = await supabaseAdmin
        .from('coupons')
        .select('current_uses')
        .eq('id', priced.coupon.id)
        .single();
      if (c) {
        await supabaseAdmin
          .from('coupons')
          .update({ current_uses: (c.current_uses ?? 0) + 1 })
          .eq('id', priced.coupon.id);
      }
    }

    res.status(201).json({
      status: 'success',
      order: {
        id: order.id,
        orderNumber: order.order_number,
        status: order.status,
        paymentMethod: order.payment_method,
        subtotal: order.subtotal,
        happyHourDiscount: order.happy_hour_discount,
        couponDiscount: order.coupon_discount,
        total: order.total,
        createdAt: order.created_at,
      },
    });
  } catch (err) {
    console.error('[tables/orders] error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// ------------------------------------------------------------
// GET /public/tables/:hostname/orders/:id
// ------------------------------------------------------------
tablesRoutes.get('/:hostname/orders/:id', async (req, res) => {
  const parsed = getHostnameFromReq(req);
  if (!parsed) {
    res.status(400).json({ status: 'error', message: 'hostname invalide' });
    return;
  }
  try {
    const { data: order, error } = await supabaseAdmin
      .from('table_orders')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !order) {
      res.status(404).json({ status: 'error', message: 'Commande introuvable' });
      return;
    }

    const { data: items } = await supabaseAdmin
      .from('table_order_items')
      .select('*')
      .eq('order_id', order.id);

    res.json({ status: 'success', order, items: items ?? [] });
  } catch (err) {
    console.error('[tables/orders/get] error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// ============================================================
// Lancement de jeux
//
// L'ancien proxy public POST /pusher a ete supprime ici : il permettait a
// n'importe qui de declencher un evenement temps reel sur une table, et son
// seul usage (notifier le slave) est remplace par l'ordre de lancement, qui
// est persiste, arbitre et verifie. Voir services/tableLaunch.ts.
// ============================================================

// POST /public/tables/launch  { gameId, replace? }
// Appelable depuis LES DEUX dalles : c'est le backend qui adresse l'ordre au
// master (seul PC cable aux deux ecrans).
tablesRoutes.post('/launch', async (req, res) => {
  const parsed = getHostnameFromReq(req);
  if (!parsed) {
    res.status(400).json({ status: 'error', message: 'X-Hostname requis' });
    return;
  }
  const gameId = (req.body?.gameId ?? '') as string;
  if (!gameId) {
    res.status(400).json({ status: 'error', message: 'gameId requis' });
    return;
  }
  try {
    const { order, alreadyActive } = await createOrder(parsed.hostname, gameId, {
      replace: req.body?.replace === true,
    });
    res.status(alreadyActive ? 200 : 201).json({
      status: 'success',
      order: toPublicOrder(order),
      alreadyActive,
    });
  } catch (err) {
    const httpStatus = (err as { httpStatus?: number }).httpStatus ?? 500;
    if (httpStatus === 500) console.error('[tables/launch] error:', err);
    res.status(httpStatus).json({ status: 'error', message: (err as Error).message });
  }
});

// GET /public/tables/launch/current
// Source de verite unique des deux dalles. Interrogee en boucle : meme si tous
// les evenements temps reel se perdent, l'ecran se debloque au prochain appel.
tablesRoutes.get('/launch/current', async (req, res) => {
  const parsed = getHostnameFromReq(req);
  if (!parsed) {
    res.status(400).json({ status: 'error', message: 'X-Hostname requis' });
    return;
  }
  try {
    const order = await getDisplayOrderFor(parsed.hostname);
    res.json({ status: 'success', order: toPublicOrder(order), serverNow: new Date().toISOString() });
  } catch (err) {
    console.error('[tables/launch/current] error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// POST /public/tables/launch/:id/ack
// Le master reclame l'execution. Reponse ok:false => NE PAS lancer (l'agent a
// deja pris le relais). C'est la garde anti double-lancement.
tablesRoutes.post('/launch/:id/ack', async (req, res) => {
  const parsed = getHostnameFromReq(req);
  if (!parsed) {
    res.status(400).json({ status: 'error', message: 'X-Hostname requis' });
    return;
  }
  try {
    const result = await ackOrder(req.params.id, parsed.hostname);
    res.json({
      status: 'success',
      ok: result.ok,
      deeplink: result.deeplink ?? null,
      order: toPublicOrder(result.order),
    });
  } catch (err) {
    const httpStatus = (err as { httpStatus?: number }).httpStatus ?? 500;
    if (httpStatus === 500) console.error('[tables/launch/ack] error:', err);
    res.status(httpStatus).json({ status: 'error', message: (err as Error).message });
  }
});

// POST /public/tables/launch/:id/report  { signal: 'focus' }
// Chrome reprend le focus sur le master = le jeu s'est ferme. Libere les DEUX
// dalles, alors que l'ancien code ne nettoyait que le master.
tablesRoutes.post('/launch/:id/report', async (req, res) => {
  const parsed = getHostnameFromReq(req);
  if (!parsed) {
    res.status(400).json({ status: 'error', message: 'X-Hostname requis' });
    return;
  }
  try {
    const order = await reportFocus(req.params.id);
    res.json({ status: 'success', order: toPublicOrder(order) });
  } catch (err) {
    console.error('[tables/launch/report] error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// POST /public/tables/launch/:id/end
// Disponible sur LES DEUX dalles : si le master est fige, le slave doit pouvoir
// liberer la table lui-meme.
tablesRoutes.post('/launch/:id/end', async (req, res) => {
  const parsed = getHostnameFromReq(req);
  if (!parsed) {
    res.status(400).json({ status: 'error', message: 'X-Hostname requis' });
    return;
  }
  try {
    await endOrder(req.params.id, 'user');
    const order = await getLiveOrderFor(parsed.hostname);
    res.json({ status: 'success', order: toPublicOrder(order) });
  } catch (err) {
    console.error('[tables/launch/end] error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
