import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { fetch } from "undici";

const app = express();
const PORT = process.env.PORT || 8080;
const ODDS_API_KEY = process.env.ODDS_API_KEY;
// IMPORTANT: no default here. If not set, auth is OFF.
const ACTIONS_API_KEY = process.env.ACTIONS_API_KEY; 

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());
app.use(morgan("dev"));

// ---- Optional API-key auth (header x-api-key OR Bearer OR ?api_key=...) ----
const requireApiKey = (req, res, next) => {
  // If no ACTIONS_API_KEY is configured, **do not enforce auth** (open).
  if (!ACTIONS_API_KEY) return next();

  if (req.method === "OPTIONS") return res.sendStatus(204);
  const headerKey = req.headers["x-api-key"];
  const bearer = (req.headers.authorization || "").startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : undefined;
  const queryKey = typeof req.query.api_key === "string" ? req.query.api_key : undefined;

  const provided = headerKey || bearer || queryKey;
  if (provided === ACTIONS_API_KEY) return next();
  return res.status(401).json({ ok: false, error: "Unauthorized" });
};

// Health check
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "odds-gpt-backend" });
});

// OpenAPI schema (no auth). Security left empty so GPT can call with "None".
app.get("/openapi.json", (req, res) => {
  const serverUrl = "https://odds-gpt-backend.onrender.com";
  const schema = {
    openapi: "3.1.0",
    info: { title: "Odds GPT Backend", version: "1.0.2" },
    servers: [{ url: serverUrl }],
    components: {
      securitySchemes: {
        apiKeyHeader: { type: "apiKey", in: "header", name: "x-api-key" },
        apiKeyQuery:  { type: "apiKey", in: "query",  name: "api_key"  }
      },
      schemas: {}
    },
    // Empty -> no auth required by default
    security: [],
    paths: {
      "/api/sports": {
        get: {
          operationId: "getSports",
          summary: "List sports and keys",
          description: "Returns sports available from The Odds API.",
          parameters: [
            {
              name: "all",
              in: "query",
              description: "Include inactive/future sports. Default: true",
              required: false,
              schema: { type: "string", enum: ["true", "false"], default: "true" }
            }
          ],
          responses: { "200": { description: "OK" } }
        }
      },
      "/api/odds": {
        get: {
          operationId: "getOdds",
          summary: "Fetch odds",
          description: "Proxy to The Odds API v4 for a given sport.",
          parameters: [
            { name: "sport", in: "query", required: true,  schema: { type: "string", example: "americanfootball_nfl" } },
            { name: "region", in: "query", required: false, schema: { type: "string", default: "us" } },
            { name: "markets", in: "query", required: false, schema: { type: "string", default: "h2h" } },
            { name: "bookmakers", in: "query", required: false, schema: { type: "string" } },
            { name: "dateFormat", in: "query", required: false, schema: { type: "string", default: "iso" } }
          ],
          responses: { "200": { description: "OK" } }
        }
      }
    }
  };
  res.json(schema);
});

// Protect /api only if ACTIONS_API_KEY is set
app.use("/api", requireApiKey);

// /api/sports
app.get("/api/sports", async (req, res) => {
  try {
    if (!ODDS_API_KEY) return res.status(500).json({ ok: false, error: "Missing ODDS_API_KEY" });

    const all = (req.query.all ?? "true").toString();
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

// /api/odds
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
