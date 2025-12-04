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
      res.status(resp.status).json({ error: 'Error en Google Sheets (rendimiento-config)', details: text });
      return;
    }

    const data = await resp.json();
    const values = Array.isArray(data.values) ? data.values : [];

    // Estructura esperada (flexible):
    // Columna A: lista de dependientxs (desde fila 2 hacia abajo).
    // Columna B: lista de sucursales (desde fila 2 hacia abajo, se consolidan sin duplicados).
    // Columna C: metas por sucursal (por ejemplo, fila 2: Av. Morazán, fila 3: Sexta Calle, fila 4: Centro Comercial).
    // Columna D: meta personal global (por ejemplo, fila 2).

    const dependientes = [];
    const sucSet = new Set();
    const metasSucursal = {};
    let metaPersonal = 0;

    values.forEach((row, idx) => {
      const a = row[0] ?? '';
      const b = row[1] ?? '';
      const c = row[2] ?? '';
      const d = row[3] ?? '';

      if (idx >= 1) { // desde fila 2
        if (a && String(a).trim()) {
          dependientes.push(String(a).trim());
        }
        if (b && String(b).trim()) {
          sucSet.add(String(b).trim());
        }
      }

      // Metas de sucursal: asumimos filas concretas si vienen usadas así.
      if (idx === 1 && c) {
        metasSucursal['Avenida Morazán'] = parseFloat(String(c).replace(',', '.')) || 0;
      } else if (idx === 2 && c) {
        metasSucursal['Sexta Calle'] = parseFloat(String(c).replace(',', '.')) || 0;
      } else if (idx === 3 && c) {
        metasSucursal['Centro Comercial'] = parseFloat(String(c).replace(',', '.')) || 0;
      }

      if (idx === 1 && d) {
        metaPersonal = parseFloat(String(d).replace(',', '.')) || 0;
      }
    });

    const sucursales = Array.from(sucSet);

    res.status(200).json({
      dependientes,
      sucursales,
      metasSucursal,
      metaPersonal
    });
  } catch (err) {
    console.error('rendimiento-config error', err);
    res.status(500).json({ error: 'Error interno en rendimiento-config', details: String(err) });
  }
}
