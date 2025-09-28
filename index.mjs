import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { fetch } from "undici";

const app = express();
const PORT = process.env.PORT || 8080;
const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ACTIONS_API_KEY = process.env.ACTIONS_API_KEY || "sU2qYsKtLi5ys9MfbHclk"; // fallback if not set

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());
app.use(morgan("dev"));

// --- API Key auth middleware ---
const requireApiKey = (req, res, next) => {
  const key = req.headers["x-api-key"];
  if (ACTIONS_API_KEY && key === ACTIONS_API_KEY) return next();
  return res.status(401).json({ ok: false, error: "Unauthorized" });
};

// Health check
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "odds-gpt-backend" });
});

// OpenAPI schema for GPT Actions
app.get("/openapi.json", (req, res) => {
  const serverUrl = "https://odds-gpt-backend.onrender.com";
  const schema = {
    openapi: "3.1.0",
    info: { title: "Odds GPT Backend", version: "1.0.0" },
    servers: [{ url: serverUrl }],
    components: {
      securitySchemes: {
        apiKeyAuth: { type: "apiKey", in: "header", name: "x-api-key" }
      }
    },
    security: [{ apiKeyAuth: [] }],
    paths: {
      "/api/sports": {
        get: {
          summary: "List sports and keys",
          responses: { "200": { description: "OK" } }
        }
      },
      "/api/odds": {
        get: {
          summary: "Fetch odds",
          responses: { "200": { description: "OK" } }
        }
      }
    }
  };
  res.json(schema);
});

// Protect API routes
app.use("/api", requireApiKey);

// List sports
app.get("/api/sports", async (req, res) => {
  try {
    if (!ODDS_API_KEY) return res.status(500).json({ ok: false, error: "Missing ODDS_API_KEY" });

    const all = (req.query.all ?? "true").toString();
    const url = new URL("https://api.the-odds-api.com/v4/sports");
    url.searchParams.set("apiKey", ODDS_API_KEY);
    url.searchParams.set("all", all);

    const r = await fetch(url);
    const data = await r.json();
    res.json({ ok: true, count: Array.isArray(data) ? data.length : undefined, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Odds proxy
app.get("/api/odds", async (req, res) => {
  try {
    if (!ODDS_API_KEY) return res.status(500).json({ ok: false, error: "Missing ODDS_API_KEY" });

    const { sport = "upcoming", region = "us", markets = "h2h", bookmakers, dateFormat = "iso" } = req.query;
    const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/odds`);
    url.searchParams.set("apiKey", ODDS_API_KEY);
    url.searchParams.set("regions", String(region));
    url.searchParams.set("markets", String(markets));
    url.searchParams.set("oddsFormat", "american");
    url.searchParams.set("dateFormat", String(dateFormat));
    if (bookmakers) url.searchParams.set("bookmakers", String(bookmakers));

    const r = await fetch(url);
    const data = await r.json();
    res.json({ ok: true, sport, region, markets, count: Array.isArray(data) ? data.length : undefined, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
