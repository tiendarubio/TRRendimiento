export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  try {
    const apiKey = process.env.JSONBIN_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Falta JSONBIN_API_KEY en variables de entorno' });
      return;
    }

    const { binId, payload } = req.body || {};
    if (!binId) {
      res.status(400).json({ error: 'binId es requerido' });
      return;
    }

    const url = `https://api.jsonbin.io/v3/b/${binId}`;

    const resp = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Access-Key': apiKey
      },
      body: JSON.stringify(payload ?? {})
    });

    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      res.status(resp.status).json({
        error: 'Error al guardar en JSONBin',
        details: data || null
      });
      return;
    }

    res.status(200).json(data);
  } catch (err) {
    console.error('jsonbin-save error', err);
    res.status(500).json({ error: 'Error interno en jsonbin-save', details: String(err) });
  }
}
