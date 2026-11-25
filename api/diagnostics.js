import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import tls from "node:tls";

function maxGet(route, token, agent) {
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: "platform-api2.max.ru",
      path: route,
      method: "GET",
      agent,
      headers: { Authorization: token },
      timeout: 15000
    }, response => {
      let data = "";
      response.setEncoding("utf8");
      response.on("data", chunk => data += chunk);
      response.on("end", () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = { message: data.slice(0, 300) }; }
        resolve({ status: response.statusCode, data: parsed });
      });
    });
    request.on("timeout", () => request.destroy(new Error("MAX API timeout")));
    request.on("error", reject);
    request.end();
  });
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const supplied = req.headers["x-publisher-secret"];
  if (!process.env.PUBLISHER_SECRET || supplied !== process.env.PUBLISHER_SECRET) {
    return res.status(401).json({ ok: false, error: "Publisher secret is incorrect or missing" });
  }

  const token = process.env.MAX_BOT_TOKEN?.trim();
  const channelId = process.env.MAX_CHANNEL_ID?.trim();
  const checks = {
    publisherSecret: Boolean(process.env.PUBLISHER_SECRET),
    botToken: Boolean(token),
    channelId: Boolean(channelId),
    certificate: false
  };

  if (!token || !channelId) {
    return res.status(200).json({ ok: false, checks, next: "Add MAX_BOT_TOKEN and MAX_CHANNEL_ID to Vercel Production environment variables." });
  }

  const certPath = path.join(process.cwd(), "certs", "russian_trusted_root_ca.pem");
  let cert;
  try {
    cert = fs.readFileSync(certPath, "utf8");
    checks.certificate = cert.length > 100;
  } catch (error) {
    return res.status(200).json({ ok: false, checks, next: "The Russian trusted certificate file is missing from the deployment." });
  }

  const agent = new https.Agent({ ca: [...tls.rootCertificates, cert], keepAlive: false });
  try {
    const me = await maxGet("/me", token, agent);
    if (me.status !== 200) {
      agent.destroy();
      return res.status(200).json({
        ok: false, checks, maxApi: { status: me.status, code: me.data?.code || null, message: me.data?.message || "MAX authentication/API error" },
        next: me.status === 401 ? "MAX_BOT_TOKEN is invalid or revoked. Replace it in Vercel." : "Check the MAX API response and bot token permissions."
      });
    }

    const chat = await maxGet("/chats/" + encodeURIComponent(channelId), token, agent);
    agent.destroy();
    if (chat.status !== 200) {
      return res.status(200).json({
        ok: false, checks,
        bot: { name: me.data?.name || me.data?.first_name || "Bot", username: me.data?.username || null },
        channelApi: { status: chat.status, code: chat.data?.code || null, message: chat.data?.message || "MAX cannot access this channel" },
        next: chat.status === 403 ? "Add this bot to the channel and grant permission to publish." : chat.status === 404 ? "MAX_CHANNEL_ID does not identify a channel accessible to this bot." : "Check channel ID and bot access."
      });
    }

    return res.status(200).json({
      ok: true, checks,
      bot: { name: me.data?.name || me.data?.first_name || "Bot", username: me.data?.username || null },
      channel: { title: chat.data?.title || chat.data?.name || "Channel", id: channelId },
      next: "Connection and channel access are confirmed. The publishing endpoint can now be tested."
    });
  } catch (error) {
    agent.destroy();
    return res.status(200).json({
      ok: false, checks,
      networkError: error.code || error.message,
      next: "MAX API connection failed. Check Vercel logs and certificate/network configuration."
    });
  }
}
