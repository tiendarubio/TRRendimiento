export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const { binId } = req.query;
  if (!binId) {
    res.status(400).json({ error: 'binId requerido' });
    return;
  }

  try {
    const url = `https://api.jsonbin.io/v3/b/${encodeURIComponent(binId)}/latest`;
    const resp = await fetch(url, {
      headers: {
        'X-Master-Key': process.env.JSONBIN_MASTER_KEY
      }
    });

    if (!resp.ok) {
      throw new Error('Error JSONBin: ' + resp.status);
    }

    const data = await resp.json();
    res.status(200).json(data);
  } catch (err) {
    console.error('Error en /api/jsonbin-load:', err);
    res.status(500).json({ error: 'Error interno al leer de JSONBin' });
  }
}
