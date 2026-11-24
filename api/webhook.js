
export default function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, service: 'MAX webhook' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const update = req.body || {};

  console.log('MAX UPDATE:', JSON.stringify(update));

  if (update.update_type === 'bot_added' && update.is_channel) {
    console.log('MAX_CHANNEL_ID:', update.chat_id);
  }

  return res.status(200).json({ ok: true });
}
