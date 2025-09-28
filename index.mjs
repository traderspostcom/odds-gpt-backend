import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { fetch } from "undici";

const app = express();
const PORT = process.env.PORT || 8080;
const ODDS_API_KEY = process.env.ODDS_API_KEY;

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());
app.use(morgan("dev"));

// Health check
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "odds-gpt-backend" });
});

// List sports (keys & details)
app.get("/api/sports", async (req, res) => {
  try {
    if (!ODDS_API_KEY) return res.status(500).json({ ok: false, error: "Missing ODDS_API_KEY" });

    const all = (req.query.all ?? "true").toString(); // "true" to include inactive/future
    const url = new URL("https://api.the-odds-api.com/v4/sports");
    url.searchParams.set("apiKey", ODDS_API_KEY);
    url.searchParams.set("all", all);

    const r = await fetch(url);
    const text = await r.text();
    if (!r.ok) return res.status(r.status).json({ ok: false, status: r.status, error: text });

    let data; try { data = JSON.parse(text); } catch { return res.status(502).json({ ok:false, error:"Invalid JSON from provider", raw:text }); }

    res.json({ ok: true, count: Array.isArray(data) ? data.length : undefined, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Odds proxy (H2H / spreads / totals, etc.)
app.get("/api/odds", async (req, res) => {
  try {
    if (!ODDS_API_KEY) return res.status(500).json({ ok: false, error: "Missing ODDS_API_KEY" });

    const {
      sport = "upcoming",
      region = "us",
      markets = "h2h",
      bookmakers,
      dateFormat = "iso",
    } = req.query;

    const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/odds`);
    url.searchParams.set("apiKey", ODDS_API_KEY);
    url.searchParams.set("regions", String(region));
    url.searchParams.set("markets", String(markets));
    url.searchParams.set("oddsFormat", "american");
    url.searchParams.set("dateFormat", String(dateFormat));
    if (bookmakers) url.searchParams.set("bookmakers", String(bookmakers));

    const r = await fetch(url);
    const text = await r.text();
    if (!r.ok) return res.status(r.status).json({ ok: false, status: r.status, error: text });

    let data; try { data = JSON.parse(text); } catch { return res.status(502).json({ ok:false, error:"Invalid JSON from provider", raw:text }); }

    res.json({ ok: true, sport, region, markets, count: Array.isArray(data) ? data.length : undefined, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
