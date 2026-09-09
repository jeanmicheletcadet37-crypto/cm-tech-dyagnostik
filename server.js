/**
 * CM TECH SOLUTION Dyagnostik — Sèvè (vèsyon PostgreSQL)
 * --------------------------------------------------------
 * Done yo (biznis, teknisyen, istorik dyagnostik) sove nan yon vrè
 * baz done PostgreSQL — pa nan yon fichye lokal. Sa vle di done yo
 * pa depann de disk sèvè web la, e yo pa pèdi si sèvè a redeplwaye
 * oswa rekòmanse (kontrèman ak vèsyon fichye JSON anvan an).
 *
 * ENSTALASYON:
 *   1. npm install          (enstale sèlman "pg", ki koneke ak Postgres)
 *   2. Mete yon fichye .env nan menm dosye a ak:
 *        DATABASE_URL=postgres://itilizatè:modpas@lot:5432/baz
 *   3. node server.js
 *
 * Gade LISEZ-MWEN.md pou kijan jwenn yon DATABASE_URL gratis sou Render.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

/* ------------------------------------------------------------
   Ti chajè .env san depandans (pou pa ajoute yon lòt pakè)
   ------------------------------------------------------------ */
(function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
})();

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

if (!process.env.DATABASE_URL) {
  console.error("ERÈ: pa gen DATABASE_URL configire. Gade LISEZ-MWEN.md pou konfigire yon baz done Postgres.");
  process.exit(1);
}

const useSSL =
  process.env.PGSSL === "true" ||
  /render\.com|amazonaws\.com|neon\.tech|supabase\.co|railway\.app/.test(process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

/* ============================================================
   INISYALIZASYON BAZ DONE (kreye tab yo si yo pa egziste)
   ============================================================ */

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS businesses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      business_id TEXT NOT NULL REFERENCES businesses(id),
      role TEXT NOT NULL
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS diagnostics (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id),
      technician_id TEXT NOT NULL REFERENCES users(id),
      technician_name TEXT NOT NULL,
      imei TEXT NOT NULL,
      category TEXT NOT NULL,
      notes TEXT,
      scenario_key TEXT,
      cause TEXT,
      tone TEXT,
      resolved BOOLEAN NOT NULL DEFAULT FALSE,
      created_at BIGINT NOT NULL
    );
  `);

  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM users");
  if (rows[0].n === 0) {
    console.log("Baz done vid — n ap simen kont demo yo...");
    const biz1 = "biz_" + crypto.randomBytes(4).toString("hex");
    await pool.query("INSERT INTO businesses (id, name) VALUES ($1, $2)", [biz1, "Biznis Prensipal"]);
    await insertUser({ name: "Administratè Prensipal", username: "admin", password: "admin123", businessId: biz1, role: "admin" });
    await insertUser({ name: "Teknisyen Demo", username: "demo", password: "demo123", businessId: biz1, role: "tech" });
    console.log("Kont demo kreye — admin: admin/admin123, teknisyen: demo/demo123");
  }
}

/* ============================================================
   ITILIZATÈ / MODPAS
   ============================================================ */

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

async function insertUser({ name, username, password, businessId, role }) {
  const id = "u_" + crypto.randomBytes(6).toString("hex");
  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = hashPassword(password, salt);
  await pool.query(
    `INSERT INTO users (id, name, username, salt, password_hash, business_id, role)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, name, username, salt, passwordHash, businessId, role]
  );
  return { id, name, username, businessId, role };
}

async function findUserByUsername(username) {
  const { rows } = await pool.query("SELECT * FROM users WHERE LOWER(username) = LOWER($1)", [username]);
  return rows[0] || null;
}

async function findUserById(id) {
  const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  return rows[0] || null;
}

async function publicUser(u) {
  const { rows } = await pool.query("SELECT name FROM businesses WHERE id = $1", [u.business_id]);
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    role: u.role,
    businessId: u.business_id,
    businessName: rows[0] ? rows[0].name : "—",
  };
}

