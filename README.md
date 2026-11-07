<p align="center">
  <img src="docs/banner.svg" alt="Binge W Me — Your people. One screen." width="100%" />
</p>

<p align="center">
  <a href="https://github.com/havioo/bingewme/actions/workflows/ci.yml"><img src="https://github.com/havioo/bingewme/actions/workflows/ci.yml/badge.svg" alt="Build and tests" /></a>
  <a href="https://github.com/havioo/bingewme/commits/main"><img src="https://img.shields.io/github/last-commit/havioo/bingewme?style=flat-square&amp;color=e7ff66&amp;labelColor=171a13" alt="Last commit" /></a>
  <a href="https://github.com/havioo/bingewme"><img src="https://img.shields.io/github/languages/top/havioo/bingewme?style=flat-square&amp;color=c5b0ec&amp;labelColor=171a13" alt="Primary language" /></a>
  <a href="https://github.com/havioo/bingewme/issues"><img src="https://img.shields.io/github/issues/havioo/bingewme?style=flat-square&amp;color=f3a5cc&amp;labelColor=171a13" alt="Open issues" /></a>
</p>

# Different sofas. Same moment.

**Binge W Me** is a no-signup watch-party app for the group chat that actually wants to watch something. Create a room, send your people the link, and bring your own video. Playback, chat, reactions, and live annotations share one space.

Every room starts empty. Every new room gets a five-digit code, like **48271**, and a matching `/party/48271` link. Friends can type the code or paste the link on the homepage.

Codes are reserved by the room server so active rooms cannot collide. Copy the code directly from the room header or invite panel. Unclaimed codes expire after five minutes. Temporary rooms close when their last guest leaves; enable persistence in Settings to retain the room. Existing longer invite links remain supported.

