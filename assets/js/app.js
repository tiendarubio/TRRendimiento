// app.js — Helpers compartidos para TRRendimiento (Vercel)

const RENDIMIENTO_BIN_ID = '691cce12d0ea881f40f0a29a';

/**
 * Formatea una fecha/hora ISO a formato El Salvador.
 */
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
 * Formatea un número como moneda USD en es-SV.
 */
function formatCurrency(value) {
  const n = Number(value) || 0;
  return new Intl.NumberFormat('es-SV', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(n);
}

/**
 * Carga configuración (dependientxs, sucursales, metas) desde Google Sheets vía API.
 */
async function fetchRendimientoConfig() {
  const resp = await fetch('/api/rendimiento-config');
  if (!resp.ok) {
    throw new Error('Error al cargar configuración (' + resp.status + ')');
  }
  return resp.json();
}

/**
 * Carga registros + meta desde JSONBin vía API.
 */
async function loadRendimientoFromBin() {
  const url = '/api/jsonbin-load?binId=' + encodeURIComponent(RENDITIMIENTO_BIN_ID ?? RENDIMIENTO_BIN_ID);
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error('Error al cargar rendimiento (' + resp.status + ')');
  }
  const data = await resp.json();
  return data.record || data || null;
}

/**
 * Guarda registros + meta en JSONBin vía API.
 */
async function saveRendimientoToBin(payload) {
  const resp = await fetch('/api/jsonbin-save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ binId: RENDIMIENTO_BIN_ID, payload })
  });
  if (!resp.ok) {
    throw new Error('Error al guardar rendimiento (' + resp.status + ')');
  }
  return resp.json();
}
