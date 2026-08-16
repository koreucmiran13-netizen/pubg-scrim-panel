// PUBG Scrim Panel — Backend
// Port 3001, Express + Multer + Gemini Vision OCR
// Admin şifresi: .env dosyasından veya ADMIN_PASSWORD env'inden okunur

import express from "express";
import multer from "multer";
import session from "express-session";
import { GoogleGenAI } from "@google/genai";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || "0.0.0.0";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "miranadmin2024"; // Varsayılan şifre, .env ile değiştirilebilir
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// Veri dosyası: data.json — kalıcı storage
const DATA_FILE = path.join(__dirname, "data.json");
const UPLOAD_DIR = path.join(__dirname, "uploads");
mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();

// ---- Middlewares ----
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: "pubg-scrim-secret-" + ADMIN_PASSWORD,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }, // 24 saat
  })
);

// Multer: screenshot upload
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".png";
    cb(null, `match_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// ---- Veri yönetimi ----
let data = loadData();

function loadData() {
  if (existsSync(DATA_FILE)) {
    try {
      return JSON.parse(readFileSync(DATA_FILE, "utf-8"));
    } catch {
      return emptyData();
    }
  }
  return emptyData();
}

function emptyData() {
  return {
    matches: [],          // { id, name, date, screenshots: [], results: [{teamName, kills, placement, points}] }
    teams: [],            // Kayıtlı takımlar: { id, name, players: 0-4 }
    settings: {
      pointPerKill: 1,
      placementPoints: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1], // 1st→10th
      totalSlots: 24,
    },
  };
}

function saveData() {
  try {
    writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[SAVE ERROR]", err.message);
  }
}

// ---- Auth middleware ----
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.status(401).json({ error: "Unauthorized" });
}

// ---- Routes ----

// Public: panel HTML
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Static: CSS/JS/images
app.use("/assets", express.static(path.join(__dirname, "public", "assets")));

// Public API
app.get("/api/matches", (_req, res) => {
  res.json(data.matches);
});

app.get("/api/matches/:id", (req, res) => {
  const m = data.matches.find((x) => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: "Match not found" });
  res.json(m);
});

app.get("/api/settings", (_req, res) => res.json(data.settings));

app.get("/api/teams", (_req, res) => res.json(data.teams));

// Auth
app.post("/api/login", (req, res) => {
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    res.json({ ok: true });
  } else {
    res.status(403).json({ error: "Yanlış şifre" });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// Admin API
app.post("/api/match", requireAdmin, (req, res) => {
  const { name } = req.body || {};
  const id = `match_${Date.now()}`;
  const m = { id, name: name || `Maç ${data.matches.length + 1}`, date: new Date().toISOString(), screenshots: [], results: [] };
  data.matches.unshift(m);
  saveData();
  res.json(m);
});

app.post("/api/match/:id/result", requireAdmin, (req, res) => {
  const m = data.matches.find((x) => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: "Match not found" });

  // results: [{teamName, kills, placement}] — points otomatik hesaplanır
  const raw = req.body?.results || [];
  const results = raw.map((r) => {
    const placement = Math.max(1, Math.min(data.settings.totalSlots, Number(r.placement) || 25));
    const kills = Math.max(0, Number(r.kills) || 0);
    const pp = data.settings.placementPoints[placement - 1] || 0;
    const kp = kills * data.settings.pointPerKill;
    return {
      teamName: String(r.teamName || "").trim(),
      kills,
      placement,
      points: pp + kp,
    };
  });
  m.results = results;
  saveData();
  res.json({ ok: true, results });
});

app.post("/api/match/:id/add-results", requireAdmin, (req, res) => {
  // OCR'dan gelen sonuçları mevcut results ile birleştir
  const m = data.matches.find((x) => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: "Match not found" });

  const incoming = req.body?.results || [];
  for (const r of incoming) {
    const name = String(r.teamName || "").trim();
    if (!name) continue;
    const placement = Math.max(1, Math.min(data.settings.totalSlots, Number(r.placement) || 25));
    const kills = Math.max(0, Number(r.kills) || 0);
    const pp = data.settings.placementPoints[placement - 1] || 0;
    const kp = kills * data.settings.pointPerKill;
    const existing = m.results.find((x) => x.teamName.toLowerCase() === name.toLowerCase());
    if (existing) {
      // Screenshot sayısına göre: son gelen kills'ı ekle, placement güncelle
      existing.kills += kills;
      existing.placement = Math.min(existing.placement, placement);
      const ppNow = data.settings.placementPoints[existing.placement - 1] || 0;
      existing.points = ppNow + existing.kills * data.settings.pointPerKill;
    } else {
      m.results.push({ teamName: name, kills, placement, points: pp + kp });
    }
  }
  saveData();
  res.json({ ok: true, results: m.results });
});

app.post("/api/match/:id/upload", requireAdmin, upload.array("screenshots", 10), async (req, res) => {
  const m = data.matches.find((x) => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: "Match not found" });

  const files = req.files || [];
  if (files.length === 0) return res.status(400).json({ error: "Dosya yok" });

  m.screenshots.push(...files.map((f) => f.filename));
  saveData();

  // Gemini Vision ile OCR
  const ocrResults = [];
  try {
    if (!GEMINI_API_KEY) {
      return res.json({
        ok: true,
        uploaded: files.length,
        ocr: null,
        error: "GEMINI_API_KEY tanımlı değil — .env dosyasına ekleyin.",
      });
    }
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    for (const f of files) {
      const imgData = readFileSync(f.path);
      const mimeType = f.mimetype || "image/png";

      const prompt = `Bu PUBG Mobile maç sonuç ekran görüntüsü. Ekran görüntüsünden her takım için şu bilgileri çıkar:
- Takım adı (team name)
- Kill sayısı
- Placement (sıralama, 1-24 arası)

SADECE JSON dizisi döndür, başka metin yazma:
[{"teamName": "TakımAdı", "kills": 5, "placement": 3}, ...]

Takım adı okunamıyorsa "UNKNOWN" yazma, en iyi tahmini yaz. Eğer kill sayısı görünmüyorsa 0 yaz. Toplamda en fazla 24 takım olabilir. Sadece JSON.`;

      const resp = await ai.models.generateContent({
        model: MODEL,
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { data: imgData.toString("base64"), mimeType } },
            ],
          },
        ],
      });

      const text = resp.text || "";
      // JSON'u extract et
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed)) ocrResults.push(...parsed);
        } catch {
          console.warn(`[OCR] JSON parse failed for ${f.filename}: ${text.slice(0, 200)}`);
        }
      } else {
        console.warn(`[OCR] No JSON found in ${f.filename}: ${text.slice(0, 200)}`);
      }
    }

    // OCR sonuçlarını match'e işle
    if (ocrResults.length > 0) {
      for (const r of ocrResults) {
        const name = String(r.teamName || "").trim();
        if (!name) continue;
        const placement = Math.max(1, Math.min(data.settings.totalSlots, Number(r.placement) || 25));
        const kills = Math.max(0, Number(r.kills) || 0);
        const pp = data.settings.placementPoints[placement - 1] || 0;
        const kp = kills * data.settings.pointPerKill;
        const existing = m.results.find((x) => x.teamName.toLowerCase() === name.toLowerCase());
        if (existing) {
          existing.kills += kills;
          existing.placement = Math.min(existing.placement, placement);
          const ppNow = data.settings.placementPoints[existing.placement - 1] || 0;
          existing.points = ppNow + existing.kills * data.settings.pointPerKill;
        } else {
          m.results.push({ teamName: name, kills, placement, points: pp + kp });
        }
      }
      saveData();
    }
  } catch (err) {
    console.error("[OCR ERROR]", err.message);
    return res.json({ ok: true, uploaded: files.length, ocr: ocrResults, error: `OCR hatası: ${err.message}` });
  }

  res.json({ ok: true, uploaded: files.length, ocr: ocrResults });
});

app.post("/api/match/:id/delete", requireAdmin, (req, res) => {
  data.matches = data.matches.filter((x) => x.id !== req.params.id);
  saveData();
  res.json({ ok: true });
});

app.post("/api/settings", requireAdmin, (req, res) => {
  const { pointPerKill, placementPoints, totalSlots } = req.body || {};
  if (pointPerKill !== undefined) data.settings.pointPerKill = Number(pointPerKill);
  if (placementPoints !== undefined) data.settings.placementPoints = placementPoints;
  if (totalSlots !== undefined) data.settings.totalSlots = Math.min(100, Math.max(4, Number(totalSlots)));
  saveData();
  res.json(data.settings);
});

app.post("/api/teams", requireAdmin, (req, res) => {
  const { name, players } = req.body || {};
  if (!name) return res.status(400).json({ error: "Takım adı gerekli" });
  const team = {
    id: `team_${Date.now()}`,
    name: String(name).trim(),
    players: Math.max(0, Math.min(4, Number(players) || 0)),
  };
  data.teams.push(team);
  saveData();
  res.json(team);
});

app.post("/api/teams/:id", requireAdmin, (req, res) => {
  const t = data.teams.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "Team not found" });
  const { name, players } = req.body || {};
  if (name !== undefined) t.name = String(name).trim();
  if (players !== undefined) t.players = Math.max(0, Math.min(4, Number(players) || 0));
  saveData();
  res.json(t);
});

app.post("/api/teams/:id/delete", requireAdmin, (req, res) => {
  data.teams = data.teams.filter((x) => x.id !== req.params.id);
  saveData();
  res.json({ ok: true });
});

// Screenshot görüntüleme
app.get("/uploads/:file", (req, res) => {
  const f = path.basename(req.params.file);
  const p = path.join(UPLOAD_DIR, f);
  if (existsSync(p)) res.sendFile(p);
  else res.status(404).json({ error: "Not found" });
});

// ---- Start ----
app.listen(PORT, HOST, () => {
  console.log(`[PUBG PANEL] Server running at http://${HOST}:${PORT}`);
  console.log(`[PUBG PANEL] Admin password: ${ADMIN_PASSWORD}`);
  console.log(`[PUBG PANEL] Gemini API Key: ${GEMINI_API_KEY ? "✓ Set" : "✗ NOT SET (OCR disabled)"}`);
  console.log(`[PUBG PANEL] Model: ${MODEL}`);
});
