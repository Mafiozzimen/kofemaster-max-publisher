import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import tls from "node:tls";

function replyFor(raw) {
  const t = raw.toLowerCase().replace(/[ё]/g, "е");
  if (/^\/(start|help)(?:\s|$)/i.test(raw) || /^(привет|здравствуй|добрый день|доброе утро|добрый вечер|начать)$/.test(t)) {
    return "Здравствуйте! Я бот Кофемастер PRO ☕\n\nПомогу с ремонтом и обслуживанием автоматических кофемашин и вендингового оборудования в Москве.\n\nНапишите, что нужно:\n• ремонт кофемашины\n• обслуживание\n• вендинг\n• вызов мастера\n\nРабота на месте у клиента. Аппарат не забираем. Гарантия — на выполненные ремонтные работы.";
  }
  if (/цен|стоим|сколько|прайс/.test(t)) {
    return "Стоимость зависит от модели и неисправности. Чтобы назвать цену, сначала нужно понять, какая кофемашина и что с ней происходит. Напишите марку/модель и симптомы — мастер уточнит дальнейшие шаги.";
  }
  if (/вызов|мастер|заказ|ремонт|слом|не работает|ошибк|протека|течет|течёт/.test(t)) {
    return "Принято ☕ Для обращения напишите, пожалуйста:\n1) Марка и модель кофемашины\n2) Что произошло / какая ошибка\n3) Ваш район Москвы\n\nКофемастер PRO выполняет выездную диагностику и ремонт на месте. Машину не забираем.";
  }
  if (/обслуж|чист|профилакти|то\b/.test(t)) {
    return "Проводим профилактическое обслуживание автоматических кофемашин: чистка кофейного тракта, проверка основных узлов и оценка состояния аппарата.\n\nНапишите марку/модель и район Москвы — сориентируем по обращению. Работы выполняются на месте.";
  }
  if (/вендинг|jetinno|jofemar|unicum|автомат/.test(t)) {
    return "Кофемастер PRO обслуживает и ремонтирует вендинговые кофейные автоматы, включая Jetinno, Jofemar и Unicum.\n\nНапишите модель автомата, описание неисправности и район — это поможет подготовить обращение.";
  }
  if (/адрес|где|москв|район/.test(t)) {
    return "Работаем с выездом по Москве, ремонт выполняется у клиента. Кофемашину не забираем. Напишите ваш район и модель аппарата — уточним возможность выезда.";
  }
  return "Сообщение получил ☕ Чтобы быстрее помочь, напишите марку и модель кофемашины, что именно не работает и ваш район Москвы.\n\nКофемастер PRO: выездной ремонт и обслуживание автоматических кофемашин и вендинга. Работаем на месте, гарантия — на ремонтные работы.";
}

async function sendMaxMessage(userId, text, token, agent) {
  const body = JSON.stringify({ text });
  return await new Promise((resolve, reject) => {
    const request = https.request({
      hostname: "platform-api2.max.ru",
      path: "/messages?user_id=" + encodeURIComponent(String(userId)),
      method: "POST",
      agent,
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      },
      timeout: 20000
    }, response => {
      let data = "";
      response.setEncoding("utf8");
      response.on("data", chunk => data += chunk);
      response.on("end", () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = { response: data }; }
        resolve({ status: response.statusCode, data: parsed });
      });
    });
    request.on("timeout", () => request.destroy(new Error("MAX API timeout")));
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, service: "MAX webhook", mode: "automatic private replies; daily channel posts via cron" });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const expectedSecret = process.env.MAX_WEBHOOK_SECRET;
  const suppliedSecret = req.headers["x-max-bot-api-secret"];
  if (expectedSecret && suppliedSecret !== expectedSecret) {
    return res.status(401).json({ ok: false, error: "Invalid webhook secret" });
  }

  const update = req.body || {};
  console.log("MAX UPDATE:", JSON.stringify(update));
  const message = update.message;
  const isDialog = message?.recipient?.chat_type === "dialog";
  const human = message?.sender && message.sender.is_bot !== true;
  const incoming = typeof message?.body?.text === "string" ? message.body.text.trim() : "";
  const userId = message?.sender?.user_id;

  // Never relay private customer messages into the public channel.
  if (update.update_type !== "message_created" || !isDialog || !human || !incoming || !userId) {
    return res.status(200).json({ ok: true, ignored: true });
  }

  const token = process.env.MAX_BOT_TOKEN?.trim();
  if (!token) return res.status(200).json({ ok: true, replied: false, reason: "MAX_BOT_TOKEN missing" });

  const certPath = path.join(process.cwd(), "certs", "russian_trusted_root_ca.pem");
  let cert;
  try { cert = fs.readFileSync(certPath, "utf8"); }
  catch (e) {
    console.error("MAX certificate unavailable:", e.message);
    return res.status(200).json({ ok: true, replied: false, reason: "certificate unavailable" });
  }

  const agent = new https.Agent({ ca: [...tls.rootCertificates, cert], keepAlive: true });
  try {
    const result = await sendMaxMessage(userId, replyFor(incoming), token, agent);
    agent.destroy();
    if (result.status < 200 || result.status >= 300) {
      console.error("MAX private reply rejected:", result.status, result.data);
      return res.status(200).json({ ok: true, replied: false, max_status: result.status });
    }
    console.log("Automated private reply sent to user", userId);
    return res.status(200).json({ ok: true, replied: true });
  } catch (e) {
    agent.destroy();
    console.error("MAX private reply error:", { message: e.message, code: e.code });
    return res.status(200).json({ ok: true, replied: false, error: e.message });
  }
}
