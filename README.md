# DJ Live Runtime

This repository contains the live DJ surface for the show-control stack.
It is meant to run locally on the show machine first, with a fixed Vite port
and a fixed backend target.

## Local Runtime

- Local DJ port: `4301`
- Show-control HTTP endpoint: `http://localhost:4300`
- Show-control WebSocket endpoint: `ws://localhost:4300/ws`

The dev server and preview server both bind to `4301`, stay on that port,
and run with HMR disabled. For show-day use, prefer running locally on the
machine that is physically connected to the show-control backend.

## Commands

1. `npm install`
2. `npm run dev`
3. `npm run build`
4. `npm run preview`

`npm run dev` starts the live DJ surface on `http://localhost:4301`.
`npm run preview` serves the production build on the same port for local
verification.

## Show-Control Connection

The DJ page talks to the local show-control backend over HTTP and WebSocket.
When the backend is reachable, the page can publish show-control state and
audio frames. When it is not reachable, the DJ UI should still load and run
locally; only show-control publishing is disabled.

## Deployment

This app can be deployed to Vercel only as an independent static DJ page.

- `localhost:4300` always points to the visitor's own machine, not the live
  show machine.
- A Vercel deployment will not automatically connect to the live show-control
  backend.
- For any remote deployment, set `VITE_SHOW_BACKEND_URL` and
  `VITE_SHOW_WS_URL` to a public, reachable show-control backend.

## Environment

The checked-in `.env.example` includes the local defaults used by the live DJ
surface. Keep the show-control URLs pointed at the local backend for local
show operation, and only override them when you intentionally deploy against a
remote backend.

Relevant variables:

- `GEMINI_API_KEY`
- `APP_URL`
- `VITE_SHOW_TRANSPORT`
- `VITE_SHOW_BACKEND_URL`
- `VITE_SHOW_WS_URL`
- `VITE_SHOW_ID`
