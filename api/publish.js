export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, service: 'Kofemaster MAX Publisher', message: 'Publisher endpoint is running.' });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const suppliedSecret = req.headers['x-publisher-secret'];
  if (!process.env.PUBLISHER_SECRET || suppliedSecret !== process.env.PUBLISHER_SECRET) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const token = process.env.MAX_BOT_TOKEN;
  const channelId = process.env.MAX_CHANNEL_ID;
  if (!token || !channelId) {
    return res.status(500).json({ ok: false, error: 'Missing MAX_BOT_TOKEN or MAX_CHANNEL_ID environment variable' });
  }

  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) return res.status(400).json({ ok: false, error: 'Provide a non-empty text field' });
  if (text.length > 4000) return res.status(400).json({ ok: false, error: 'Text is too long (maximum 4000 characters)' });

  try {
    const url = new URL('https://platform-api2.max.ru/messages');
    url.searchParams.set('chat_id', channelId);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json({ ok: false, error: 'MAX API rejected the post', details: payload });
    }
    return res.status(200).json({ ok: true, message: 'Post sent to MAX', result: payload });
  } catch (error) {
    console.error('MAX publish error:', error);
    return res.status(502).json({ ok: false, error: 'Could not reach MAX API' });
  }
}