[Get started](#run-locally) · [Features](#inside-the-room) · [Deploy](#deploy) · [Current boundaries](#current-boundaries)

## Inside the room

| Feature                           | What it does                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Create & join**                 | Generate a unique room link or join with an existing link/code. Set an optional display name and leave a room from its header.                          |
| **Watch in sync**                 | Share YouTube and native-video play/pause, seeking, and playback speed. Correct timestamp drift above 1.5 seconds or request an immediate resync.       |
| **Bring your own media**          | Share direct video/audio URLs, HLS, local uploads, screen sharing, YouTube, Twitch streams/VODs, Vimeo, and supported public video webpages.            |
| **Your people, live**             | Room-scoped chat, floating emoji reactions, and a GIF picker. Add a server-side Giphy key for live GIF search.                                          |
| **Draw on the moment**            | Annotate the screen with normalized canvas strokes broadcast to the room. Pick a brush color, clear your canvas, and let marks fade after four seconds. |
| **Keep the remote under control** | Enable host-only playback controls or vote before pausing. Pause ballots last five seconds and require a majority.                                      |
| **Keep watching**                 | Reorder and remove queued media, vote to skip, preview native-video frames while seeking, and boost uploaded/screen-share audio up to 3×.               |
| **Make it yours**                 | Choose an accent and generate coordinated surfaces, borders, and text. Button foregrounds adapt for contrast; your palette persists in the browser.     |
| **Take a sofa seat**              | Share camera and microphone independently in the chat's live sofa grid. Late joiners receive active feeds; each viewer controls per-person volume.      |
| **Keep the room**                 | Optional passcodes, SQLite-backed persistent rooms, saved ownership, durable browser-identity bans, and a People moderation dashboard.                  |
| **Your room's signature**         | Upload a background and image emote pack, define chat badges, and project GIFs or custom emotes over the video.                                         |
| **Your reactions**                | Search emojis and skin tones, save personal favorites, and use the first five favorites as your quick-reaction buttons.                                 |

### YouTube that follows the room

YouTube uses the IFrame Player API for shared play/pause, seeking, playback speed, timestamp correction, and late-join synchronization. The room toolbar and YouTube's own controls both publish playback changes. Watch links, short links, Shorts, live links, and embedded links are recognized.

If the browser blocks audible autoplay, the player tries muted playback to stay in sync and displays **Enable sound**. Some browsers can still require one tap to start playback on a device; the app exposes that action without changing the whole room's playback state. Embedding-disabled or unavailable videos show an error in the player. See [YouTube's API and autoplay events](https://developers.google.com/youtube/iframe_api_reference).

### A palette that follows your color

Pink should feel pink all the way through. The theme engine derives a low-saturation palette from your chosen hue and adjusts foreground colors for readability. Its tests check text contrast against every generated surface, including near-black and near-white accents. Reduced-motion preferences are respected, and interface animations use transforms and opacity.

### The sofa is shared, not just a preview

The sidebar's **virtual sofa** delivers camera and microphone tracks to other participants over WebRTC, separately from the main screen share. It remains mounted when switching chat, queue, people, or settings tabs. Camera and microphone can be enabled independently. Local previews are muted to avoid feedback; viewers control each person's volume and get an explicit playback button if their browser blocks autoplay. New guests automatically receive active publishers.

Rooms allow up to **100 participants** and **12 simultaneous sofa publishers**. Camera capture requests 640×360 at 20 fps to keep video chat lighter than the main screen share. Each publisher sends a separate stream per viewer: small groups are the intended use, and larger broadcasts need an SFU. Spatial audio and active speech meters are not implemented.

### Keep a room, protect the door

**Settings → Room access** enables persistence and an optional passcode. Persistent room codes, ownership, moderator roles, bans, chat/mic restrictions, link queues, backgrounds, badges, and emotes are stored in SQLite. Restored playback starts paused. Passcodes use random salts and scrypt; plaintext passcodes are not stored. Chat history remains ephemeral.

The **People** dashboard supports kick, ban, unban, chat mute, mic mute, moderator assignment, and host transfer. Permissions are checked on the server. Hosts assign moderators and transfer ownership; hosts and moderators manage viewers and branding.

Identity is a random token saved in the browser. Ownership and bans survive server restarts for that identity. **These are not account-based bans:** clearing browser storage or using a fresh browser can evade a ban. Clearing the owner's token also loses that browser's ownership credential. Preserve the owner's browser data and use passcodes for sensitive rooms.

### Make it look like your group chat

Moderators can upload a room background, define up to 16 text/emoji badges, and add up to 24 image emotes. Guests choose a badge from the room pack. Emotes and Giphy images can appear as shared four-second overlays on the main video. New emoji favorites appear first; the first five replace the default quick reactions. Favorites are saved on the device.

Backgrounds accept PNG, JPEG, WebP, or GIF up to **2 MiB**. Emotes accept those formats up to **512 KiB** each. Image signatures are checked; SVG and HTML are not accepted. Branding assets live beside the room database and need the same durable storage.

### Media support at a glance

| Source                                     | Playback                                                | Room synchronization                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Direct MP4, WebM & browser-supported audio | Native player                                           | Shared playback controls and drift correction                                                                          |
| HLS / `.m3u8`                              | Native HLS when available; lazy-loaded HLS.js otherwise | Native-player synchronization                                                                                          |
| Local file                                 | Temporary upload with HTTP range streaming              | One upload; guests stream the same file with shared playback controls                                                  |
| Screen share                               | Browser capture over WebRTC                             | One live broadcast; system audio depends on the browser and capture source                                             |
| YouTube                                    | YouTube IFrame Player API                               | Shared playback, seek, speed, drift correction, and late joins                                                         |
| Twitch streams / VODs                      | Official interactive embed                              | Room play/pause, VOD seeking, and late joins; live streams are not seekable                                            |
| Twitch clips                               | Official clip iframe                                    | Twitch does not provide the interactive stream/VOD API for clips                                                       |
| Vimeo                                      | Official SDK with native control bar disabled           | Shared play/pause, seek, supported playback speeds, and late joins; unlisted access hashes are preserved               |
| Public video webpages                      | HTML inspection, then bounded Chromium execution        | Detects public MP4/WebM/HLS requests behind supported JavaScript players; adds the detected source to the shared queue |

Local files are uploaded once to temporary storage on the room server. Guests stream or seek the same file without choosing their own copy. Animated upload progress shows transferred bytes, percentage, speed, ETA, and cancellation. Uploads stream to disk rather than buffering the whole file in server RAM; large uploads are not duplicated in browser IndexedDB.

The default limit is **10 GiB** (`10737418240` bytes), configurable with `MAX_UPLOAD_BYTES`. Hosting request, duration, disk, and bandwidth limits still apply, and file extensions do not guarantee browser codec support. An actual 10 GiB transfer is not part of the test suite. Local uploads are removed when the room empties and after server restarts, even in persistent rooms. Persistent queues restore URL entries rather than temporary uploads.

Invite links open a name-entry screen before joining. Guests can reuse a saved name, choose a new one, or join as Guest. Joining with a code uses the name entered on the homepage, and names can be changed inside Room Settings without disconnecting.

## Run locally

Requires **Node.js 24+** and npm. The repository includes `.nvmrc` for version managers.

```sh
git clone https://github.com/havioo/bingewme.git
cd bingewme
npm ci
npm run dev
```

Open **http://localhost:5173**, choose **Create new room**, then copy the invite link for your guests. To join another room, paste its link or code on the home screen. Open the same invite in another browser to try synchronized playback.

The dev command starts Vite on port `5173` and the room server on `3001`. Vite proxies `/socket.io` and `/api` to the server. Other devices can use the network URL printed by Vite; screen capture, microphone, and camera require HTTPS outside localhost.

## Deploy

Binge W Me ships as **one Node service**: Express serves the built frontend and Socket.io handles the live room connection on the same port.

### Vercel frontend + room server

The included `vercel.json` configures the Vite build and rewrites `/party/<code>` to the React app, so creating, joining, and refreshing room links work on Vercel. API and asset paths are not rewritten to HTML.

**Deploying the Vite frontend does not start `server/index.js`.** With the current in-memory room implementation, use one running Node service for room coordination. Vercel's WebSocket support alone does not share in-memory rooms across function instances; an all-Vercel backend would also need distributed room state and pub/sub coordination.

To keep the frontend on Vercel:

1. Deploy this repository as a Node web service. The included Render Blueprint preconfigures its build command and health check:

   [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/havioo/bingewme)

2. On that service, set `FRONTEND_ORIGINS` to your exact frontend origin, such as `https://binge.axryn.xyz`. Separate multiple origins with commas. The Blueprint already allows that domain.
3. In Vercel → Project → Settings → Environment Variables, add `VITE_ROOM_SERVER_URL` with the Node service's HTTPS URL. Use the service origin without an API path.
4. Redeploy Vercel. The public backend URL is included at build time; changing it requires a fresh build.

Visit the Node service's `/api/health` endpoint to check that it returns `{"status":"ok"}`. The free Blueprint is intended for trying the app; idle spin-downs or service restarts can end temporary rooms. Alternatively, host the entire app on the Node service and point your domain there; then no separate frontend/backend URL setting is needed.

### Durable storage

Set `ROOM_DATABASE_PATH` to a SQLite file on a durable disk, for example `/var/data/bingewme/rooms.sqlite`. Custom image assets are stored in `/var/data/bingewme/assets` beside it. The local default is `data/rooms.sqlite`; that directory is ignored by Git.

**Setting a path does not make an ephemeral filesystem durable.** Render's default filesystem loses changes on restarts/redeploys; persistent disks currently require a paid Render service. You can instead use infrastructure where you already have durable storage. See [Render's persistent disk documentation](https://render.com/docs/disks). The free Blueprint does not provision a disk or TURN server.

Run one room-server instance. SQLite persists room data, but live membership, signaling, and playback coordination still live in process memory. Horizontal scaling requires shared live state/pub-sub and a different storage topology.

### WebRTC connectivity

WebRTC itself has no subscription fee. The app tries direct connections using STUN. Some device/network combinations require a TURN relay; use an existing relay, a managed provider, or self-host the free [coturn](https://github.com/coturn/coturn) server. Relay hosting and bandwidth can have costs. Deploying the app does not automatically provision a relay.

Configure backend `TURN_URLS` with your relay's actual URLs, separated by commas, plus `TURN_USERNAME` and `TURN_CREDENTIAL`. Include the provider's UDP, TCP, and TLS options. Rejoin after changing the configuration; never commit credentials. A failed connection is not proof that TURN is the cause: **Copy connection details** exposes ICE/DTLS states and frame counters without raw IP addresses, SDP, or relay secrets.

See [Vercel's Vite routing documentation](https://vercel.com/docs/frameworks/frontend/vite) and [WebSocket state guidance](https://vercel.com/docs/functions/websockets) for the deployment behavior behind this setup.

### Single Node service

Set the runtime to Node.js 24 or later, then use:

| Setting        | Value                                           |
| -------------- | ----------------------------------------------- |
| Build command  | `npm ci && npm run build`                       |
| Start command  | `npm start`                                     |
| Port           | `PORT` from the environment; defaults to `3001` |
| Instance count | One instance while room state lives in memory   |
| Transport      | HTTPS with WebSocket upgrades enabled           |

```sh
npm ci
npm run build
npm start
```

The app is available at **http://localhost:3001**. The same server handles direct visits to `/party/<code>`. Deploy the Node service rather than only uploading `dist` to static hosting. Keep `server/`, `dist/`, package files, and installed production dependencies together.

### Docker

The multi-stage image builds the frontend, removes development dependencies, installs system Chromium for page extraction, and runs the app as a non-root user. Mount `/app/data` as a durable volume to retain the SQLite database and branding assets. Docker execution is not part of the automated test suite.

```sh
docker build -t bingewme .
docker run --rm --init -p 3001:3001 --env-file .env bingewme
```

Create `.env` from `.env.example` first, or omit `--env-file .env` to use the defaults. Place the container behind your HTTPS reverse proxy and forward WebSocket upgrades to the same service.

### Environment

The Node service needs writable temporary disk space for uploaded media. Set `MAX_UPLOAD_BYTES` to adjust the per-file limit (default `10737418240` bytes / 10 GiB). Provider request-size, disk, bandwidth, and proxy timeout limits still apply. Uploads use the Node service directly when `VITE_ROOM_SERVER_URL` is set, so video bytes do not pass through the Vercel frontend.

For split hosting, set `VITE_ROOM_SERVER_URL` on the frontend before building and `FRONTEND_ORIGINS` on the Node server. Both are public URL settings. Leave them empty when hosting the whole app on one Node service.

| Variable                                        | Required               | Purpose                                                                                                        |
| ----------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| `PORT`                                          | No                     | HTTP and Socket.io listening port. Default: `3001`.                                                            |
| `GIPHY_API_KEY`                                 | No                     | Enables live Giphy search on the server. Without it, the picker searches a small curated collection.           |
| `ROOM_DATABASE_PATH`                            | For durable rooms      | SQLite file on durable storage; default `data/rooms.sqlite`.                                                   |
| `MAX_UPLOAD_BYTES`                              | No                     | Upload limit; default `10737418240`.                                                                           |
| `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` | When a relay is needed | Authenticated TURN configuration on the backend.                                                               |
| `PUPPETEER_EXECUTABLE_PATH`                     | No                     | Custom Chromium executable for page extraction. Linux Chromium is bundled; Windows uses installed Chrome/Edge. |

Pass variables through your hosting provider or container environment. For a local server with an `.env` file, use `node --env-file=.env server/index.js` after building. Keep the Giphy key on the server; it is never a frontend build variable. `.env` files are ignored by Git.

## Under the hood

```text
src/
  components/
    RoomLobby.tsx          Create and join rooms
    RoomEntry.tsx          Choose a name before opening an invite
    player/                Media engine and playback controls
    canvas/                Live canvas annotations
    chat/                  Reactions and GIF picker
  hooks/useWebRTCSync.ts    Socket events and WebRTC signaling
  lib/                     Room codes, theme generation, file staging
  styles/                  Brutalist layout and adaptive theme tokens
  store.ts                 Typed Zustand application state
server/index.js            HTTP routes, rooms, votes and signaling
server/room-media.js       Room-scoped temporary uploads and range streaming
tests/                     Rendering, room isolation and palette checks
```

**Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Lucide and Zustand. **Live layer:** Socket.io and native WebRTC. **Media:** HTML video, HLS.js, official platform SDKs, and IndexedDB. **Storage:** SQLite. **Page extraction:** Puppeteer with Chromium. Heavy SDKs, HLS, the emoji picker, and extraction load on demand.

`server/room-store.js` owns persistence and passcode hashing; `room-management.js` enforces moderation, queue ordering, votes, and overlays; `room-assets.js` handles branding images. `useSofaMedia.ts` and `SofaRoom.tsx` deliver live camera seats. Player adapters, native seek previews, audio boosting, fullscreen handling, and connection diagnostics remain separate modules.

## Checks that travel with the code

```sh
npm run format:check
npm run build
npm test
```

GitHub Actions runs these checks on pushes to `main` and on pull requests. The badges above reflect the repository's current workflow status, commit history, language mix, and open issues.

Tests cover room codes, invite names, empty rooms, queue updates, late joiners, authenticated uploads, HTTP ranges, cleanup, room isolation, chat, host locking, drift correction, autoplay, passcode hashing, persistence across process restarts, durable bans, moderation permissions, skip votes, branding, browser extraction, WebRTC screen/camera signaling, real generated-stream transport, fullscreen fallbacks, emoji favorites, and theme contrast. Browser transport tests use generated media; they do not replace physical iPad Safari testing or certify arbitrary third-party sites.

## Current boundaries

The core watch-room experience is implemented. These limits matter when choosing how to deploy and use it:

- **Source extraction:** public, unencrypted webpages only, on a best-effort basis. The browser fallback does not copy cookies, sign into sites, solve anti-bot challenges, extract DRM keys, or decrypt subscription streams. Capacity pages, access restrictions, expiring URLs, hotlink checks, and missing CORS can prevent playback. A copied `blob:` URL is not a transferable video address.
- **Network and scale:** TURN is configurable but not provisioned. Media is a mesh, without an SFU or certified large-room capacity. Screen capture requests 1080p/60 fps and favors maintaining frame rate by adapting resolution; source, device, bandwidth, and viewer count determine the delivered frame rate.
- **Platform behavior:** Twitch has no documented chromeless embed mode, and clips lack its interactive SDK. Vimeo speed changes and hiding provider UI depend on provider permissions. Browser autoplay, fullscreen, codec support, and per-element volume vary by device.
- **Native extras:** hover frame previews apply to native video files, not HLS or provider iframes. Web Audio boosting supports uploaded media and screen shares, not cross-origin provider iframes.
- **Persistence and identity:** durable storage must be mounted. Chat, current membership, screen/camera streams, and uploaded movies are not persisted. Browser-token bans do not prevent a person from returning with a fresh identity.

Automated checks establish specific behaviors, not universal browser compatibility or production load capacity. Test the devices and deployment limits you intend to support.

---

<p align="center"><strong>Less scrolling. More together.</strong><br/><sub>Bring the movie. Bring your people.</sub></p>
