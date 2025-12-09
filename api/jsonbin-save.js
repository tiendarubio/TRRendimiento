export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const { binId, payload } = req.body || {};
  if (!binId || !payload) {
    res.status(400).json({ error: 'binId y payload son requeridos' });
    return;
  }

  try {
    const url = `https://api.jsonbin.io/v3/b/${encodeURIComponent(binId)}`;
    const resp = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': process.env.JSONBIN_MASTER_KEY
      },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      throw new Error('Error JSONBin: ' + resp.status);
    }

    const data = await resp.json();
    res.status(200).json({ ok: true, data });
  } catch (err) {
    console.error('Error en /api/jsonbin-save:', err);
    res.status(500).json({ error: 'Error interno al guardar en JSONBin' });
  }
}
