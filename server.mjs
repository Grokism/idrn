import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient, ObjectId } from 'mongodb';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Bookins.io PaaS Full-Stack Application Server (Express + MongoDB + Angular SPA).
 *
 * - Contains ZERO hardcoded secrets (safe for public GitHub repositories).
 * - In the Bookins K3s cluster, Kubernetes automatically injects `MONGO_URI` and
 *   `DB_NAME` (`paas_<slug>`) from the isolated per-app K8s Secret (`paas-db-<slug>`),
 *   which has readWrite access ONLY to this app's database on `mongodb-0` and zero
 *   access to `oracleApp` (the Bookins PII vault).
 * - For local development, falls back to `mongodb://127.0.0.1:27017/paas_<slug>`.
 * - All `/api/records` routes verify the caller's Auth0 JWT + origin-scoped private
 *   PermSet (`ps_...`), keying application data by opaque PermSet handle rather than PII.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 80);
const rawSlug = 'idrn';
const APP_SLUG = !rawSlug || rawSlug.startsWith('__') ? 'paas_app' : rawSlug.replace(/[^a-z0-9]/gi, '_').toLowerCase();
const DEFAULT_DB_NAME = process.env.DB_NAME || `paas_${APP_SLUG}`;
const MONGO_URI = process.env.MONGO_URI || `mongodb://127.0.0.1:27017/${DEFAULT_DB_NAME}`;
const BOOKINS_API_BASE = (process.env.BOOKINS_API_BASE || 'https://bookins.io').replace(/\/+$/, '');
const AUTH0_ISSUER = (process.env.AUTH0_ISSUER_BASE_URL || 'https://login.bookins.io').replace(/\/+$/, '');
const PERMSET_CLAIM = process.env.PERMSET_CLAIM_NAMESPACE || 'https://grokism.io/permsets';

const JWKS = createRemoteJWKSet(new URL(`${AUTH0_ISSUER}/.well-known/jwks.json`));

let mongoClient = null;
let db = null;
let mongoConnected = false;

