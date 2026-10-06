const cors = {
  'Access-Control-Allow-Origin': 'https://rodriacostadg.github.io',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
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
