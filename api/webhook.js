import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import tls from "node:tls";

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, service: "MAX webhook", automation: "dialog messages -> channel" });
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

  if (update.update_type === "bot_added" && update.is_channel) {
    console.log("MAX_CHANNEL_ID:", update.chat_id);
  }

  // Only forward human-authored text from the private bot dialog.
  // Channel/group events and bot-generated messages are ignored to prevent loops.
  const message = update.message;
  const isPrivateDialog = message?.recipient?.chat_type === "dialog";
  const isHuman = message?.sender && message.sender.is_bot !== true;
  const text = typeof message?.body?.text === "string" ? message.body.text.trim() : "";

  if (update.update_type !== "message_created" || !isPrivateDialog || !isHuman || !text) {
    return res.status(200).json({ ok: true, ignored: true });
  }

  if (/^\/(start|help)(?:\s|$)/i.test(text)) {
    return res.status(200).json({ ok: true, ignored: true, reason: "bot command" });
  }

  const token = process.env.MAX_BOT_TOKEN?.trim();
  const channelId = process.env.MAX_CHANNEL_ID?.trim();
  if (!token || !channelId) {
    console.error("Webhook forwarding config missing", { token: !!token, channelId: !!channelId });
    return res.status(200).json({ ok: true, forwarded: false, reason: "missing MAX config" });
  }

  const certificatePath = path.join(process.cwd(), "certs", "russian_trusted_root_ca.pem");
  let customCertificate;
  try {
    customCertificate = fs.readFileSync(certificatePath, "utf8");
  } catch (error) {
    console.error("MAX certificate load error:", error.message);
    return res.status(200).json({ ok: true, forwarded: false, reason: "certificate unavailable" });
  }

  const agent = new https.Agent({ ca: [...tls.rootCertificates, customCertificate], keepAlive: true });
  const requestBody = JSON.stringify({ text });
  try {
    const result = await new Promise((resolve, reject) => {
      const request = https.request({
        hostname: "platform-api2.max.ru",
        path: "/messages?chat_id=" + encodeURIComponent(channelId),
        method: "POST",
        agent,
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(requestBody)
        },
        timeout: 20000
      }, response => {
        let data = "";
        response.setEncoding("utf8");
        response.on("data", chunk => { data += chunk; });
        response.on("end", () => {
          let parsed;
          try { parsed = JSON.parse(data); } catch { parsed = { response: data }; }
          resolve({ status: response.statusCode, data: parsed });
        });
      });
      request.on("timeout", () => request.destroy(new Error("MAX API timeout")));
      request.on("error", reject);
      request.write(requestBody);
      request.end();
    });

    agent.destroy();
    if (result.status < 200 || result.status >= 300) {
      console.error("Webhook forward rejected:", result.status, result.data);
      return res.status(200).json({ ok: true, forwarded: false, max_status: result.status });
    }

    console.log("Private bot message forwarded to channel", channelId);
    return res.status(200).json({ ok: true, forwarded: true });
  } catch (error) {
    agent.destroy();
    console.error("Webhook forwarding error:", { message: error.message, code: error.code });
    return res.status(200).json({ ok: true, forwarded: false, error: error.message });
  }
}
