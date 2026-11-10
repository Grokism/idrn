import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient, ObjectId } from 'mongodb';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Bookins.io PaaS MEAN Stack Application Server (MongoDB + Express + Angular + Node behind Nginx).
 *
 * - Contains ZERO hardcoded secrets (safe for public GitHub repositories).
 * - In production containers, Nginx listens publicly on port 80, serves the compiled Angular SPA,
 *   and reverse-proxies `/api/*` to this Express server on `127.0.0.1:3000`.
 * - In the Bookins K3s cluster, Kubernetes automatically injects `MONGO_URI` and
 *   `DB_NAME` (`paas_<slug>`) from the isolated per-app K8s Secret (`paas-db-<slug>`),
 *   which has readWrite access ONLY to this app's database on `mongodb-0` and zero
 *   access to `oracleApp` (the Bookins PII vault).
 * - For local development (`PORT=3000 npm run server`), falls back to `mongodb://127.0.0.1:27017/paas_<slug>`.
 * - All `/api/records` routes verify the caller's Auth0 JWT + origin-scoped private
 *   PermSet (`ps_...`), keying application data by opaque PermSet handle rather than PII.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// When running behind Nginx in K3s, K8s sets PORT=80 for the pod while API_PORT=3000 keeps Express on 3000.
// When running standalone locally (`PORT=3000 npm run server`), Express binds to 3000.
const resolvedPort = Number(
  process.env.API_PORT ||
    (process.env.PORT && Number(process.env.PORT) !== 80 ? process.env.PORT : 3000)
);
const API_PORT = Number.isFinite(resolvedPort) && resolvedPort > 0 ? resolvedPort : 3000;
const API_HOST = process.env.API_HOST || '0.0.0.0';

const rawSlug = 'idrn';
const APP_SLUG =
  !rawSlug || rawSlug.startsWith('__')
    ? 'paas_app'
    : rawSlug.replace(/[^a-z0-9]/gi, '_').toLowerCase();
const DEFAULT_DB_NAME = process.env.DB_NAME || `paas_${APP_SLUG}`;
const MONGO_URI = process.env.MONGO_URI || `mongodb://127.0.0.1:27017/${DEFAULT_DB_NAME}`;
const BOOKINS_API_BASE = (process.env.BOOKINS_API_BASE || 'https://bookins.io').replace(/\/+$/, '');
const AUTH0_ISSUER = (process.env.AUTH0_ISSUER_BASE_URL || 'https://login.bookins.io').replace(
  /\/+$/,
  ''
);
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
    await db
      .collection('member_records')
      .createIndex({ permset: 1, createdAt: -1 }, { background: true });
    mongoConnected = true;
    console.log(`[paas-server] Connected to MongoDB database "${DEFAULT_DB_NAME}".`);
  } catch (err) {
    mongoConnected = false;
    console.warn(
      `[paas-server] MongoDB connection warning (${err?.message || err}). Will retry on request.`
    );
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
  if (req.headers.referer) {
    try {
      return new URL(req.headers.referer).origin.toLowerCase();
    } catch {
      // fall through
    }
  }
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (host) {
    const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
    const rawProto = (req.headers['x-forwarded-proto'] || req.protocol || 'https')
      .split(',')[0]
      .trim()
      .toLowerCase();
    const proto = isLocal ? rawProto : 'https';
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
      issuer: [
        `${AUTH0_ISSUER}/`,
        'https://login.bookins.io/',
        'https://bookins-staging.us.auth0.com/',
      ],
    });

    const reqOrigin = resolveRequestOrigin(req);
    const tokenPermsets = payload?.[PERMSET_CLAIM] || { publicPermsets: [], privatePermsets: [] };
    let publicPermsets = Array.isArray(tokenPermsets.publicPermsets)
      ? tokenPermsets.publicPermsets
      : [];
    let privatePermsets = Array.isArray(tokenPermsets.privatePermsets)
      ? tokenPermsets.privatePermsets
      : [];

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
            (p) =>
              p &&
              p.private !== false &&
              p.status !== 'revoked' &&
              normalizeOrigin(p.url) === reqOrigin
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

    const primaryPermset = matchingPrivate[0];
    const desc = String(primaryPermset.description || 'Member');
    const bracketMatch = desc.match(/\[([^\]]+)\]/);
    const scopeTag = String(
      primaryPermset.scopeTag || (bracketMatch ? bracketMatch[1] : '') || ''
    ).trim();
    const roleKey = String(
      primaryPermset.roleKey ||
        (desc.toLowerCase().includes('admin') ? 'admin' : 'member')
    )
      .trim()
      .toLowerCase();
    const roleLabel = String(
      primaryPermset.roleLabel ||
        desc.replace(/\[[^\]]+\]/g, '').trim() ||
        'Member'
    );

    req.member = {
      sub: payload.sub,
      handle: payload.nickname || payload.name || payload.sub,
      origin: reqOrigin,
      permset: primaryPermset.permset,
      permsetDescription: desc,
      role: roleKey,
      roleKey,
      roleLabel,
      scopeTag,
    };

    next();
  } catch (err) {
    return res
      .status(401)
      .json({ error: `Invalid or expired token: ${err?.message || 'unauthorized'}` });
  }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// --- Health & MEAN Stack Telemetry Endpoint ---
