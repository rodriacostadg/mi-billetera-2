const cors = {
  'Access-Control-Allow-Origin': 'https://rodriacostadg.github.io',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

// Tasas configuradas como en Mi Billetera 1. Las TNA se prorratean por 365;
// la TEA se convierte a su tasa diaria equivalente.
const DAILY_YIELDS = {
  'Mercado Pago': { rate: 19, type: 'TNA' },
  'Naranja X': { rate: 20, type: 'TNA' },
  'Cocos TNA': { rate: 22, type: 'TNA' },
  'Cocos Pesos Plus': { rate: 26, type: 'TEA' },
  'Personal Pay': { rate: 19.3, type: 'TNA' }
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (new URL(request.url).pathname !== '/state') return json({ error: 'Ruta no encontrada' }, 404);
    const user = await verifyGoogle(request, env);
    if (!user) return json({ error: 'No autorizado' }, 401);

    if (request.method === 'GET') {
      const row = await env.DB.prepare('SELECT payload, updated_at FROM wallet_state WHERE user_email = ?').bind(user.email).first();
      return json(row || { payload: null });
    }
    if (request.method === 'PUT') {
      const body = await request.json().catch(() => null);
      if (!body?.payload || typeof body.payload !== 'string' || body.payload.length > 500000) return json({ error: 'Datos inválidos' }, 400);
      await env.DB.prepare('INSERT INTO wallet_state (user_email, payload, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_email) DO UPDATE SET payload = excluded.payload, updated_at = CURRENT_TIMESTAMP').bind(user.email, body.payload).run();
      return json({ ok: true });
    }
    return json({ error: 'Método no permitido' }, 405);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(accrueDailyYields(env, event.scheduledTime));
  }
};
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } }); }
async function verifyGoogle(request, env) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
  if (!response.ok) return null;
  const profile = await response.json();
  if (profile.aud !== env.GOOGLE_CLIENT_ID || profile.email !== env.OWNER_EMAIL || profile.email_verified !== 'true') return null;
  return profile;
}

async function accrueDailyYields(env, scheduledTime) {
  const date = argentinaDate(scheduledTime);
  const { results = [] } = await env.DB.prepare('SELECT user_email, payload FROM wallet_state').all();

  for (const row of results) {
    let state;
    try {
      state = JSON.parse(row.payload);
    } catch {
      continue;
    }

    if (!state || state?.meta?.interestAppliedOn === date) continue;

    const wallets = Array.isArray(state.wallets) ? state.wallets : [];
    const movements = Array.isArray(state.movements) ? state.movements : [];

    for (const wallet of wallets) {
      const yieldConfig = DAILY_YIELDS[wallet.name];
      const balance = Number(wallet.balance);
      if (!yieldConfig || !Number.isFinite(balance) || balance <= 0) continue;

      const dailyRate = yieldConfig.type === 'TEA'
        ? Math.pow(1 + yieldConfig.rate / 100, 1 / 365) - 1
        : yieldConfig.rate / 100 / 365;
      const amount = Math.round(balance * dailyRate * 100) / 100;
      if (amount <= 0) continue;

      wallet.balance = Math.round((balance + amount) * 100) / 100;
      movements.unshift({
        id: `yield-${date}-${wallet.id || wallet.name}`,
        name: `Rendimiento diario ${wallet.name}`,
        amount,
        wallet: wallet.name,
        type: 'in',
        category: 'Rendimiento',
        date
      });
    }

    state.movements = movements;
    state.meta = { ...(state.meta || {}), interestAppliedOn: date };

    // Evita duplicar rendimientos si el cron se reintenta.
    await env.DB.prepare(
      'UPDATE wallet_state SET payload = ?, updated_at = CURRENT_TIMESTAMP WHERE user_email = ?'
    ).bind(JSON.stringify(state), row.user_email).run();
  }
}

function argentinaDate(timestamp) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}
