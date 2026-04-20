/**
 * Public routes for the tables tactiles V2 interface.
 * Mounted on /public/tables - no auth, identification via X-Hostname header.
 */

import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { triggerSafe } from '../config/pusher.js';

export const tablesRoutes = Router();

const HOSTNAME_RE = /^TABLE\d{2}-[12]$/;
const PUSHER_CHANNEL_WHITELIST = /^(TABLE\d{2}-[12]|TABLES)$/;

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

    const [deviceQ, liveQ, screenQ, homeQ, nextEventQ] = await Promise.all([
      supabaseAdmin.from('table_devices').select('*').eq('hostname', parsed.hostname).single(),
      supabaseAdmin.from('live_event_state').select('*').eq('id', 1).maybeSingle(),
      supabaseAdmin
        .from('table_screensaver_featured')
        .select('*')
        .eq('active', true)
        .order('position', { ascending: true }),
      supabaseAdmin
        .from('table_home_featured')
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
    ]);

    res.json({
      status: 'success',
      device: deviceQ.data ?? null,
      liveEvent: liveQ.data ?? { is_live: false },
      screensaverFeatured: screenQ.data ?? [],
      homeFeatured: homeQ.data ?? [],
      nextEvent: nextEventQ.data ?? null,
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
      .from('table_screensaver_featured')
      .select('*')
      .eq('active', true)
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
    const [featuredQ, liveQ, nextEventQ] = await Promise.all([
      supabaseAdmin
        .from('table_home_featured')
        .select('*')
        .eq('active', true)
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
    ]);

    res.json({
      status: 'success',
      featured: featuredQ.data ?? [],
      liveEvent: liveQ.data ?? { is_live: false },
      nextEvent: nextEventQ.data ?? null,
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
tablesRoutes.post('/:hostname/orders', async (req, res) => {
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

// ------------------------------------------------------------
// POST /public/tables/pusher
// Body: { channel, event, data }
// Proxy securise pour permettre au client de trigger un event Pusher
// (le secret reste cote serveur). Whitelist : TABLEXX-[12] | TABLES.
// ------------------------------------------------------------
tablesRoutes.post('/pusher', async (req, res) => {
  const parsedHost = parseHostname(req.headers['x-hostname'] as string);
  if (!parsedHost) {
    res.status(400).json({ status: 'error', message: 'X-Hostname requis' });
    return;
  }
  const { channel, event, data } = req.body ?? {};
  if (typeof channel !== 'string' || !PUSHER_CHANNEL_WHITELIST.test(channel)) {
    res.status(400).json({ status: 'error', message: 'Channel non autorise' });
    return;
  }
  if (typeof event !== 'string' || event.length === 0 || event.length > 64) {
    res.status(400).json({ status: 'error', message: 'Event invalide' });
    return;
  }
  // Le master ne peut trigger qu'un event sur le slave de SA propre table ou sur TABLES
  if (channel !== 'TABLES') {
    const expectedTable = parsedHost.tableNumber;
    if (!channel.startsWith(`${expectedTable}-`)) {
      res.status(403).json({ status: 'error', message: 'Channel cible interdit pour cet hostname' });
      return;
    }
  }
  try {
    let payload: unknown = data;
    if (typeof data === 'string') {
      try { payload = JSON.parse(data); } catch { payload = data; }
    }
    await triggerSafe(channel, event, payload ?? {});
    res.json({ status: 'success' });
  } catch (err) {
    console.error('[tables/pusher] error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
