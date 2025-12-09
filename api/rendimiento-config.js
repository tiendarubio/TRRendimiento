export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  try {
    const resp = await fetch(process.env.GSHEET_RENDIMIENTO_CONFIG_URL);
    if (!resp.ok) {
      throw new Error('Error al leer Google Sheets: ' + resp.status);
    }
    const data = await resp.json();

    const dependientes = Array.isArray(data.dependientes) ? data.dependientes : [];
    const sucursales = Array.isArray(data.sucursales) ? data.sucursales : [];
    const metas = data.metas || { sucursal: {}, metaPersonalGlobal: 0 };

    res.status(200).json({ dependientes, sucursales, metas });
  } catch (err) {
    console.error('Error en /api/rendimiento-config:', err);
    res.status(500).json({ error: 'Error interno al obtener configuración' });
  }
}
