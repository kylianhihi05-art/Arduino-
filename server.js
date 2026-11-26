const express = require("express");
const { Pool } = require("pg");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const API_TOKEN = process.env.API_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL est manquant.");
  process.exit(1);
}
if (!API_TOKEN) {
  console.error("API_TOKEN est manquant.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  // Render fournit normalement une URL interne pour les services du même compte.
  // Si tu utilises une URL PostgreSQL externe exigeant SSL, active SSL dans la config.
});

app.use(express.json({ limit: "20kb" }));
app.use(express.static(__dirname));

function getStatus(distance) {
  if (distance < 5) return "danger";
  if (distance <= 10) return "attention";
  return "normal";
}

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS measurements (
      id BIGSERIAL PRIMARY KEY,
      distance_cm INTEGER NOT NULL CHECK (distance_cm > 0 AND distance_cm <= 400),
      status TEXT NOT NULL,
      measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS measurements_measured_at_idx
    ON measurements (measured_at DESC)
  `);
}

function requireToken(req, res, next) {
  const auth = req.get("authorization") || "";
  const supplied = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (supplied.length !== API_TOKEN.length ||
      !require("crypto").timingSafeEqual(Buffer.from(supplied), Buffer.from(API_TOKEN))) {
    return res.status(401).json({ error: "Authentification invalide" });
  }
  next();
}

// Le programme Python local appelle cette route après chaque mesure Arduino.
app.post("/api/measurements", requireToken, async (req, res) => {
  const distance = Number(req.body.distance_cm);
  if (!Number.isInteger(distance) || distance < 1 || distance > 400) {
    return res.status(400).json({ error: "distance_cm doit être un entier entre 1 et 400" });
  }

  const status = getStatus(distance);
  try {
    const result = await pool.query(
      `INSERT INTO measurements (distance_cm, status)
       VALUES ($1, $2)
       RETURNING id, distance_cm, status, measured_at`,
      [distance, status]
    );
    res.status(201).json({ measurement: result.rows[0] });
  } catch (error) {
    console.error("Erreur d'enregistrement :", error);
    res.status(500).json({ error: "Impossible d'enregistrer la mesure" });
  }
});

// Routes publiques en lecture seule pour le tableau de bord.
app.get("/api/measurements", async (req, res) => {
  const rawLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 100;
  try {
    const result = await pool.query(
      `SELECT id, distance_cm, status, measured_at
       FROM measurements
       ORDER BY measured_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ measurements: result.rows, now: new Date().toISOString() });
  } catch (error) {
    console.error("Erreur de lecture :", error);
    res.status(500).json({ error: "Impossible de lire les mesures" });
  }
});


// Statistiques sur 24 h pour le tableau de bord.
app.get("/api/stats", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM measurements)::int AS total,
        COUNT(*)::int AS count,
        MIN(distance_cm) AS min,
        MAX(distance_cm) AS max,
        ROUND(AVG(distance_cm), 1)::float AS avg,
        COUNT(*) FILTER (WHERE status = 'danger')::int AS danger,
        COUNT(*) FILTER (WHERE status = 'attention')::int AS attention,
        COUNT(*) FILTER (WHERE status = 'normal')::int AS normal
      FROM measurements
      WHERE measured_at > NOW() - INTERVAL '24 hours'
    `);
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Erreur de statistiques :", error);
    res.status(500).json({ error: "Impossible de calculer les statistiques" });
  }
});

// Supprime les anciennes mesures pour ne pas saturer la base gratuite.
const RETENTION_DAYS = Number(process.env.RETENTION_DAYS) || 7;
async function purgeOldMeasurements() {
  try {
    await pool.query(
      "DELETE FROM measurements WHERE measured_at < NOW() - make_interval(days => $1)",
      [RETENTION_DAYS]
    );
  } catch (error) {
    console.error("Erreur de nettoyage :", error);
  }
}

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

initializeDatabase()
  .then(() => {
    purgeOldMeasurements();
    setInterval(purgeOldMeasurements, 60 * 60 * 1000);
    app.listen(PORT, () => console.log(`Serveur prêt sur le port ${PORT}`));
  })
  .catch((error) => {
    console.error("Initialisation PostgreSQL impossible :", error);
    process.exit(1);
  });
