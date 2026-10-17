# Developing in GitHub Codespaces

The dev machine now lives in the cloud. Any laptop, or a browser on someone else's laptop, becomes a full ILC dev environment in about two minutes, with nothing installed locally and no files to move. Laptop migrations stop being a thing.

**What does NOT change:** production still deploys through Amplify from `main`, exactly as before. All deploy rules in `CLAUDE.md` apply unchanged, a codespace replaces the *laptop*, not the pipeline. `npm run deploy` is just as forbidden from a codespace as from a laptop.

---

## One-time setup (per person, ~5 minutes)

1. **Add your two secrets** at github.com → your avatar → **Settings → Codespaces → Codespaces secrets** → New secret:
   - `ANTHROPIC_API_KEY`, the team API key (get it from Mike in person or via password manager, never chat/email)
   - `JWT_SECRET`, the shared team value

   For each secret, under **Repository access** select `OperationsILC/ilc-lighting-app`. These inject as environment variables, codespaces have **no `.env` file at all**.

2. **Check billing.** Personal accounts get 60 core-hours + 15GB/month free. If the org wants to pay instead: org Settings → Codespaces → enable for members with a spending limit.

## Daily use

1. github.com → `OperationsILC/ilc-lighting-app` → green **Code** button → **Codespaces** tab → **Create codespace** (pick your branch).
2. First creation takes a few minutes (installs deps, creates a fresh seeded database). Reopening an existing codespace takes seconds.
3. Start the app: `npm run dev:codespace` (this is the Linux equivalent of `dev:3000`, clears the port first). Never plain `npm run dev`, same rule as Windows, different command.
4. The forwarded port 3000 opens in your browser automatically. Log in with the seeded admin.
5. **Claude Code:** open the terminal → `npm i -g @anthropic-ai/claude-code` → `claude` → sign in. Once per codespace.

## Your database and files in a codespace

A fresh codespace has a **seeded, empty-ish database**, not your laptop's projects. Each codespace keeps its own `prisma/dev.db` and `uploads/` for as long as the codespace exists (they survive stops; they die when the codespace is deleted, default 30 days idle).

**Want your real projects in a codespace?** In VS Code's file explorer (in the codespace), drag-and-drop your laptop's `dev.db` onto the `prisma/` folder and your zipped `uploads/` into the repo root, then unzip. Same files, same places as a laptop.

**Rule of thumb from `MACHINE_SETUP.md` still applies:** pick ONE home for work that depends on local files (drawing-parsing tests, vision work). A codespace is a fine home for it, arguably better, since it's reachable from every machine.

## Gotchas

| Thing | In a codespace |
|---|---|
| `dev:3000` | Won't run (it's PowerShell). Use `dev:codespace` |
| `.env` | Doesn't exist. Secrets are env vars from GitHub; non-secrets are set in `.devcontainer/devcontainer.json` |
| Emails/notifications | `NOTIFY_DRY_RUN=true` is forced in the container env, a codespace can never accidentally notify a human |
| `npm run build` | Works, same 13-asset runtime check. Chromium PDF generation actually works *better* here (Linux, same as the Lambda) |
| Schema changes | Same rule as everywhere: additive only, never edit `prisma/schema.prisma` unilaterally |
| Deploys | Only from Mike's explicit "Deploy", only after the full pass, never from a codespace as a test |