app.get('/api/health', async (_req, res) => {
  const database = await getDb();
  res.status(200).json({
    status: 'ok',
    stack: 'MEAN (MongoDB + Express + Angular + Node) behind Nginx',
    proxy: `nginx:80 -> express:${API_PORT}`,
    apiPort: API_PORT,
    mongoConnected: Boolean(database && mongoConnected),
    dbName: DEFAULT_DB_NAME,
  });
});

// --- Template Manifest Endpoint (/api/template-config) ---
app.get('/api/template-config', (_req, res) => {
  try {
    const manifestPath = path.join(__dirname, 'bookins-template.json');
    if (fs.existsSync(manifestPath)) {
      const raw = fs.readFileSync(manifestPath, 'utf8');
      return res.status(200).json(JSON.parse(raw));
    }
    return res.status(200).json({ templateId: 'default', appSlug: APP_SLUG });
  } catch (err) {
    return res.status(200).json({ templateId: 'default', appSlug: APP_SLUG, warning: err?.message });
  }
});

// --- Protected Member MongoDB Workspace Endpoints (/api/records) ---
app.get('/api/records', requireOriginPermset, async (req, res) => {
  try {
    const database = await getDb();
    if (!database) {
      return res.status(503).json({ error: 'MongoDB database is not reachable.' });
    }

    // Return records owned by this member's PermSet OR shared with their scopeTag / general classroom/project feed
    const filterQuery = req.member.scopeTag
      ? {
          $or: [
            { permset: req.member.permset },
            { scopeTag: req.member.scopeTag },
            { scopeTag: 'general' },
          ],
        }
      : {
          $or: [{ permset: req.member.permset }, { scopeTag: { $exists: true, $ne: '' } }],
        };

    const items = await database
      .collection('member_records')
      .find(filterQuery)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    res.status(200).json({
      dbName: DEFAULT_DB_NAME,
      permset: req.member.permset,
      permsetDescription: req.member.permsetDescription,
      role: req.member.role,
      roleKey: req.member.roleKey,
      roleLabel: req.member.roleLabel,
      scopeTag: req.member.scopeTag,
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
    const category = String(req.body?.category || req.member.roleLabel || 'General').trim();
    const notes = String(req.body?.notes || '').trim();
    const scopeTag = String(req.body?.scopeTag || req.member.scopeTag || '').trim();
    const payload =
      req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : undefined;

    if (!title) {
      return res.status(400).json({ error: 'title is required.' });
    }

    const doc = {
      permset: req.member.permset,
      origin: req.member.origin,
      roleKey: req.member.roleKey,
      roleLabel: req.member.roleLabel,
      ...(scopeTag ? { scopeTag: scopeTag.slice(0, 80) } : {}),
      ...(payload ? { payload } : {}),
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

    const deleteFilter =
      req.member.roleKey === 'admin'
        ? { _id: new ObjectId(id) }
        : { _id: new ObjectId(id), permset: req.member.permset };
    await database.collection('member_records').deleteOne(deleteFilter);

    res.status(200).json({ deleted: true, id });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to delete member record.' });
  }
});

// --- Serve Compiled Angular SPA Static Assets (used in standalone local `npm run server` mode) ---
const staticDir = path.join(__dirname, 'dist', 'app', 'browser');
app.use(express.static(staticDir));

app.get('*', (_req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

connectMongo().finally(() => {
  app.listen(API_PORT, API_HOST, () => {
    console.log(
      `[paas-server] Express API listening on http://${API_HOST}:${API_PORT} (DB: ${DEFAULT_DB_NAME})`
    );
  });
});
