# ILC Studios — Product Roadmap

Items are grouped by area. Each entry notes what it is, why it matters, and rough scope.

---

## 🏠 Home Dashboard

### Filterable Dashboard Widgets _(future)_
Right now all widgets show pre-built, hardcoded data views. The goal is to let each widget be a fully configurable report — similar to Pipedrive Insights — where the user can set:
- **Metric** (pipeline value, deal count, won value, project count, etc.)
- **Filters** (pipeline type, stage, probability threshold, date range, owner, client, etc.)
- **Visualization** (number, bar chart, list, table)
- **Date range** (this month, this year, next 12 months, custom, etc.)

Each widget would save its config as a named report in the DB. Widgets become containers that run a saved report query. Users can have multiple instances of the same "type" with different filters (e.g., one "Pipeline Value" widget filtered to PROCUREMENT ≥80% and another filtered to DESIGN).

**Scope:** Large (2–3 weeks). Requires a report builder UI, a saved-report DB model, and a query engine that maps report configs to Prisma queries.

---

## 🏗️ CRM / Deals

### Convert Deal → Project _(planned)_
When a deal is marked WON, offer a "Convert to Project" action in the DealDrawer. Pre-fill a new project with the deal's name, client, city, state, building type, service type, and number of units. Link the project back to the originating deal.

**Scope:** Medium. Needs a new API route, a confirmation modal in DealDrawer, and a `dealId` FK on the Project model.

---

## 👥 Sales Reps

### Dedicated SalesRep Model _(future)_
Currently rep data is aggregated from `PeerReviewItem.repName / repEmail`. A proper `SalesRep` model would allow reps to be created independently, assigned to deals/projects directly, and tracked with contact info, territory, and performance history.

**Scope:** Medium. Requires a new Prisma model, migration, and updates to the CRM and Sales Reps pages.

---

_Last updated: 2026-05-13_
