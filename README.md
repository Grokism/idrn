# idrn_client

A full-stack PermSet-enabled application (Angular SPA + Node/Express API + isolated MongoDB database) scaffolded by the [bookins.io](https://bookins.io) PaaS provisioner for `https://idrn.bookins.io`.

It uses the **Bookins.io PermSet Protocol** for zero-PII identity and sybil-resistant authorization:
1. **Public Humanity (`amihuman`):** Verifies a real human stands behind the handle across all Grokism ecosystem apps.
2. **Origin-Scoped Private PermSet (`https://idrn.bookins.io`):** Disclosed **only** to `https://idrn.bookins.io` and never to any other site.
3. **Isolated Tenant MongoDB (`paas_idrn`):** Backed by a least-privilege MongoDB user on the Bookins K3s `mongodb-0` server with `readWrite` access **only** to `paas_idrn` (zero access to the Bookins `oracleApp` PII vault). All application records are keyed by the member's opaque `ps_...` PermSet handle.

---

## 1. Clone & Run Locally (With Local MongoDB)

```bash
git clone https://github.com/Grokism/idrn.git
cd idrn
npm install

# Option A: Build Angular and run the full-stack Express + MongoDB server on http://localhost:3000
npm run build
PORT=3000 MONGO_URI="mongodb://127.0.0.1:27017/paas_idrn" npm run server

# Option B: Run Angular dev server on http://localhost:4200
npm start
```

---

## 2. How the Isolated MongoDB Connection Works (`server.mjs` & `Dockerfile`)

- **Zero Secrets in Code or `Dockerfile`:** `server.mjs` reads `process.env.MONGO_URI` and `process.env.DB_NAME`.
- **Automatic K3s Secret Injection:** When deployed on the Bookins.io K3s cluster, Kubernetes automatically injects `MONGO_URI` and `DB_NAME` (`paas_idrn`) from the cluster's `paas-db-idrn` Secret pointing to `mongodb.mongodb.svc.cluster.local:27017`.
- **Adding Custom `/api/*` Endpoints & Collections:**
  Open `server.mjs` and add your own Express routes using `requireOriginPermset` and `await getDb()`. Every authenticated request provides `req.member.permset` (the member's opaque `ps_...` handle) and `req.member.origin`.

---

## 3. Safe to Edit vs. Protected PermSet Protocol Files

### Safe to Customize Freely
- `server.mjs` — Add custom `/api/*` routes and MongoDB collections (keep `requireOriginPermset` middleware intact)
- `src/app/pages/landing.component.ts` — Public landing page content and layout
- `src/app/pages/home.component.ts` — Protected member workspace / dashboard UI
- `src/styles.css` — Colors, typography, and custom styling
- Any new components, services, or routes you add under `src/app/`

### Protected Core (Do Not Remove or Bypass)
The GitHub Actions build pipeline (`.github/workflows/deploy.yml`) automatically verifies that the Bookins PermSet login and route guards remain intact before building the container image:
- `src/app/guards/private-permset.guard.ts` & `src/app/guards/amihuman.guard.ts` — Route guards enforcing public humanity + private origin-scoped PermSets
- `src/app/permset.service.ts` — Selective disclosure evaluator (`https://grokism.io/permsets`)
- `src/app/membership.service.ts` & `src/app/pages/join.component.ts` — Self-service **"Become a Member"** (`/join`) flow
- `src/app/app.component.ts` — Top-right **Your Credentials** header dropdown and `loginWithRedirect` / `logout` handlers

---

## 4. How to Deploy Your Changes to the Bookins.io Kubernetes Cluster

1. **Commit and push your changes to `main`:**
   ```bash
   git add .
   git commit -m "Add custom MongoDB routes and member UI"
   git push origin main
   ```
2. **Automated Container Build (GitHub Actions):**
   Pushing to `main` runs `.github/workflows/deploy.yml`, which verifies the PermSet guards, compiles the Angular SPA + `server.mjs` `Dockerfile`, and pushes `ghcr.io/grokism/idrn-fe:latest`.
3. **One-Click Cluster Rollout in `bookins.io`:**
   In your organization dashboard at [https://bookins.io](https://bookins.io), scroll to **Provisioned Organization Apps** and click **"Deploy Latest from GitHub"**. Bookins will pull your new image into K3s, attach your isolated `paas-db-idrn` MongoDB secret, and roll out your updated app at `https://idrn.bookins.io`.
