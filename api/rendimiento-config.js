
export default async function handler(req, res) {
  try {
    const apiKey  = process.env.GOOGLE_SHEETS_API_KEY;
    const sheetId = process.env.GOOGLE_SHEETS_ID_RENDIMIENTO;
    const range   = process.env.GOOGLE_SHEETS_RANGE_RENDIMIENTO || 'rend!A1:D500';

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
    const sucursales = [];
    const metasSucursal = {};
    let metaPersonalGlobal = 0;

    values.forEach(row => {
      const tipo = (row[0] || '').toLowerCase().trim();
      if (tipo === 'dependientx') {
        if (row[1]) dependientxs.push(row[1]);
      } else if (tipo === 'sucursal') {
        const nombre = row[1];
        const meta = parseFloat(row[2] || '0') || 0;
        if (nombre) {
          sucursales.push(nombre);
          metasSucursal[nombre] = meta;
        }
      } else if (tipo === 'meta_personal_global') {
        metaPersonalGlobal = parseFloat(row[1] || '0') || 0;
      }
    });

    const uniqueDeps = Array.from(new Set(dependientxs));
    const uniqueSuc = Array.from(new Set(sucursales));

    res.status(200).json({
      dependientxs: uniqueDeps,
      sucursales: uniqueSuc,
      metasSucursal,
      metaPersonalGlobal
    });
  } catch (err) {
    console.error('rendimiento-config error', err);
    res.status(500).json({ error: 'Error interno en rendimiento-config', details: String(err) });
  }
}
