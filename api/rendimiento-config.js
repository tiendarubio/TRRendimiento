
export default async function handler(req, res) {
  try {
    const apiKey  = process.env.GOOGLE_SHEETS_API_KEY;
    const sheetId = process.env.GOOGLE_SHEETS_ID_RENDIMIENTO;
    const range   = process.env.GOOGLE_SHEETS_RANGE_RENDIMIENTO || 'dependientxs!A1:D500';

    if (!apiKey || !sheetId) {
      res.status(500).json({ error: 'Faltan variables de entorno de Google Sheets para rendimiento' });
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
    const values = data.values || [];

    const dependientxs = [];
    const sucursalesSet = new Set();
    const metasSucursal = {};
    let metaPersonalGlobal = 0;

    // Estructura esperada:
    // Columna A (desde fila 2): lista de dependientxs
    // Columna B (desde fila 2): lista de sucursales
    // Columna C, filas 2-4: metas por sucursal (alineadas con la sucursal en columna B)
    // Columna D, fila 2 (o siguientes): meta personal global
    for (let i = 1; i < values.length; i++) {
      const row = values[i] || [];
      const colA = (row[0] || '').trim();
      const colB = (row[1] || '').trim();
      const colC = row[2] !== undefined ? String(row[2]).trim() : '';
      const colD = row[3] !== undefined ? String(row[3]).trim() : '';

      // Dependientxs
      if (colA) {
        dependientxs.push(colA);
      }

      // Sucursales y metas por sucursal
      if (colB) {
        sucursalesSet.add(colB);

        if (colC) {
          const metaNum = parseFloat(colC.replace(',', '.'));
          if (!Number.isNaN(metaNum) && metaNum > 0) {
            metasSucursal[colB] = metaNum;
          }
        }
      }

      // Meta personal global (tomamos el último valor válido en D)
      if (colD) {
        const metaPerNum = parseFloat(colD.replace(',', '.'));
        if (!Number.isNaN(metaPerNum) && metaPerNum > 0) {
          metaPersonalGlobal = metaPerNum;
        }
      }
    }

    const uniqueDeps = Array.from(new Set(dependientxs));
    const sucursales = Array.from(sucursalesSet);

    res.status(200).json({
      dependientxs: uniqueDeps,
      sucursales,
      metasSucursal,
      metaPersonalGlobal
    });
  } catch (err) {
    console.error('rendimiento-config error', err);
    res.status(500).json({ error: 'Error interno en rendimiento-config', details: String(err) });
  }
}
