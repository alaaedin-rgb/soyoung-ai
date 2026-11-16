import express from "express";

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.MODEL || "claude-sonnet-5-5";
const LIMIT = +process.env.HOURLY_LIMIT || 40;
if (!KEY) { console.error("ANTHROPIC_API_KEY غير موجود"); process.exit(1); }

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "50kb" }));
app.use(express.static("public", { dotfiles: "allow" }));

// حدّ بسيط لعدد الرسائل لكل مستخدم في الساعة (يحمي رصيدك)
const hits = new Map();
const limited = ip => {
  const now = Date.now(), h = (hits.get(ip) || []).filter(t => now - t < 3600e3);
  h.push(now); hits.set(ip, h);
  return h.length > LIMIT;
};

async function ask(system, messages, max = 1000) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: max, system, messages })
  });
  if (!r.ok) throw new Error(await r.text());
  const d = await r.json();
  return d.content.filter(b => b.type === "text").map(b => b.text).join("");
}

const SYS = lang => `أنتِ «سويونغ»، معلّمة لغات ودودة وذكية وواسعة المعرفة. اللغة التي يتعلمها الطالب الآن: ${lang}. تجيبين عن أي سؤال في أي موضوع، حتى خارج اللغات، بوضوح ودفء. الافتراضي: الرد بالعربية. عند الحديث عن لغة أجنبية اكتبي الكلمة بكتابتها الأصلية ثم نطقها بالحروف العربية ثم معناها، وصحّحي أخطاء الطالب بلطف مع الشرح. اجعلي الردود مرتبة ومختصرة، مع إيموجي باعتدال. الردود تُقرأ بصوت عالٍ أحيانًا فتجنّبي الجداول والرموز الكثيرة.`;

app.post("/api/chat", async (req, res) => {
  try {
    if (limited(req.ip)) return res.status(429).json({ error: "كثرة طلبات" });
    let m = (req.body.messages || []).slice(-12)
      .filter(x => ["user", "assistant"].includes(x.role) && typeof x.content === "string")
      .map(x => ({ role: x.role, content: x.content.slice(0, 2000) }));
    while (m.length && m[0].role !== "user") m.shift();
    if (!m.length) return res.status(400).json({ error: "رسالة فارغة" });
    const lang = String(req.body.lang || "الكورية").slice(0, 30);
    res.json({ text: await ask(SYS(lang), m) });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "خطأ في الخادم" }); }
});

app.post("/api/json", async (req, res) => {
  try {
    if (limited(req.ip)) return res.status(429).json({ error: "كثرة طلبات" });
    const prompt = String(req.body.prompt || "").slice(0, 1500);
    const t = await ask("أعد JSON صالحًا فقط بدون أي نص أو علامات إضافية.", [{ role: "user", content: prompt }], 1500);
    res.json({ data: JSON.parse(t.replace(/```json|```/g, "").trim()) });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "خطأ في الخادم" }); }
});

app.listen(process.env.PORT || 3000, () => console.log("يعمل على http://localhost:" + (process.env.PORT || 3000)));
