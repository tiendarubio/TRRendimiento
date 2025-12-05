
/**
 * app-rend.js — Config & helpers para TRRendimiento (versión Vercel, sin llaves en el cliente)
 */

const RENDIMIENTO_BIN_ID = '691cce12d0ea881f40f0a29a';

/**
 * Carga configuración de Google Sheets (lista de dependientxs, sucursales y metas).
 * Se obtiene desde /api/rendimiento-config que usa variables de entorno.
 */
async function loadRendimientoConfig() {
  const resp = await fetch('/api/rendimiento-config');
  if (!resp.ok) {
    console.error('Error al cargar configuración de rendimiento:', resp.status, await resp.text());
    throw new Error('No se pudo cargar la configuración de rendimiento.');
  }
  const data = await resp.json();
  /**
   * data = {
   *   dependientxs: ['Ana', 'Luis', ...],
   *   sucursales:   ['Avenida Morazán', 'Sexta Calle', 'Centro Comercial'],
   *   metasSucursal: { 'Avenida Morazán': 1000, ... },
   *   metaPersonalGlobal: 500
   * }
   */
  return data;
}

/**
 * Carga el payload completo desde JSONBin (registros + cortes + meta).
 */
async function loadRendimientoData() {
  return loadFromBin(RENDIMIENTO_BIN_ID).then(r => {
    if (!r) {
      return {
        meta: { updatedAt: null, ultimoCorte: null },
        configMetas: null,
        registros: [],
        cortes: []
      };
    }
    if (!r.meta) {
      r.meta = { updatedAt: null, ultimoCorte: null };
    }
    if (!Array.isArray(r.registros)) r.registros = [];
    if (!Array.isArray(r.cortes)) r.cortes = [];
    return r;
  });
}

/**
 * Guarda el payload completo en JSONBin.
 */
async function saveRendimientoData(payload) {
  if (!payload.meta) {
    payload.meta = { updatedAt: null, ultimoCorte: null };
  }
  payload.meta.updatedAt = new Date().toISOString();
  await saveToBin(RENDIMIENTO_BIN_ID, payload);
  return payload;
}

/**
 * Helpers genéricos reusados (adaptados de TRLista2.0)
 */

function saveToBin(binId, payload) {
  if (!binId) {
    return Promise.reject(new Error('BIN no configurado.'));
  }
  return fetch('/api/jsonbin-save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ binId, payload })
  }).then(r => {
    if (!r.ok) throw new Error('Error al guardar en servidor (' + r.status + ')');
    return r.json();
  });
}

function loadFromBin(binId) {
  if (!binId) return Promise.resolve(null);
  const url = '/api/jsonbin-load?binId=' + encodeURIComponent(binId);
  return fetch(url)
    .then(r => {
      if (!r.ok) throw new Error('Error al cargar desde servidor (' + r.status + ')');
      return r.json();
    })
    .then(d => d.record || d || null)
    .catch(e => {
      console.error('JSONBin load error:', e);
      return null;
    });
}

function formatSV(iso) {
  if (!iso) return 'Aún no guardado.';
  try {
    const dt = new Date(iso);
    return dt.toLocaleString('es-SV', {
      timeZone: 'America/El_Salvador',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch (e) {
    return 'Aún no guardado.';
  }
}

/**
 * Formatear moneda en dólares (US) con estilo sencillo.
 */
function formatMoney(value) {
  const num = Number(value) || 0;
  return num.toLocaleString('es-SV', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Normaliza una fecha (string o Date) a formato 'YYYY-MM-DD'
 */
function toISODateOnly(d) {
  if (!d) return null;
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return null;
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
