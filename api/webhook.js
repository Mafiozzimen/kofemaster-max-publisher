export default function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, service: 'MAX webhook' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const expectedSecret = process.env.MAX_WEBHOOK_SECRET;
  const suppliedSecret = req.headers['x-max-bot-api-secret'];
  if (expectedSecret && suppliedSecret !== expectedSecret) {
    return res.status(401).json({ ok: false, error: 'Invalid webhook secret' });
  }

  const update = req.body || {};
  console.log('MAX UPDATE:', JSON.stringify(update));

  if (update.update_type === 'bot_added' && update.is_channel) {
    console.log('MAX_CHANNEL_ID:', update.chat_id);
  }

  return res.status(200).json({ ok: true });
}
