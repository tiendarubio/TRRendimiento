export default async function handler(req, res) {
  try {
    const apiKey = process.env.JSONBIN_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Falta JSONBIN_API_KEY en variables de entorno' });
      return;
    }

    const { binId } = req.query;
    if (!binId) {
      res.status(400).json({ error: 'Parámetro binId es requerido' });
      return;
    }

    const url = `https://api.jsonbin.io/v3/b/${binId}/latest`;

    const resp = await fetch(url, {
      headers: { 'X-Access-Key': apiKey }
    });

    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      res.status(resp.status).json({
        error: 'Error al cargar desde JSONBin',
        details: data || null
      });
      return;
    }

    res.status(200).json(data);
  } catch (err) {
    console.error('jsonbin-load error', err);
    res.status(500).json({ error: 'Error interno en jsonbin-load', details: String(err) });
  }
}
