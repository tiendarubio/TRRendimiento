export default async function handler(req, res) {
  try {
    const apiKey  = process.env.GOOGLE_SHEETS_API_KEY;
    const sheetId = process.env.GOOGLE_SHEETS_ID;
    const range   = process.env.GOOGLE_SHEETS_REND_RANGE || 'dependientxs!A1:D200';

    if (!apiKey || !sheetId) {
      res.status(500).json({ error: 'Faltan variables de entorno de Google Sheets' });
      return;
    }

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`;

    const resp = await fetch(url);
    if (!resp.ok) {
      const text = await resp.text();
      res.status(resp.status).json({ error: 'Error en Google Sheets', details: text });
      return;
    }

    const data = await resp.json();
    const values = Array.isArray(data.values) ? data.values : [];

    // Estructura esperada (flexible):
    // Col A (desde fila 2): lista de dependientxs
    // Col B (desde fila 2): lista de sucursales
    // Col C: meta sucursal en la misma fila de la sucursal
    // Col D: meta personal (usar el primer valor numérico encontrado)
    const dependientesSet = new Set();
    const sucursalesSet = new Set();
    const metasSucursal = {};
    let metaPersonalGlobal = 0;

    for (let i = 1; i < values.length; i++) { // saltar fila encabezado
      const row = values[i] || [];
      const dep = (row[0] || '').trim();
      const suc = (row[1] || '').trim();
      const metaSucStr = (row[2] || '').toString().trim();
      const metaPersStr = (row[3] || '').toString().trim();

      if (dep) dependientesSet.add(dep);
      if (suc) sucursalesSet.add(suc);

      if (suc && metaSucStr) {
        const val = parseFloat(metaSucStr.replace(',', '.'));
        if (!isNaN(val)) metasSucursal[suc] = val;
      }

      if (!metaPersonalGlobal && metaPersStr) {
        const val = parseFloat(metaPersStr.replace(',', '.'));
        if (!isNaN(val)) metaPersonalGlobal = val;
      }
    }

    const dependientes = Array.from(dependientesSet);
    const sucursales = Array.from(sucursalesSet);

    res.status(200).json({
      dependientes,
      sucursales,
      metas: {
        sucursal: metasSucursal,
        metaPersonalGlobal
      }
    });
  } catch (err) {
    console.error('rendimiento-config error', err);
    res.status(500).json({ error: 'Error interno en rendimiento-config', details: String(err) });
  }
}
