# CLIQ Layout Lab

SHIFT's computational-design prototype for CLIQ: lay out areas by rule or by rows drawn on a plan, get the CLIQ parts list and dealer-net price, and keep test cases that check the rules against real takeoffs.

It runs in two places from the **same files in `public/`**:

| Where | Catalog (stock, cost) | Saved jobs and test cases |
|-|-|-|
| claude.ai artifact | NetSuite connector, read-only SuiteQL, as the viewer | Artifact database (shared) |
| Replit / any Node host | `server.js` → NetSuite REST SuiteQL, read-only | `data/store.json` on the server |
| Opened as a plain file | none (DN sheet prices only) | this browser's localStorage |

`public/adapters.js` picks the back end at start-up. Nothing else in the app knows which one it is on.

**Nothing writes to NetSuite.** Planned writes are specified in `docs/netsuite-writes.md` and stay off until the program is vetted.

## Files

```
public/index.html     page (no <html>/<head>: claude.ai adds them; server.js adds them on Replit)
public/app.js         UI
public/engine.js      CLIQ part numbers, DN price sheet, takeoff (ported from Brian's CLIQ AI Quote Tool)
public/layout.js      layout rules: areas and drawn rows → runs; lumen-method light estimate
public/bluebeam.js    Bluebeam Markups Summary CSV → rows (provisional, check with a real export)
public/adapters.js    data back ends (artifact / server / offline)
public/catalog-sql.js the read-only catalog query, shared by browser and server
server.js             Replit server: static files, /api/health, /api/catalog, /api/store
test/engine.test.mjs  engine parity with Brian's original code (400 random cases) + rule checks
docs/netsuite-writes.md  what the program would write to NetSuite, when, and through which queue
```

## Run on Replit

1. Create a Node.js Repl and upload this folder (or import it from GitHub).
2. **Secrets** (all optional; without them the app runs on DN sheet prices with no stock):
   - `NS_ACCOUNT_ID`, `NS_CONSUMER_KEY`, `NS_CONSUMER_SECRET`, `NS_TOKEN_ID`, `NS_TOKEN_SECRET`: a NetSuite integration record + access token for a **read-only role** (REST Web Services, SuiteAnalytics, Items / Inventory / Pricing: View). No create or edit permissions.
   - `NS_SUBSIDIARY` (default `11`, SHIFT Innovations), `NS_DN_LEVEL` (default `32`).
   - `APP_PASSWORD`: turns on a simple sign-in prompt. Set it before sharing the URL.
3. Run. `npm test` runs the engine checks. `.replit` deploys with `npm start` (Autoscale/Cloud Run).
4. Data: `data/store.json`. On Replit Deployments the file system resets on redeploy, so move the store to Replit's Postgres (or the ERP database) before relying on it. The store is three collections (`jobs`, `tests`, `settings`) of JSON documents behind four small routes in `server.js`.

No npm dependencies. pdf.js and fonts load from cdnjs / Google Fonts.

## Updating the claude.ai artifact

Publish `public/index.html` with the other `public/*.js` files as supporting files, capabilities `db` and `mcp` (`NetSuite`: `ns_runCustomSuiteQL`). The artifact and the Repl stay in step as long as edits go into `public/`.

## Moving into the ERP

The engine and layout modules are pure functions with tests; port them into the ERP's `src/lib` as they are. The adapter boundary becomes the ERP's own data layer, and `docs/netsuite-writes.md` becomes the sync specification.

## Known limits

- Light estimates are lumen-method averages (CU and LLF in Setup). They size a layout; photometrics still decide.
- CLIQ lumens are published for the Wide optic only, so other optics show no light estimate.
- End-to-end connectors (continuous runs) have no item or price yet.
- The plan file itself is not saved with a job; rows, scale and page size are.
- Bluebeam import reads the documented Markups Summary columns and needs checking against a real Shift export.
