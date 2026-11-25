
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import tls from "node:tls";

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
Введите PUBLISHER_SECRET из Vercel.
Секрет отправляется только по HTTPS.
</p>

<form id="f">
<input id="s" type="password" required
placeholder="PUBLISHER_SECRET"
style="width:100%;padding:12px;box-sizing:border-box">

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

    const data = await response.json();

    out.textContent = JSON.stringify(data, null, 2);

    if (response.ok && data.ok) {
      document.getElementById("s").value = "";
    }
  } catch (error) {
    out.textContent = "Ошибка: " + error.message;
  }
});
</script>

</body>
</html>`);
  }

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

  if (!publisherSecret || suppliedSecret !== publisherSecret) {
    return res.status(401).json({
      ok: false,
      error: "Invalid PUBLISHER_SECRET"
    });
  }

  // Проверяем токен MAX
  const token = process.env.MAX_BOT_TOKEN;

  if (!token) {
    return res.status(500).json({
      ok: false,
      error: "Missing MAX_BOT_TOKEN"
    });
  }

  // Сертификат из папки проекта
  const certificatePath = path.join(
    process.cwd(),
    "certs",
    "russian_trusted_root_ca.pem"
  );

  let customCertificate;

  try {
    customCertificate = fs.readFileSync(certificatePath, "utf8");
  } catch (error) {
    console.error("Certificate loading error:", error.message);

    return res.status(500).json({
      ok: false,
      error: "Cannot load certificate",
      path: certificatePath
    });
  }

  // Сохраняем стандартные сертификаты Node.js
  const agent = new https.Agent({
    ca: [
      ...tls.rootCertificates,
      customCertificate
    ],
    keepAlive: true
  });

  const webhookUrl =
    "https://kofemaster-max-publisher.vercel.app/api/webhook";

  const body = {
    url: webhookUrl,
    update_types: [
      "bot_added",
      "message_created",
      "bot_started"
    ]
  };

  // Секрет входящего webhook
  const webhookSecret = process.env.MAX_WEBHOOK_SECRET;

  if (webhookSecret) {
    if (!/^[A-Za-z0-9_-]{5,256}$/.test(webhookSecret)) {
      agent.destroy();

      return res.status(500).json({
        ok: false,
        error: "Invalid MAX_WEBHOOK_SECRET format"
      });
    }

    body.secret = webhookSecret;
  }

  // Запрос к MAX API с доверенным сертификатом
  try {
    const result = await new Promise((resolve, reject) => {
      const request = https.request(
        {
          hostname: "platform-api2.max.ru",
          path: "/subscriptions",
          method: "POST",
          agent,
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(
              JSON.stringify(body)
            )
          },
          timeout: 15000
        },
        response => {
          let data = "";

          response.setEncoding("utf8");

          response.on("data", chunk => {
            data += chunk;
          });

          response.on("end", () => {
            let parsed;

            try {
              parsed = JSON.parse(data);
            } catch {
              parsed = {
                response: data
              };
            }

            resolve({
              status: response.statusCode,
              data: parsed
            });
          });
        }
      );

      request.on("timeout", () => {
        request.destroy(new Error("MAX API timeout"));
      });

      request.on("error", reject);

      request.write(JSON.stringify(body));
      request.end();
    });

    agent.destroy();

    if (
      result.status < 200 ||
      result.status >= 300 ||
      result.data.success === false
    ) {
      console.error("MAX subscription failed:", result);

      return res.status(502).json({
        ok: false,
        error: "MAX subscription failed",
        max_status: result.status,
        details: result.data
      });
    }

    return res.status(200).json({
      ok: true,
      message: "Webhook subscription registered",
      url: webhookUrl,
      result: result.data
    });

  } catch (error) {
    agent.destroy();

    console.error("MAX API connection error:", {
      message: error.message,
      code: error.code
    });

    return res.status(502).json({
      ok: false,
      error: "Could not reach MAX API",
      details: error.message,
      code: error.code || null
    });
  }
}
