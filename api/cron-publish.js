import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import tls from "node:tls";

const posts = [
  "☕ Кофемашина стала готовить кофе медленнее?\n\nЭто может быть признаком загрязнения кофейного тракта или необходимости обслуживания. Не ждите, пока аппарат полностью остановится.\n\nКофемастер PRO — выездной ремонт и обслуживание автоматических кофемашин в Москве.",
  "🔧 Профилактика продлевает жизнь кофемашины\n\nРегулярная чистка, проверка узлов и своевременное обслуживание помогают избежать серьёзных поломок и лишних расходов.\n\nОбслуживаю автоматические кофемашины и вендинговое оборудование. Работаю на месте у клиента в Москве.",
  "⚠️ Кофемашина выдаёт ошибку?\n\nНе всегда ошибка означает серьёзную поломку. Причина может быть в загрязнении, износе детали или нарушении работы одного из узлов.\n\nЛучше провести диагностику, чем продолжать работу через неисправность. Кофемастер PRO — ремонт с выездом.",
  "📌 Кофемастер PRO — полезный канал для тех, у кого есть кофемашина\n\nЗдесь публикую практические советы по уходу, признаки неисправностей, рекомендации по обслуживанию и реальные решения для автоматических кофемашин и вендинга.\n\nРемонт и обслуживание с выездом по Москве. Работаю на месте у клиента. Гарантия — на выполненные ремонтные работы.\n\nПодпишитесь, чтобы сохранить полезные советы, и отправьте канал знакомому, у которого есть кофемашина или кофейный автомат.\n\nКанал: https://max.ru/channel_kofemaster",
  "🛠 Вендинговое оборудование требует регулярного внимания\n\nСвоевременное обслуживание кофейного автомата помогает снизить риск простоя и сохранить стабильную выдачу напитков.\n\nКофемастер PRO: диагностика, ремонт, настройка и обслуживание вендинговых кофемашин в Москве.",
  "🔩 Не спешите списывать кофемашину\n\nМногие неисправности можно устранить заменой или восстановлением отдельного узла. После диагностики станет понятно, целесообразен ли ремонт.\n\nРемонт автоматических кофемашин с выездом. Кофемастер PRO.",
  "📍 Выездной ремонт кофемашин в Москве\n\nНе нужно везти аппарат в мастерскую. Выполняю диагностику и ремонт на месте у клиента.\n\nРаботаю с автоматическими кофемашинами для дома и вендинговым оборудованием. Гарантия — на выполненные ремонтные работы.",
  "🧼 Когда кофемашине пора на обслуживание?\n\nОбратите внимание на изменение вкуса кофе, необычные звуки, замедленную работу и сообщения об ошибках. Это повод проверить аппарат.\n\nПрофилактика и ремонт кофемашин — Кофемастер PRO.",
  "⚙️ Чистота внутри важна не меньше внешнего вида\n\nКофейные остатки и загрязнения постепенно влияют на работу механизмов и качество напитка. Регулярное обслуживание помогает поддерживать аппарат в рабочем состоянии.\n\nКофемастер PRO — обслуживание и ремонт автоматических кофемашин.",
  "☕ Кофемашина должна работать каждый день, а не ждать ремонта\n\nПлановое обслуживание особенно важно для оборудования с постоянной нагрузкой. Проверка основных узлов помогает заранее заметить износ.\n\nОбслуживание и ремонт кофейных автоматов в Москве. Кофемастер PRO."
];

function moscowDayIndex() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const date = parts.reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  const day = new Date(Date.UTC(Number(date.year), Number(date.month) - 1, Number(date.day)));
  return Math.floor(day.getTime() / 86400000) % posts.length;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== "Bearer " + secret) {
    return res.status(401).json({ ok: false, error: "Unauthorized cron request" });
  }

  const token = process.env.MAX_BOT_TOKEN?.trim();
  const channelId = process.env.MAX_CHANNEL_ID?.trim();
  if (!token || !channelId) return res.status(500).json({ ok: false, error: "MAX bot configuration missing" });

  const text = posts[moscowDayIndex()];
  const certPath = path.join(process.cwd(), "certs", "russian_trusted_root_ca.pem");
  let cert;
  try { cert = fs.readFileSync(certPath, "utf8"); }
  catch (e) { return res.status(500).json({ ok: false, error: "Trusted certificate unavailable", details: e.message }); }

  const agent = new https.Agent({ ca: [...tls.rootCertificates, cert], keepAlive: true });
  const body = JSON.stringify({ text });
  try {
    const result = await new Promise((resolve, reject) => {
      const request = https.request({
        hostname: "platform-api2.max.ru",
        path: "/messages?chat_id=" + encodeURIComponent(channelId),
        method: "POST",
        agent,
        headers: { Authorization: token, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
        timeout: 20000
      }, response => {
        let data = "";
        response.setEncoding("utf8");
        response.on("data", chunk => data += chunk);
        response.on("end", () => {
          try { resolve({ status: response.statusCode, data: JSON.parse(data) }); }
          catch { resolve({ status: response.statusCode, data }); }
        });
      });
      request.on("timeout", () => request.destroy(new Error("MAX API timeout")));
      request.on("error", reject);
      request.write(body);
      request.end();
    });
    agent.destroy();
    if (result.status < 200 || result.status >= 300) {
      return res.status(502).json({ ok: false, error: "MAX API rejected scheduled post", status: result.status, details: result.data });
    }
    return res.status(200).json({ ok: true, scheduled: true, post_index: moscowDayIndex(), result: result.data });
  } catch (e) {
    agent.destroy();
    return res.status(502).json({ ok: false, error: "MAX API connection failed", details: e.message });
  }
}
