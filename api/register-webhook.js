
export default async function handler(req, res) {
  // Страница подключения webhook
  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");

    return res.status(200).send(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <title>Подключение webhook MAX</title>
</head>
<body style="font:16px system-ui;max-width:520px;margin:40px auto;padding:0 16px">

<h2>Подключение webhook MAX</h2>

<p>
Введите секрет публикации из Vercel Environment Variables
(PUBLISHER_SECRET). Он отправится только по HTTPS
и не будет добавлен в URL.
</p>

<form id="f">
  <input
    id="s"
    type="password"
    required
    placeholder="PUBLISHER_SECRET"
    style="width:100%;padding:12px;box-sizing:border-box"
  >
  <button style="margin-top:12px;padding:12px">
    Подключить webhook
  </button>
</form>

<pre id="r" style="white-space:pre-wrap"></pre>

<script>
document.getElementById("f").addEventListener("submit", async e => {
  e.preventDefault();

  const out = document.getElementById("r");
  const secret = document.getElementById("s").value;

  out.textContent = "Подключаю webhook...";

  try {
    const response = await fetch(location.pathname, {
      method: "POST",
      headers: {
        "x-publisher-secret": secret
      }
    });

    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { response: text };
    }

    out.textContent = JSON.stringify(data, null, 2);

    if (response.ok && data.ok === true) {
      document.getElementById("s").value = "";
    }
  } catch (error) {
    out.textContent =
      "Ошибка соединения: " + error.message;
  }
});
</script>

</body>
</html>`);
  }

  // Разрешаем только POST
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");

    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  // Проверяем секрет публикации
  const publisherSecret = process.env.PUBLISHER_SECRET;
  const suppliedSecret = req.headers["x-publisher-secret"];

  if (
    !publisherSecret ||
    suppliedSecret !== publisherSecret
  ) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized: check PUBLISHER_SECRET in Vercel"
    });
  }

  // Проверяем токен MAX
  const token = process.env.MAX_BOT_TOKEN;

  if (!token) {
    return res.status(500).json({
      ok: false,
      error: "Missing MAX_BOT_TOKEN environment variable"
    });
  }

  // Адрес webhook
  const webhookUrl =
    "https://kofemaster-max-publisher.vercel.app/api/webhook";

  // Формируем запрос MAX
  const body = {
    url: webhookUrl,
    update_types: [
      "bot_added",
      "message_created",
      "bot_started"
    ]
  };

  // Секрет проверки входящих webhook
  const webhookSecret = process.env.MAX_WEBHOOK_SECRET;

  if (webhookSecret) {
    if (!/^[A-Za-z0-9_-]{5,256}$/.test(webhookSecret)) {
      return res.status(500).json({
        ok: false,
        error:
          "MAX_WEBHOOK_SECRET must contain 5-256 characters: letters, digits, _ or -"
      });
    }

    body.secret = webhookSecret;
  }

  // Подключаем webhook к MAX
  try {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 15000);

    let response;

    try {
      response = await fetch(
        "https://platform-api2.max.ru/subscriptions",
        {
          method: "POST",
          headers: {
            Authorization: token,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body),
          signal: controller.signal
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    const responseText = await response.text();

    let result;

    try {
      result = JSON.parse(responseText);
    } catch {
      result = {
        response: responseText
      };
    }

    // MAX может вернуть ошибку даже с HTTP 200
    if (!response.ok || result.success === false) {
      console.error("MAX subscription failed:", {
        status: response.status,
        result
      });

      return res.status(502).json({
        ok: false,
        error: "MAX subscription failed",
        max_status: response.status,
        details: result
      });
    }

    // Успешная регистрация
    return res.status(200).json({
      ok: true,
      message: "Webhook subscription registered",
      url: webhookUrl,
      result
    });

  } catch (error) {
    // Подробная диагностика ошибки
    console.error("MAX webhook registration error:", {
      name: error.name,
      message: error.message,
      cause: error.cause
        ? {
            code: error.cause.code,
            message: error.cause.message
          }
        : null
    });

    return res.status(502).json({
      ok: false,
      error: "Could not reach MAX API",
      details: error.message,
      cause: error.cause?.message || null,
      code: error.cause?.code || null
    });
  }
}
