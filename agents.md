<!--
  GENERATED FILE — do not edit by hand.
  Source: src/lib/mcp/catalog.js
  Regenerate: node scripts/generate-agents-md.mjs
  `npm run verify` fails if this file and the catalogue disagree.
-->

# Working with ILC Studios data

This describes the read-only API an AI assistant uses to answer questions about
ILC Studios' projects, clients, budgets and sales pipeline. It is internal; it is
not served at a public address.

## The one rule

**Everything here is read-only.** There is no tool that creates, edits or deletes
anything, and there never will be on this endpoint. If a question needs something
changed, say what needs changing and who should change it — do not look for a way
to do it here.

## What you can see

Not everything, and not the same things as everybody else. Two separate limits
apply to every answer, and neither one is something you can argue with:

- **Which rows.** You only ever see records that belong to whoever the key was
  issued to. A client sees their own jobs. Asking about somebody else's job
  returns nothing at all — not an error, just nothing.
- **Which columns.** Buy prices, margins and other internal figures are removed
  from the answer before you get it. They are not marked as removed; they are
  simply absent. Do not try to work them out from what is left, and do not filter
  on a field you cannot see — that request is refused outright.

If a tool refuses you, that is the answer. Say so plainly and move on; do not try
the same question a different way.

## How to start

Call `list_models` first. It tells you the names of the things you can ask about,
and those names are the only valid `model` argument for every other tool. Then
`describe_model` for the fields on one of them. Guessing a model name wastes a
call and is recorded as a failed request.

To find a record when you only have a name like "The Approach", use `search`
rather than a filter — it looks across project names, project numbers and client
names in one go.

## Limits

- A query returns at most **100** rows, and **25** if you do not ask for a number.
  Ask a narrower question rather than paging through everything.
- There is a per-minute cap on requests. If you hit it, wait — retrying
  immediately just burns the allowance.
- **Every call is recorded** against the person whose key you are using: which
  tool, which arguments, and whether it was refused. The answer itself is not
  recorded. Ask the question you actually need answered.

## The tools

There are 11. 7 are available to anyone the server has
authenticated; 4 are ILC staff only and are refused to everybody else.

### `list_models`

List the data objects available through this server, with a one-line description of each. Start here — the names returned are the only valid `model` arguments for the other tools.

_Takes no arguments._

### `describe_model`

Describe one object: its fields with types, and its links to other objects. Fields you are not cleared to read are absent from the result, not marked.

| Argument | Type | Required | Notes |
| --- | --- | --- | --- |
| `model` | string | yes | model or object name from list_models |

### `query_records`

Query records of one model with an optional filter, sort and limit. Returns at most 100 rows (default 25). Filters may only reference fields you are cleared to read.

| Argument | Type | Required | Notes |
| --- | --- | --- | --- |
| `model` | string | yes |  |
| `where` | object or string |  | Prisma where clause, or a JSON string of one |
| `orderBy` | object or string |  |  |
| `include` | object or string |  | relations to include, by link name |
| `limit` | number |  |  |
| `skip` | number |  |  |

### `get_record`

Fetch a single record of one model by id.

| Argument | Type | Required | Notes |
| --- | --- | --- | --- |
| `model` | string | yes |  |
| `id` | string | yes |  |
| `include` | object or string |  |  |

### `count_records`

Count records of one model matching an optional filter. Returns a number, not rows.

| Argument | Type | Required | Notes |
| --- | --- | --- | --- |
| `model` | string | yes |  |
| `where` | object or string |  |  |

### `search`

Free-text search across project names/numbers and client names. Use when you have a name like "The Approach" and need the record it refers to.

| Argument | Type | Required | Notes |
| --- | --- | --- | --- |
| `query` | string | yes |  |
| `limit` | number |  |  |

### `get_project_360`

Everything about one project in a single call: the project, its client, its budget (design bid matrix versions or peer review items), its fixture schedules, its change orders, and its project data inputs. Accepts an id, a project number, or a name.

| Argument | Type | Required | Notes |
| --- | --- | --- | --- |
| `projectId` | string |  |  |
| `projectNumber` | number |  |  |
| `name` | string |  |  |

### `get_pipeline`

**ILC staff only.**
The sales pipeline: projects with their probability, expected order date and contract value. ILC staff only — these fields are commercial position, not project facts.

| Argument | Type | Required | Notes |
| --- | --- | --- | --- |
| `lifecycleStatus` | string |  |  |
| `limit` | number |  |  |

### `get_client_360`

**ILC staff only.**
One client and all of their projects. ILC staff only.

| Argument | Type | Required | Notes |
| --- | --- | --- | --- |
| `clientId` | string |  |  |
| `name` | string |  |  |

### `get_calibration`

**ILC staff only.**
How the budget engine is performing against real figures: which rates are drifting, and which budget lines look like they are priced off the wrong thing. ILC staff only — this is the pricing engine talking about itself, and it is never available to a client or an outside caller.

| Argument | Type | Required | Notes |
| --- | --- | --- | --- |
| `view` | string |  | one of: drift, drivers, both |
| `buildingType` | string |  |  |
| `serviceType` | string |  |  |
| `projectType` | string |  |  |
| `client` | string |  |  |
| `lineKey` | string |  |  |

### `get_commitments`

**ILC staff only.**
Everything ILC owes somebody, and everything somebody owes ILC, in one list. Composed from the four places obligations are actually recorded — internal tasks, confirmed follow-ups out of meeting and sales notes, the next step on a live deal, and open RFIs. There is no separate commitments table; closing an item on its own screen removes it from here. ILC staff only.

| Argument | Type | Required | Notes |
| --- | --- | --- | --- |
| `clientId` | string |  | only commitments that trace back to this company |
| `projectId` | string |  | only commitments on this job |
| `ownerId` | string |  | only commitments owned by this ILC user |
| `direction` | string |  | one of: WE_OWE_THEM, THEY_OWE_US, FOLLOW_UP |
| `status` | string |  | one of: open, overdue, all |
| `limit` | integer |  | min 1, max 200 |

## How to call it

Standard MCP over JSON-RPC 2.0 at `/api/mcp`, with your key as a bearer token:

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call",
 "params":{"name":"search","arguments":{"query":"The Approach"}}}
```

`initialize`, `tools/list` and `ping` work as the protocol specifies. `tools/list`
returns only the tools you are allowed to call, so it is the honest list for you
specifically — shorter than the one above if your key is not an ILC one.

Keys are issued per person under **ILC Admin → AI Access Keys**, and a key never
shows more than the person it belongs to could already see in the app.
