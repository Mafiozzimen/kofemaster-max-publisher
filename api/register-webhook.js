export default async function handler(req, res) {
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`<!doctype html>
<html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Подключение webhook MAX</title>
<body style="font:16px system-ui;max-width:520px;margin:40px auto;padding:0 16px">
<h2>Подключение webhook MAX</h2>
<p>Введите секрет публикации из Vercel Environment Variables (PUBLISHER_SECRET). Он отправится только этому адресу по HTTPS и не будет добавлен в URL.</p>
<form id="f"><input id="s" type="password" required placeholder="PUBLISHER_SECRET" style="width:100%;padding:12px;box-sizing:border-box"><button style="margin-top:12px;padding:12px">Подключить webhook</button></form>
<pre id="r" style="white-space:pre-wrap"></pre>
<script>
document.getElementById('f').addEventListener('submit',async e=>{
e.preventDefault();const out=document.getElementById('r');out.textContent='Подключаю…';
try{const response=await fetch(location.pathname,{method:'POST',headers:{'x-publisher-secret':document.getElementById('s').value}});const data=await response.json();out.textContent=JSON.stringify(data,null,2);if(response.ok)document.getElementById('s').value='';}
catch(err){out.textContent='Ошибка соединения: '+err.message;}
});
</script></body></html>`);
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const suppliedSecret = req.headers['x-publisher-secret'];
  if (!process.env.PUBLISHER_SECRET || suppliedSecret !== process.env.PUBLISHER_SECRET) {
    return res.status(401).json({ ok: false, error: 'Unauthorized: check PUBLISHER_SECRET in Vercel' });
  }

  const token = process.env.MAX_BOT_TOKEN;
  if (!token) return res.status(500).json({ ok: false, error: 'Missing MAX_BOT_TOKEN environment variable' });

  const webhookUrl = 'https://kofemaster-max-publisher.vercel.app/api/webhook';
  const body = {
    url: webhookUrl,
    update_types: ['bot_added', 'message_created', 'bot_started']
  };
  const webhookSecret = process.env.MAX_WEBHOOK_SECRET;
  if (webhookSecret && /^[A-Za-z0-9_-]{5,256}$/.test(webhookSecret)) body.secret = webhookSecret;
  if (webhookSecret && !body.secret) {
    return res.status(500).json({ ok: false, error: 'MAX_WEBHOOK_SECRET must be 5-256 characters using only letters, digits, _ or -' });
  }

  try {
    const response = await fetch('https://platform-api2.max.ru/subscriptions', {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false) {
      return res.status(response.status || 502).json({ ok: false, error: 'MAX subscription failed', details: result });
    }
    return res.status(200).json({ ok: true, message: 'Webhook subscription registered', url: webhookUrl, result });
  } catch (error) {
    console.error('MAX webhook registration error:', error.message);
    return res.status(502).json({ ok: false, error: 'Could not reach MAX API' });
  }
}
