# MangroveGuard

A coastal mangrove monitoring platform that turns field scans into actionable
stability assessments. The system pairs a mobile YOLOv8-based vision pipeline
with a live web dashboard for conservation teams to review observations,
monitor activity, and trigger intervention protocols.

## Features

- React dashboard with field activity, stability trends, observation logs, and
  intervention protocols.
- Express backend that serves scan data, persists observations to disk, and
  streams updates over Server-Sent Events.
- YOLOv8 integration from a Flutter mobile client that captures and
  classifies mangrove scans in the field.
- Dockerized deployment with a persistent data volume.

## System Architecture

```
Flutter Mobile App          Web Dashboard (this repo)
+---------------------+     +----------------------------+
| Camera capture      |     | React + Vite SPA           |
| YOLOv8 inference    | --> | (Dashboard, Logs, Calendar)|
| Stability scoring   |     +----------------------------+
+----------+----------+                 ^
           |                            | GET /api/scans
           |  POST /api/scans           | GET /api/scans/events (SSE)
           v                            |
+----------------------------------------------+
| Express server (server.js)                   |
| - JSON file persistence in /app/data         |
| - REST endpoints + SSE stream                |
+----------------------------------------------+
```

### Components

- **React frontend** (`src/`) — Vite + React 18 SPA with sections for the
  stability index chart, field monitoring card, observation logs, and a
  calendar view. Uses plain CSS (no UI framework) and Server-Sent Events for
  live updates.
- **Express backend** (`server.js`) — REST API (`/api/scans`) and a live
  event stream (`/api/scans/events`) backed by a JSON file store under
  `/app/data`. Serves the built frontend in production.
- **Flutter mobile client (YOLOv8)** — separate repository. Captures photos
  in the field, runs YOLOv8 inference to assess mangrove stability, and
  POSTs results to the Express backend.

## Local Setup

### Prerequisites

- Node.js 20+ (Node 22 recommended, matches the Dockerfile)
- npm

### Install and run (development)

```bash
npm install
npm run dev          # Vite dev server on http://localhost:5173
```

The dev server proxies API calls to the Express backend. In another terminal
start the backend, which also serves scan data and the SSE stream:

```bash
npm start            # Express on http://localhost:8080
```

### Production build

```bash
npm run build        # outputs static assets to dist/
npm start            # serves dist/ + API on http://localhost:8080
```

## Docker

The repository includes a multi-stage `Dockerfile` and a `docker-compose.yml`
that exposes the app on port `8080` and persists scan data in a named volume.

```bash
docker compose up -d --build
```

Then open http://localhost:8080.

To stop and remove the containers:

```bash
docker compose down
```

The scan data volume (`dashboard-data`) is preserved across container
restarts. Pass `-v` to `docker compose down` to also remove the volume.

## Project Layout

```
mangroveguardweb/
  src/             React application (App.jsx, components, CSS)
  server.js        Express API + SSE stream
  index.html       Vite entry point
  styles.css       Global styles
  Dockerfile       Multi-stage build
  docker-compose.yml
  vite.config.js
```

## API Reference

- `GET  /api/scans` — list all recorded scans.
- `POST /api/scans` — record a new scan from the Flutter client.
- `GET  /api/scans/events` — Server-Sent Events stream of scan updates.

## License

[MIT](./LICENSE)
