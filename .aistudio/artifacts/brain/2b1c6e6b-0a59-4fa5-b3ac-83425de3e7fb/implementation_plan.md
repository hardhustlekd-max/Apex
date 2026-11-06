# Investigation & Fix Plan: Resolve Blank Page on Vercel Deployment

## Executive Summary
An in-depth codebase audit of the production build (`npm run build`), Vite bundling configuration, and Vercel routing rules reveals why the application renders a completely blank page when deployed to Vercel:

1. **Fatal Bundle Collision (Node Modules Leaked into Browser Bundle)**:
   In `src/components/MatchDetailModal.tsx` (line 24), `OnDemandParser` is imported directly into a client-side React component.
   `OnDemandParser.ts` imports `db.ts`, which imports Node's `fs` and `path` modules and `@libsql/client`.
   Because Vite was configured with `build.rollupOptions.external = ['playwright', 'fs', 'path']`, Vite treated Node's `fs` and `path` as runtime browser externals instead of inlining or erroring out.
   Consequently, Vite emitted native Node import statements directly into `dist/assets/index-*.js`:
   ```javascript
   import b5 from "fs";
   import ph from "path";
   ```
   When any modern browser (Chrome, Safari, Edge, Firefox) loads this bundle, it throws an uncaught syntax error:
   `TypeError: Failed to resolve module specifier "fs". Relative references must start with either "/", "./", or "../".`
   This immediately halts JavaScript execution before React can mount or even trigger the `<ErrorBoundary>`, resulting in a completely blank white screen.

2. **Vercel Routing & Static Asset Handling in `vercel.json`**:
   The current `vercel.json` rewrites all non-API paths via:
   ```json
   {
     "source": "/((?!api/).*)",
     "destination": "/index.html"
   }
   ```
   This catch-all rewrite intercepts `/assets/(.*)` if static files aren't handled cleanly by the framework preset. We will ensure clean Vercel configuration for static Vite output.

3. **Client-Side Safe Data Access for On-Demand Match Detail**:
   `MatchDetailModal.tsx` only needed `OnDemandParser` to fetch match statistics and scores. The backend already exposes `GET /api/fixtures/:id`, and `EngineService.getMatchDetail(fixtureId)` already exists for client consumption. Moving this call through `EngineService` completely severs the client from the server database, keeping `db.ts`, `fs`, `path`, and `@libsql/client` purely on the backend.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The architectural fix strictly adheres to client-server separation:
> - **Client Isolation**: The browser React bundle must NEVER import `db.ts`, `onDemandParser.ts`, or any file referencing Node.js built-ins (`fs`, `path`).
> - **API Boundary**: All dynamic match detail parsing remains server-side behind `/api/fixtures/:id`. The frontend will call `EngineService.getMatchDetail(id)` instead of running `OnDemandParser` in the browser.
> - **Clean Vite Rollup Config**: Remove Node `external` declarations from client `vite.config.ts` so that any accidental Node module imports fail fast at build time rather than silently breaking the user's browser.

---

## Step-by-Step Implementation Blueprint

### Step 1: Client Decoupling in `src/components/MatchDetailModal.tsx`
- Remove `import { OnDemandParser } from '../core/onDemandParser.js'`.
- In `MatchDetailModal.tsx`'s `useEffect`, replace `OnDemandParser.getParsedMatch(fixture.id)` with `EngineService.getMatchDetail(fixture.id)`.
- Use the enriched statistics and scores returned by `getMatchDetail`.

### Step 2: Clean `vite.config.ts`
- Remove `external: ['playwright', 'fs', 'path']` from the client Vite rollup configuration.
- Add `@` and client aliases if needed. Ensure Vite bundles pure browser-compatible code.

### Step 3: Align `vercel.json` Configuration
- Ensure `vercel.json` properly serves static assets in `dist` or root while delegating `/api/*` to `/api/index.ts`.
- Ensure clean fallback headers.

### Step 4: Verification & Smoke Test
- Run `npm run build` to compile both the client SPA bundle and the server bundle.
- Verify `dist/assets/index-*.js` contains **zero** `import ... from "fs"` or `import ... from "path"`.
- Verify the generated client bundle evaluates cleanly without syntax errors or unhandled exceptions.
- Run `lint_applet` and `compile_applet`.

```
┌─────────────────────────────────────────────────────────────┐
│                    BROWSER (CLIENT BUNDLE)                  │
│   src/main.tsx -> src/App.tsx -> Components                │
│   (Pure React, Tailwind, Lucide, Client Services)          │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS / JSON
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                  VERCEL SERVERLESS / API ROUTE              │
│   api/index.ts -> src/app.ts -> Routers                     │
│   (OnDemandParser, FlashscoreScraper, Turso DB, SQLite)     │
└─────────────────────────────────────────────────────────────┘
```