async function connectMongo() {
  try {
    mongoClient = new MongoClient(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    await mongoClient.connect();
    db = mongoClient.db(DEFAULT_DB_NAME);
    await db.collection('member_records').createIndex({ permset: 1, createdAt: -1 }, { background: true });
    mongoConnected = true;
    console.log(`[paas-server] Connected to MongoDB database "${DEFAULT_DB_NAME}".`);
  } catch (err) {
    mongoConnected = false;
    console.warn(`[paas-server] MongoDB connection warning (${ err?.message || err }). Will retry on request.`);
  }
}

async function getDb() {
  if (db && mongoConnected) {
    return db;
  }
  await connectMongo();
  return db;
}

function normalizeOrigin(urlOrOrigin) {
  if (!urlOrOrigin) return '';
  try {
    return new URL(urlOrOrigin).origin.toLowerCase();
  } catch {
    return String(urlOrOrigin).replace(/\/+$/, '').toLowerCase();
  }
}

function resolveRequestOrigin(req) {
  if (req.headers.origin) {
    return normalizeOrigin(req.headers.origin);
  }
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (host) {
    return normalizeOrigin(`${proto}://${host}`);
  }
  return normalizeOrigin(process.env.APP_ORIGIN || '');
}

/**
 * Middleware: Verifies the caller's Auth0 JWT and confirms they hold BOTH:
 * 1) an active public `amihuman` humanity PermSet, AND
 * 2) an active private PermSet scoped to this application's origin (`url === origin`).
 */
async function requireOriginPermset(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      return res.status(401).json({ error: 'Missing Authorization Bearer token.' });
    }

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: [`${AUTH0_ISSUER}/`, 'https://login.bookins.io/', 'https://bookins-staging.us.auth0.com/'],
    });

    const reqOrigin = resolveRequestOrigin(req);
    const tokenPermsets = payload?.[PERMSET_CLAIM] || { publicPermsets: [], privatePermsets: [] };
    let publicPermsets = Array.isArray(tokenPermsets.publicPermsets) ? tokenPermsets.publicPermsets : [];
    let privatePermsets = Array.isArray(tokenPermsets.privatePermsets) ? tokenPermsets.privatePermsets : [];

    // Also query Bookins /api/dapp/permsets if origin-matched private permset is not yet in cached token
    let matchingPrivate = privatePermsets.filter(
      (p) => p && p.private !== false && p.status !== 'revoked' && normalizeOrigin(p.url) === reqOrigin
    );

    if (matchingPrivate.length === 0 && reqOrigin) {
      try {
        const dappRes = await fetch(
          `${BOOKINS_API_BASE}/api/dapp/permsets?url=${encodeURIComponent(reqOrigin)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (dappRes.ok) {
          const dappData = await dappRes.json();
          publicPermsets = [...publicPermsets, ...(dappData.publicPermsets || [])];
          privatePermsets = [...privatePermsets, ...(dappData.privatePermsets || [])];
          matchingPrivate = privatePermsets.filter(
            (p) => p && p.private !== false && p.status !== 'revoked' && normalizeOrigin(p.url) === reqOrigin
          );
        }
      } catch {
        // ignore fallback error
      }
    }

    const isHuman = publicPermsets.some(
      (p) =>
        p &&
        p.private === false &&
        p.status !== 'revoked' &&
        (String(p.description || '').toLowerCase().includes('amihuman') ||
          String(p.url || '').toLowerCase().includes('amihuman.org'))
    );

    if (!isHuman) {
      return res.status(403).json({
        error: 'Forbidden: Active public amihuman proof-of-humanity PermSet is required.',
      });
    }

    if (matchingPrivate.length === 0) {
      return res.status(403).json({
        error: `Forbidden: No active private PermSet disclosed for origin ${reqOrigin}.`,
      });
    }

    req.member = {
      sub: payload.sub,
      handle: payload.nickname || payload.name || payload.sub,
      origin: reqOrigin,
      permset: matchingPrivate[0].permset,
      permsetDescription: matchingPrivate[0].description || 'Member',
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: `Invalid or expired token: ${err?.message || 'unauthorized'}` });
  }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// --- Health & Database Status Endpoint ---
app.get('/api/health', async (_req, res) => {
  const database = await getDb();
  res.status(200).json({
    status: 'ok',
    mongoConnected: Boolean(database && mongoConnected),
    dbName: DEFAULT_DB_NAME,
  });
});

// --- Protected Member MongoDB Workspace Endpoints (/api/records) ---
app.get('/api/records', requireOriginPermset, async (req, res) => {
  try {
    const database = await getDb();
    if (!database) {
      return res.status(503).json({ error: 'MongoDB database is not reachable.' });
    }
    const items = await database
      .collection('member_records')
      .find({ permset: req.member.permset })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    res.status(200).json({
      dbName: DEFAULT_DB_NAME,
      permset: req.member.permset,
      records: items,
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to load member records.' });
  }
});

app.post('/api/records', requireOriginPermset, async (req, res) => {
  try {
    const database = await getDb();
    if (!database) {
      return res.status(503).json({ error: 'MongoDB database is not reachable.' });
    }

    const title = String(req.body?.title || '').trim();
    const category = String(req.body?.category || 'General').trim();
    const notes = String(req.body?.notes || '').trim();

    if (!title) {
      return res.status(400).json({ error: 'title is required.' });
    }

    const doc = {
      permset: req.member.permset,
      origin: req.member.origin,
      title: title.slice(0, 200),
      category: category.slice(0, 80),
      notes: notes.slice(0, 2000),
      createdAt: new Date(),
    };

    const result = await database.collection('member_records').insertOne(doc);
    res.status(201).json({
      message: 'Record saved in isolated tenant MongoDB.',
      record: { ...doc, _id: result.insertedId },
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to create member record.' });
  }
});

app.delete('/api/records/:id', requireOriginPermset, async (req, res) => {
  try {
    const database = await getDb();
    if (!database) {
      return res.status(503).json({ error: 'MongoDB database is not reachable.' });
    }
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid record id.' });
    }

    await database.collection('member_records').deleteOne({
      _id: new ObjectId(id),
      permset: req.member.permset,
    });

    res.status(200).json({ deleted: true, id });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to delete member record.' });
  }
});

// --- Serve Compiled Angular SPA Static Assets ---
const staticDir = path.join(__dirname, 'dist', 'app', 'browser');
app.use(express.static(staticDir));

app.get('*', (_req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

connectMongo().finally(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[paas-server] Listening on http://0.0.0.0:${PORT} (DB: ${DEFAULT_DB_NAME})`);
  });
});
