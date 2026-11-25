import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import tls from "node:tls";

export default async function handler(req, res) {
  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(`<!doctype html>
<html lang="ru">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Публикация в MAX</title></head>
<body style="font:16px system-ui;max-width:600px;margin:36px auto;padding:0 16px">
<h2>Публикация в канал MAX</h2>
<p>Введите PUBLISHER_SECRET и текст поста. Секрет отправляется в заголовке HTTPS-запроса, не в адресе страницы.</p>
<form id="f">
<label>Секрет публикации</label>
<input id="s" type="password" required autocomplete="off" placeholder="PUBLISHER_SECRET" style="display:block;width:100%;padding:12px;box-sizing:border-box;margin:8px 0 16px">
<label>Текст поста</label>
<textarea id="t" required maxlength="4000" rows="8" placeholder="Текст публикации..." style="display:block;width:100%;padding:12px;box-sizing:border-box;margin:8px 0"></textarea>
<button style="padding:12px 18px">Опубликовать в канал</button>
</form>
<pre id="r" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre>
<script>
document.getElementById("f").addEventListener("submit", async e => {
 e.preventDefault();
 const out=document.getElementById("r");
 out.textContent="Отправляю публикацию...";
 try {
  const response=await fetch(location.pathname,{method:"POST",headers:{"Content-Type":"application/json","x-publisher-secret":document.getElementById("s").value},body:JSON.stringify({text:document.getElementById("t").value})});
  const raw=await response.text(); let data; try{data=JSON.parse(raw)}catch{data={response:raw}}
  out.textContent=JSON.stringify(data,null,2);
  if(response.ok&&data.ok===true)document.getElementById("t").value="";
 } catch(err){out.textContent="Ошибка соединения: "+err.message}
});
</script>
</body></html>`);
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const suppliedSecret = req.headers["x-publisher-secret"];
  if (!process.env.PUBLISHER_SECRET || suppliedSecret !== process.env.PUBLISHER_SECRET) {
    return res.status(401).json({ ok: false, error: "Unauthorized: check PUBLISHER_SECRET" });
  }

  const token = process.env.MAX_BOT_TOKEN?.trim();
  const channelId = process.env.MAX_CHANNEL_ID?.trim();
  if (!token || !channelId) {
    const missing = [];
    if (!token) missing.push("MAX_BOT_TOKEN");
    if (!channelId) missing.push("MAX_CHANNEL_ID");
    console.error("MAX publish configuration missing:", missing.join(", "));
    return res.status(500).json({ ok: false, error: "Vercel runtime is missing these Production variables: " + missing.join(", "), missing });
  }

  const postText = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!postText) return res.status(400).json({ ok: false, error: "Enter post text" });
  if (postText.length > 4000) return res.status(400).json({ ok: false, error: "Text exceeds 4000 characters" });

  const certificatePath = path.join(process.cwd(), "certs", "russian_trusted_root_ca.pem");
  let customCertificate;
  try {
    customCertificate = fs.readFileSync(certificatePath, "utf8");
  } catch (error) {
    console.error("MAX certificate load error:", error.message);
    return res.status(500).json({ ok: false, error: "Cannot load MAX trusted certificate", details: error.message });
  }

  const agent = new https.Agent({ ca: [...tls.rootCertificates, customCertificate], keepAlive: true });
  const requestBody = JSON.stringify({ text: postText });

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
      console.error("MAX publish rejected:", result.status, result.data);
      return res.status(502).json({ ok: false, error: "MAX API rejected the post", max_status: result.status, details: result.data });
    }
    return res.status(200).json({ ok: true, message: "Post sent to MAX channel", result: result.data });
  } catch (error) {
    agent.destroy();
    console.error("MAX publish connection error:", { message: error.message, code: error.code });
    return res.status(502).json({ ok: false, error: "Could not reach MAX API", details: error.message, code: error.code || null });
  }
}