/* ============================================================
   SESYON (an memwa — sifi pou yon sèl enstans sèvè; si w kouri
   plizyè enstans an menm tan pita, sa ta bezwen deplase nan Postgres
   oswa Redis tou)
   ============================================================ */

const sessions = new Map(); // token -> { userId, expiresAt }
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function createSession(userId) {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, { userId, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

async function getSessionUser(token) {
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() > s.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return findUserById(s.userId);
}

/* ============================================================
   ZOUTIL REKÈT / REPONS
   ============================================================ */

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

async function getAuthUser(req) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  return getSessionUser(token);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function serveStatic(req, res) {
  let filePath = req.url === "/" ? "/index.html" : req.url;
  filePath = path.join(PUBLIC_DIR, decodeURIComponent(filePath.split("?")[0]));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(content);
  });
}

/* ============================================================
   ROUT API
   ============================================================ */

async function handleApi(req, res, urlParts) {
  const [, , resource, resourceId] = urlParts;

  // ---------- POST /api/login ----------
  if (resource === "login" && req.method === "POST") {
    const body = await readBody(req);
    const username = (body.username || "").trim();
    const password = body.password || "";
    const user = await findUserByUsername(username);
    if (!user || hashPassword(password, user.salt) !== user.password_hash) {
      return sendJSON(res, 401, { error: "Non itilizatè oswa modpas la pa kòrèk." });
    }
    const token = createSession(user.id);
    return sendJSON(res, 200, { token, user: await publicUser(user) });
  }

  const authUser = await getAuthUser(req);
  if (!authUser) {
    return sendJSON(res, 401, { error: "Ou pa konekte." });
  }

  // ---------- GET /api/me ----------
  if (resource === "me" && req.method === "GET") {
    return sendJSON(res, 200, { user: await publicUser(authUser) });
  }

  // ---------- GET /api/businesses ----------
  if (resource === "businesses" && req.method === "GET") {
    const { rows } = await pool.query("SELECT id, name FROM businesses ORDER BY name");
    return sendJSON(res, 200, { businesses: rows });
  }

  // ---------- /api/technicians ----------
  if (resource === "technicians") {
    if (authUser.role !== "admin") {
      return sendJSON(res, 403, { error: "Sèlman admin ka jere teknisyen." });
    }

    if (req.method === "GET") {
      const { rows } = await pool.query(
        `SELECT u.id, u.name, u.username, u.role, u.business_id, b.name AS business_name
         FROM users u JOIN businesses b ON b.id = u.business_id
         ORDER BY b.name, u.name`
      );
      const technicians = rows.map((r) => ({
        id: r.id, name: r.name, username: r.username, role: r.role,
        businessId: r.business_id, businessName: r.business_name,
      }));
      return sendJSON(res, 200, { technicians });
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      const { name, username, password, role } = body;
      let businessId = body.businessId;
      const newBusinessName = (body.newBusinessName || "").trim();

      if (!name || !username || !password) {
        return sendJSON(res, 400, { error: "Ranpli non, non itilizatè, ak modpas la." });
      }
      const existing = await findUserByUsername(username);
      if (existing) {
        return sendJSON(res, 409, { error: "Non itilizatè sa a deja pran." });
      }

      if (newBusinessName) {
        businessId = "biz_" + crypto.randomBytes(4).toString("hex");
        await pool.query("INSERT INTO businesses (id, name) VALUES ($1, $2)", [businessId, newBusinessName]);
      } else {
        const { rows } = await pool.query("SELECT id FROM businesses WHERE id = $1", [businessId]);
        if (rows.length === 0) {
          return sendJSON(res, 400, { error: "Biznis la pa valid." });
        }
      }

      const created = await insertUser({
        name, username, password, businessId,
        role: role === "admin" ? "admin" : "tech",
      });
      const fullUser = await findUserById(created.id);
      return sendJSON(res, 201, { technician: await publicUser(fullUser) });
    }

    if (req.method === "DELETE" && resourceId) {
      if (resourceId === authUser.id) {
        return sendJSON(res, 400, { error: "Ou pa ka retire pwòp kont ou k ap itilize kounye a." });
      }
      const result = await pool.query("DELETE FROM users WHERE id = $1", [resourceId]);
      if (result.rowCount === 0) {
        return sendJSON(res, 404, { error: "Teknisyen pa jwenn." });
      }
      return sendJSON(res, 200, { ok: true });
    }
  }

  // ---------- /api/diagnostics ----------
  if (resource === "diagnostics") {
    if (req.method === "GET") {
      const { rows } = await pool.query(
        `SELECT * FROM diagnostics WHERE business_id = $1 ORDER BY created_at DESC LIMIT 200`,
        [authUser.business_id]
      );
      const diagnostics = rows.map((d) => ({
        id: d.id, businessId: d.business_id, technicianId: d.technician_id,
        technicianName: d.technician_name, imei: d.imei, category: d.category,
        notes: d.notes, scenarioKey: d.scenario_key, cause: d.cause, tone: d.tone,
        resolved: d.resolved, createdAt: Number(d.created_at),
      }));
      return sendJSON(res, 200, { diagnostics });
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      const id = "dx_" + crypto.randomBytes(6).toString("hex");
      const createdAt = Date.now();
      await pool.query(
        `INSERT INTO diagnostics
          (id, business_id, technician_id, technician_name, imei, category, notes, scenario_key, cause, tone, resolved, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          id, authUser.business_id, authUser.id, authUser.name,
          body.imei, body.category, body.notes || "", body.scenarioKey || null,
          body.cause || null, body.tone || null, !!body.resolved, createdAt,
        ]
      );
      return sendJSON(res, 201, {
        diagnostic: {
          id, businessId: authUser.business_id, technicianId: authUser.id, technicianName: authUser.name,
          imei: body.imei, category: body.category, notes: body.notes || "",
          scenarioKey: body.scenarioKey, cause: body.cause, tone: body.tone,
          resolved: !!body.resolved, createdAt,
        },
      });
    }

    if (req.method === "PATCH" && resourceId) {
      const body = await readBody(req);
      if (typeof body.resolved !== "boolean") {
        return sendJSON(res, 400, { error: "Valè 'resolved' la mande." });
      }
      const result = await pool.query(
        `UPDATE diagnostics SET resolved = $1 WHERE id = $2 AND business_id = $3 RETURNING *`,
        [body.resolved, resourceId, authUser.business_id]
      );
      if (result.rowCount === 0) {
        return sendJSON(res, 404, { error: "Ka a pa jwenn." });
      }
      const d = result.rows[0];
      return sendJSON(res, 200, {
        diagnostic: {
          id: d.id, businessId: d.business_id, technicianId: d.technician_id,
          technicianName: d.technician_name, imei: d.imei, category: d.category,
          notes: d.notes, scenarioKey: d.scenario_key, cause: d.cause, tone: d.tone,
          resolved: d.resolved, createdAt: Number(d.created_at),
        },
      });
    }
  }

  return sendJSON(res, 404, { error: "Rout la pa egziste." });
}

/* ============================================================
   SÈVÈ PRENSIPAL
   ============================================================ */

const server = http.createServer(async (req, res) => {
  const urlParts = req.url.split("?")[0].split("/");
  if (urlParts[1] === "api") {
    try {
      await handleApi(req, res, urlParts);
    } catch (err) {
      console.error(err);
      sendJSON(res, 500, { error: "Erè sèvè." });
    }
    return;
  }
  serveStatic(req, res);
});

initDb()
  .then(() => {
    server.listen(PORT, () => {
      console.log("CM TECH SOLUTION Dyagnostik — sèvè ap kouri sou http://localhost:" + PORT);
      console.log("Baz done: PostgreSQL (" + (useSSL ? "SSL aktive" : "san SSL") + ")");
    });
  })
  .catch((err) => {
    console.error("Pa t ka konekte oswa inisyalize baz done a:", err.message);
    process.exit(1);
  });
