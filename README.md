<img width="1236" height="288" alt="image" src="https://github.com/user-attachments/assets/f2b49d31-f41f-4de2-a6ed-7d48b10a4602" /># 🎬 Watch Party

> A real-time, synchronized video watching platform built with **React**, **Node.js**, **Express**, **Socket.IO**, and **MongoDB**. Watch videos together with friends across rooms with synchronized playback, live chat, interactive emoji reactions, collaborative playlists, and real-time polls.

[![Frontend Deployed on Vercel](https://img.shields.io/badge/Frontend-Vercel-black?logo=vercel)](https://watch-party-rlope6gvr-ash-c968.vercel.app)
[![Backend Deployed on Render](https://img.shields.io/badge/Backend-Render-46E3B7?logo=render)](https://watch-party-p7ix.onrender.com)
[![Database MongoDB Atlas](https://img.shields.io/badge/Database-MongoDB%20Atlas-47A248?logo=mongodb)](https://www.mongodb.com/atlas)
[![License ISC](https://img.shields.io/badge/License-ISC-blue.svg)](backend/package.json)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Implemented Features](#2-implemented-features)
3. [Project Structure](#3-project-structure)
4. [Prerequisites](#4-prerequisites)
5. [Run the Project on One Laptop (Local Setup)](#5-run-the-project-on-one-laptop-local-setup)
6. [Run on Multiple Laptops on the Same Wi-Fi Network (LAN)](#6-run-on-multiple-laptops-on-the-same-wi-fi-network-lan)
7. [Run on Multiple Devices Across Different Networks (Online Deployment)](#7-run-on-multiple-devices-across-different-networks-online-deployment)
8. [Environment Variables Reference](#8-environment-variables-reference)
9. [Common Errors and Troubleshooting](#9-common-errors-and-troubleshooting)
10. [Testing Checklist](#10-testing-checklist)
11. [GitHub Submission & Workflow](#11-github-submission--workflow)

---

## 1. Project Overview

**Watch Party** allows groups of users to watch HTML5 videos in perfect synchronization regardless of physical location. A room host creates a private room identified by a unique 6-character code, shares the code or invite link with friends, and controls shared playback.

### How It Works

- **Room Creation & Joining**: A user enters a display name (2–24 characters) and creates a room. The backend generates a unique 6-character alphanumeric code (e.g., `ABC123`) and records room metadata in MongoDB. Other participants join using this code or by opening a shared invite link (`/?room=ABC123`).
- **Synchronized Video Playback**: The host controls play, pause, seek, and video changes. The backend server tracks the shared playback state (`isPlaying`, `currentTime`, `lastUpdated`, `videoUrl`). When the host performs an action, the server broadcasts an authoritative playback state to all participants in the room. Client video players automatically calculate time drift and adjust playback to keep all viewers in sync.
- **Architectural Roles**:
  - **React 19 (Frontend)**: Single-Page Application (SPA) built with Vite. Renders the streaming player interface, collapsible sidebar with navigation tabs (Chat, Playlist, Poll, People), video overlay reactions, and real-time connection badges.
  - **Node.js & Express 5 (Backend)**: Provides the HTTP server, CORS middleware, and diagnostic health check endpoints (`/health` and `/api/health`).
  - **Socket.IO 4.8 (Real-Time Communication)**: Manages bi-directional WebSocket and HTTP long-polling communication, room isolation via Socket.IO rooms, and event broadcasting.
  - **MongoDB Atlas (Database)**: Persists persistent room metadata (room code, host username, status, timestamps) via Mongoose. Active room session states (participants, playlist queue, active poll, chat history) are coordinated in server memory for low-latency synchronization.

---

## 2. Implemented Features

Every feature listed below is verified and actively implemented in the codebase:

- [x] **Room Management**:
  - Unique 6-character room codes (`A–Z`, `2–9`).
  - Host assignment on creation; automatic host transfer to the next participant if the host disconnects.
  - Room capacity limit enforced on backend (`MAX_PARTICIPANTS = 10`).
  - Safe 60-second grace-period cleanup timer before empty disconnected rooms are destroyed.
  - Automatic participant session restoration on page reload (`reconnect_room`).
- [x] **Synchronized Video Playback**:
  - Host-only playback controls: Play, Pause, Seek bar, Skip 10s, Restart.
  - Drift compensation: non-host viewers synchronize automatically when drift exceeds threshold (>1.5s).
  - Host direct video URL change with instant room-wide synchronization.
  - Preloaded default video (`CC0 Flower demo video`).
- [x] **Live Real-Time Chat**:
  - Instant messaging with participant username and timestamp.
  - Multiline support (Enter to send, Shift+Enter for newline).
  - Input validation: max 500 characters, whitespace trimming, empty message prevention.
  - Server-side rate limiting (max 5 messages per 3 seconds per socket).
  - Unread message counter badge on navigation tab.
  - Auto-scroll to bottom with empty state message when chat is new.
- [x] **Ephemeral Floating Emoji Reactions**:
  - Six allowed reaction emojis: ❤️, 😂, 🔥, 👍, 😮, 👏.
  - Server validation of allowed emojis and rate limiting (max 10 reactions per 3 seconds).
  - Floating CSS animation over video player with automatic cleanup (3-second lifespan).
  - Full respect for user `prefers-reduced-motion` settings.
- [x] **Collaborative Playlist**:
  - Add video URLs with custom titles (up to 30 items per room).
  - Host and item creator can delete playlist items.
  - Host can reorder playlist items up or down.
  - Host can trigger immediate playback of any playlist item with one click.
- [x] **Interactive Room Polls**:
  - Host can create polls with a custom question and 2 to 6 options.
  - Real-time voting (one vote per participant, vote change permitted while open).
  - Live vote count and percentage calculation bars.
  - Host controls to close voting or delete the poll.
- [x] **Presence & Connection Status**:
  - Live participant counter (e.g., `2/10 online`).
  - Participant roster listing display names with host indicator crown/badge.
  - Real-time connection badge: `Connected` (green), `Connecting...` (amber), `Reconnecting...` (amber), `Disconnected` (red).
  - One-click **Copy Invite Link** button copying `https://<domain>/?room=<code>`.
- [x] **Deployment Diagnostics**:
  - Health check endpoints (`/health`, `/api/health`) reporting database connection state, active room count, and server uptime.
  - Safe startup and handshake error logging (`io.engine.on("connection_error")`) without leaking secrets.

---

## 3. Project Structure

```text
watch-party/
├── .gitignore               # Ignored files (node_modules, .env, dist, logs)
├── DEPLOYMENT.md            # Detailed Vercel and Render deployment guide
├── render.yaml              # Render blueprint specification for backend web service
├── README.md                # Project documentation (this file)
│
├── backend/                 # Node.js + Express + Socket.IO server
│   ├── .env                 # Local backend environment variables (gitignored)
│   ├── .env.example         # Template for backend environment variables
│   ├── package.json         # Backend dependencies and run scripts
│   ├── package-lock.json    # Exact backend dependency tree lockfile
│   ├── test_suite.js        # Automated integration test suite
│   └── src/
│       ├── server.js        # Main server entry: Express, Socket.IO, CORS, room logic
│       └── models/
│           └── Room.js      # Mongoose schema for persistent room metadata
│
└── frontend/                # React 19 + Vite client application
    ├── .env.example         # Template for frontend environment variables
    ├── index.html           # HTML entry point with meta tags and viewport settings
    ├── package.json         # Frontend dependencies and run scripts
    ├── package-lock.json    # Exact frontend dependency tree lockfile
    ├── eslint.config.js     # ESLint linting configuration
    ├── vercel.json          # Vercel SPA routing rewrite rules
    ├── vite.config.js       # Vite configuration with React plugin
    ├── public/
    │   ├── favicon.svg      # Watch Party SVG favicon
    │   └── icons.svg        # SVG sprite icons
    └── src/
        ├── main.jsx         # React DOM root mounting entry
        ├── App.jsx          # Primary UI container, socket event handling, tabs
        ├── App.css          # Application layout, navbar, panels, mobile styling
        ├── index.css        # Base styling, CSS variables, and design tokens
        ├── WatchPlayer.jsx  # HTML5 video player, custom controls, drift sync
        ├── WatchPlayer.css  # Video player controls and responsive video styling
        ├── assets/          # Static images and SVGs
        └── components/
            ├── ChatPanel.jsx       # Real-time chat UI, message list, input box
            ├── ChatPanel.css       # Chat panel layout, message bubbles, unread badge
            ├── EmojiReactions.jsx  # Floating emoji animation container & picker
            ├── EmojiReactions.css  # Keyframe animations for floating reactions
            ├── PlaylistPanel.jsx   # Playlist list, add form, reorder/delete controls
            ├── PlaylistPanel.css   # Playlist item layout and playback indicators
            ├── PollPanel.jsx       # Poll creation form, live voting bars, results
            └── PollPanel.css       # Poll options, vote percentages, badge styling
```

---

## 4. Prerequisites

Ensure the following software is installed on your computer before running the project:

| Software | Minimum Version | Purpose | Download Link |
| :--- | :--- | :--- | :--- |
| **Node.js** | `v18.0.0` or higher (LTS recommended) | JavaScript runtime for backend and frontend | [nodejs.org](https://nodejs.org/) |
| **npm** | `v9.0.0` or higher | Package manager bundled with Node.js | Installed with Node.js |
| **Git** | `v2.30.0` or higher | Version control system | [git-scm.com](https://git-scm.com/) |
| **MongoDB Atlas** | Cloud cluster (free tier M0) | Database for room metadata persistence | [mongodb.com/atlas](https://www.mongodb.com/atlas) |
| **Web Browser** | Latest stable | Modern browser supporting WebSockets and HTML5 video | Chrome, Edge, Firefox, Brave |

### How to Verify Node.js and npm Installation

Open Windows PowerShell or Command Prompt and run:

```powershell
node -v
npm -v
git --version
```

You should see output similar to:
```text
v20.18.0
10.8.2
git version 2.45.0.windows.1
```

If `node` is not recognized, re-run the Node.js installer and ensure the option **"Add to PATH"** is selected.

---

## 5. Run the Project on One Laptop (Local Setup)

Follow these exact steps to run both the frontend and backend locally on a single Windows laptop.

### Step 1: Clone the GitHub Repository

Open Windows PowerShell or Command Prompt and clone the repository:

```powershell
git clone https://github.com/AshmitSenapati/Watch-Party.git
cd Watch-Party
```

Alternatively, open the `Watch-Party` folder in **VS Code** (`File` > `Open Folder...`).

---

### Step 2: Configure & Start the Backend (Terminal 1)

1. Open **Terminal 1** in the project root:
   ```powershell
   cd backend
   ```

2. Install backend dependencies:
   ```powershell
   npm install
   ```

3. Create the backend `.env` configuration file:
   ```powershell
   Copy-Item .env.example .env
   ```
   *(On Command Prompt, use `copy .env.example .env`)*

4. Open `backend/.env` in your editor and enter your real MongoDB Atlas connection string:
   ```env
   PORT=5000
   HOST=0.0.0.0
   CLIENT_URL=http://localhost:5173
   ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
   MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-domain>/watchparty?retryWrites=true&w=majority
   ```
   > [!IMPORTANT]
   > Replace `<username>`, `<password>`, and `<cluster-domain>` with your actual MongoDB Atlas database user credentials. Never commit your `.env` file to Git.

5. Start the backend development server using the script defined in `backend/package.json`:
   ```powershell
   npm run dev
   ```
   *(Alternatively, run `npm start` for standard production start).*

6. **Verify Backend Output**:
   You should see:
   ```text
   MongoDB connected
   Watch Party API running on port 5000
   Allowed CORS origins: http://localhost:5173, http://127.0.0.1:5173, ...
   Socket.IO initialized on path: /socket.io/
   Socket.IO transports enabled: polling, websocket
   ```

7. **Verify Health Endpoint**:
   Open `http://localhost:5000/health` in your browser. You should receive:
   ```json
   {
     "status": "ok",
     "message": "Watch Party backend is running",
     "database": "connected",
     "activeRooms": 0,
     "uptimeSeconds": 3
   }
   ```

---

### Step 3: Configure & Start the Frontend (Terminal 2)

Leave **Terminal 1** running the backend. Open a **second terminal** window.

1. Navigate to the `frontend` directory in **Terminal 2**:
   ```powershell
   cd frontend
   ```

2. Install frontend dependencies:
   ```powershell
   npm install
   ```

3. Configure the frontend environment variable:
   ```powershell
   Copy-Item .env.example .env
   ```
   Open `frontend/.env` and ensure it points to your local backend:
   ```env
   VITE_SERVER_URL=http://localhost:5000
   ```

4. Start the Vite development server using the script defined in `frontend/package.json`:
   ```powershell
   npm run dev
   ```

5. **Verify Frontend Output**:
   ```text
     VITE v8.3.4  ready in 150 ms

     ➜  Local:   http://localhost:5173/
     ➜  Network: use --host to expose
   ```

---

### Step 4: Verify Single-Laptop Functionality

1. Open your browser and navigate to:
   ```text
   http://localhost:5173
   ```
2. Verify the status indicator in the top navbar shows **Connected** with a green dot.
3. Enter your name (e.g., `HostTester`) and click **Create Room**.
4. You will be placed into a newly generated 6-character room (e.g., `XYZ789`).
5. Open an **Incognito / Private Window** (or another browser) and navigate to `http://localhost:5173`.
6. Enter a different username (e.g., `ViewerTester`), enter the room code `XYZ789`, and click **Join Room**.
7. Confirm that both windows show `2/10 online`, play/pause actions synchronize across windows, and chat messages appear instantly in both windows.

---

## 6. Run on Multiple Laptops on the Same Wi-Fi Network (LAN)

You can host a watch party with friends in the same house, dorm, or classroom using your local Wi-Fi router without needing cloud deployment.

### Concept Overview

- **Host Laptop**: Runs both the backend and frontend development servers.
- **Client Laptop(s)**: Connected to the same Wi-Fi; open the host laptop's local IP address in their browsers.
- **Important Note**: On a second laptop, `localhost` points to *that second laptop itself*. Other laptops must connect using the **Host Laptop's IPv4 address** (e.g., `http://192.168.1.15:5173`).

---

### Step-by-Step LAN Setup

#### 1. Connect All Laptops to the Same Wi-Fi
Ensure all laptops are connected to the exact same Wi-Fi network and that the network profile is set to **Private network** in Windows Settings (Public Wi-Fi networks block device-to-device communication).

#### 2. Find the Host Laptop's Local IPv4 Address
On the **Host Laptop**, open PowerShell or Command Prompt and run:
```powershell
ipconfig
```
Look for your active network adapter (e.g., `Wireless LAN adapter Wi-Fi` or `Ethernet adapter`):
```text
Wireless LAN adapter Wi-Fi:
   IPv4 Address. . . . . . . . . . . : 192.168.1.15
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Default Gateway . . . . . . . . . : 192.168.1.1
```
*Note this IP address. In this tutorial, we will use `192.168.1.15` as an example.*

#### 3. Update Host Laptop Environment Variables for LAN
To allow other laptops on the local network to connect, update the CORS and client settings:

- **In `backend/.env` (on Host Laptop)**:
  ```env
  PORT=5000
  HOST=0.0.0.0
  CLIENT_URL=http://192.168.1.15:5173
  ALLOWED_ORIGINS=http://localhost:5173,http://192.168.1.15:5173,http://127.0.0.1:5173
  MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-domain>/watchparty?retryWrites=true&w=majority
  ```
  *(Replace `192.168.1.15` with your actual IPv4 address).*

- **In `frontend/.env` (on Host Laptop)**:
  ```env
  VITE_SERVER_URL=http://192.168.1.15:5000
  ```

#### 4. Configure Windows Defender Firewall on Host Laptop
Windows Firewall by default may block incoming traffic on ports `5000` (backend) and `5173` (frontend).

Run PowerShell **as Administrator** on the Host Laptop to allow incoming connections on these ports for Private networks:
```powershell
New-NetFirewallRule -DisplayName "Watch Party Backend (5000)" -Direction Inbound -LocalPort 5000 -Protocol TCP -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "Watch Party Frontend (5173)" -Direction Inbound -LocalPort 5173 -Protocol TCP -Action Allow -Profile Private
```
*(Alternatively, when Windows Firewall displays a popup prompt when starting Node.js, check the box for **"Private networks"** and click **"Allow access"**).*

#### 5. Start the Backend on Host Laptop (Terminal 1)
In `backend`:
```powershell
npm run dev
```
Confirm the terminal output displays:
```text
Watch Party API running on port 5000
Allowed CORS origins: http://192.168.1.15:5173, http://localhost:5173, ...
```

#### 6. Start the Frontend with `--host` on Host Laptop (Terminal 2)
In `frontend`, start Vite with the `--host` flag to bind to all network interfaces:
```powershell
npm run dev -- --host
```
Vite will output:
```text
  VITE v8.3.4  ready in 160 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.1.15:5173/
```

#### 7. Connect from Client Laptops
On any other laptop connected to the same Wi-Fi:
1. Open a browser and navigate to:
   ```text
   http://192.168.1.15:5173
   ```
   *(Replace with the Host Laptop's actual IPv4 address).*
2. Confirm the navbar shows **Connected** with a green dot.
3. The host user on the Host Laptop clicks **Create Room** and shares the 6-character code (e.g., `PARTY1`).
4. Other laptops enter their usernames, type `PARTY1`, and click **Join Room**.
5. All users can now chat, react with floating emojis, and watch videos in sync.

---

## 7. Run on Multiple Devices Across Different Networks (Online Deployment)

Watch Party is pre-configured and deployed to the public internet so users on different networks, cities, or mobile data can join rooms without local setup.

### Active Deployment Architecture

- **Frontend Application**: Deployed on **Vercel**
  - **Live URL**: `https://watch-party-omega-two.vercel.app`
  - Served as a globally distributed Single-Page Application (SPA) with automated build optimization.
- **Backend Service**: Deployed on **Render**
  - **Live URL**: `https://watch-party-p7ix.onrender.com`
  - For checking if backend is running, add /health after the url.
  - Runs the Node.js/Express HTTP server and Socket.IO real-time engine.
- **Database**: Cloud **MongoDB Atlas**
  - High-availability cluster storing room metadata.

> [!NOTE]
> **Render Free Tier Spin-Down Note**:
> Render's free tier spins down services after 15 minutes of inactivity. When you open the website after a period of idle time, the backend may take **30 to 50 seconds** to wake up.
> During this brief wake-up period, the frontend will display **Connecting...** or **Reconnecting...** in the top navbar. It will automatically switch to **Connected** with a green dot as soon as the Render service is awake.

---

### How to Use the Live Deployment

1. **Host (Device 1)**:
   - Open: `https://watch-party-omega-two.vercel.app`
   - Wait for the top-right navbar indicator to show **Connected** (green dot).
   - Enter your name (e.g., `HostUser`) and click **Create Room**.
   - Click the **Copy Invite Link** button in the header. The link will be in this format:
     ```text
     https://watch-party-rlope6gvr-ash-c968.vercel.app/?room=ABC123
     ```
   - Share this link with friends via Discord, WhatsApp, Slack, or email.

2. **Viewer (Device 2 / Mobile / Another Network)**:
   - Click the shared invite link on any laptop or smartphone.
   - The room code is pre-filled automatically with an invite banner:
     *"You were invited to join room ABC123! Choose your username and click Join Room below."*
   - Enter a display name (e.g., `ViewerUser`) and click **Join Room**.

3. **Verify Cross-Network Synchronization**:
   - Both devices will display `2/10 online` in the participant roster.
   - When the host hits Play, Pause, or seeks to `01:23`, the viewer's video mirrors the action with automatic drift correction.
   - Reactions, playlist additions, and votes update instantly over secure WebSockets (`wss://`).

---

## 8. Environment Variables Reference

The application uses environment variables to isolate environment-specific configurations between local development, Render, and Vercel.

### Backend Environment Variables (`backend/.env` & Render)

| Variable Name | Required? | Default (Local) | Production Example (Render) | Description |
| :--- | :---: | :--- | :--- | :--- |
| `PORT` | Yes | `5000` | `10000` | The network port the HTTP and Socket.IO server listens on. Render automatically supplies this in production. |
| `HOST` | No | `0.0.0.0` | `0.0.0.0` | IP interface binding. `0.0.0.0` binds to all interfaces, required for cloud containers and LAN access. |
| `MONGODB_URI` | **Yes** | *None* | `mongodb+srv://user:pass@cluster.mongodb.net/watchparty?retryWrites=true&w=majority` | Connection URI for MongoDB Atlas cluster. |
| `CLIENT_URL` | No | `http://localhost:5173` | `https://watch-party-rlope6gvr-ash-c968.vercel.app` | Primary frontend client origin URL. |
| `ALLOWED_ORIGINS` | No | `http://localhost:5173` | `https://watch-party-rlope6gvr-ash-c968.vercel.app,https://*.vercel.app,http://localhost:5173` | Comma-separated list of permitted CORS origins. Supports exact domains and wildcard subdomains (`https://*.vercel.app`). Localhost origins are always preserved as automatic fallbacks. |

### Frontend Environment Variables (`frontend/.env` & Vercel)

| Variable Name | Required? | Default (Local) | Production Example (Vercel) | Description |
| :--- | :---: | :--- | :--- | :--- |
| `VITE_SERVER_URL` | **Yes** | `http://localhost:5000` | `https://watch-party-p7ix.onrender.com` | Base URL of the backend API and Socket.IO server. Must **not** include a trailing slash or `/socket.io`. |

> [!IMPORTANT]
> **Vite `VITE_` Prefix Rule**:
> In Vite applications, only environment variables prefixed with `VITE_` are exposed to client-side code via `import.meta.env`. Any variable without this prefix is excluded from the client build for security. Never put database credentials or private keys in the frontend!

---

## 9. Common Errors and Troubleshooting

### 1. `npm install` Errors
- **Symptom**: `npm ERR! code ERESOLVE` or dependency peer conflicts.
- **Cause**: Node.js version mismatch or outdated npm cache.
- **Fix**: Run `npm install --legacy-peer-deps` or clean your cache:
  ```powershell
  npm cache clean --force
  npm install
  ```
  Ensure you are using Node.js v18 or v20 (`node -v`).

### 2. Missing Environment Variables (`MONGODB_URI is missing from backend/.env`)
- **Symptom**: Backend crashes on startup with: `Error: MONGODB_URI is missing from backend/.env`.
- **Cause**: The `.env` file does not exist in `backend/` or `MONGODB_URI` is blank.
- **Fix**: Create `backend/.env` by copying `backend/.env.example`, and supply a valid MongoDB connection string.

### 3. MongoDB Connection Errors (`querySrv ECONNREFUSED` or `MongoServerSelectionError`)
- **Symptom**: Backend logs: `MongoDB connection attempt failed: ...`.
- **Causes & Fixes**:
  1. **IP Not Whitelisted**: Open [MongoDB Atlas](https://cloud.mongodb.com/) > **Network Access** > Click **Add IP Address** > Choose **Allow Access from Anywhere** (`0.0.0.0/0`) > Confirm.
  2. **Invalid Credentials**: Verify the database username and password in **Database Access**. Ensure special characters in passwords are URL-encoded if necessary.
  3. **Cluster Paused**: If using a free Atlas cluster that has been idle, log in to Atlas and resume the cluster.

### 4. Port Already in Use (`EADDRINUSE: address already in use :::5000`)
- **Symptom**: Backend fails to start because port 5000 or 5173 is occupied by a previously running process.
- **Fix on Windows PowerShell**:
  Find the PID occupying the port and terminate it:
  ```powershell
  # Find the PID using port 5000
  Get-NetTCPConnection -LocalPort 5000 | Select-Object OwningProcess -Unique
  
  # Terminate the process (replace 12345 with the actual PID returned)
  Stop-Process -Id 12345 -Force
  ```
  *(Or change `PORT=5001` in `backend/.env` and `VITE_SERVER_URL=http://localhost:5001` in `frontend/.env`).*

### 5. Frontend Unable to Reach Backend (`ERR_CONNECTION_REFUSED`)
- **Symptom**: Frontend shows `Disconnected` or `Reconnecting...` constantly.
- **Cause**: Backend server is not running or `VITE_SERVER_URL` is pointing to the wrong port/host.
- **Fix**:
  1. Check Terminal 1 to ensure `npm run dev` in `backend/` is running without errors.
  2. Test `http://localhost:5000/health` directly in your browser.
  3. Verify `frontend/.env` contains `VITE_SERVER_URL=http://localhost:5000` (no trailing slash). Restart frontend dev server after editing `.env`.

### 6. Socket.IO Connection Failures or HTTP 400 Polling Errors (`xhr poll error`)
- **Symptom**: Browser console logs: `WebSocket connection to ... failed: Error during WebSocket handshake: Unexpected response code: 400` or `xhr poll error`.
- **Cause**: CORS origin mismatch or forcing `transports: ["websocket"]` over hosting proxies.
- **Fix**:
  1. The application uses `transports: ["polling", "websocket"]` by default. This initiates an HTTP polling handshake first before upgrading to WebSocket.
  2. Ensure the frontend origin (e.g. `https://your-app.vercel.app`) is included in `ALLOWED_ORIGINS` in your backend environment settings.
  3. Inspect Render backend logs; safe connection diagnostics will print: `[Socket.IO Handshake Failure] Origin: ...`.

### 7. CORS Errors (`No 'Access-Control-Allow-Origin' header is present`)
- **Symptom**: Browser blocks requests with: `Access to XMLHttpRequest at ... from origin ... has been blocked by CORS policy`.
- **Cause**: The client's origin is not in the backend's allowed origins list.
- **Fix**:
  - Add the client origin to `ALLOWED_ORIGINS` in `backend/.env` (or Render dashboard).
  - Wildcard subdomains like `https://*.vercel.app` are supported by the backend's `isOriginAllowed` logic.

### 8. Render Free Tier Service Sleeping
- **Symptom**: First page load after 15 minutes of inactivity shows `Connecting...` for 30–50 seconds.
- **Cause**: Normal behavior of Render Free web services.
- **Fix**: Wait ~40 seconds for the container to wake up. The frontend status will automatically transition to `Connected`.

### 9. LAN Devices Unable to Access Host Laptop
- **Symptom**: Second laptop gets `ERR_CONNECTION_TIMED_OUT` when navigating to `http://192.168.1.15:5173`.
- **Causes & Fixes**:
  1. **Wi-Fi Profile**: Ensure network is set to **Private** on Windows. Public networks isolate devices.
  2. **Vite Host Binding**: Ensure frontend was started with `npm run dev -- --host`.
  3. **Windows Firewall**: Run the firewall commands from Section 6 to allow inbound ports `5000` and `5173`.
  4. **IP Changed**: Wi-Fi routers dynamically reassign IPs via DHCP. Run `ipconfig` again to verify your current IP.

### 10. Playback Desynchronization
- **Symptom**: Participant video does not play or is out of sync.
- **Causes & Fixes**:
  1. **Browser Autoplay Restrictions**: Browsers block unmuted autoplay without user interaction. Click anywhere on the video player or unmute to allow playback.
  2. **Video Format**: Use direct `.mp4`, `.webm`, or `.ogg` video files hosted on publicly accessible HTTPS URLs (e.g. CDNs or S3). Embedded YouTube or Netflix URLs cannot be loaded directly into HTML5 `<video>` tags due to DRM and cross-origin restrictions.

---

## 10. Testing Checklist

Use these checklists to verify all aspects of the application.

### ✅ Single-Laptop Testing (Localhost)
- [ ] Backend starts with `npm run dev` in `backend/` and connects to MongoDB.
- [ ] `/health` endpoint returns `{"status":"ok","database":"connected"}`.
- [ ] Frontend starts with `npm run dev` in `frontend/` on `http://localhost:5173`.
- [ ] Navbar displays **Connected** with green indicator.
- [ ] Host can create a room and receives a 6-character room code.
- [ ] Second browser window joins using the room code.
- [ ] Participant counter shows `2/10 online`.
- [ ] Host plays, pauses, and seeks video; viewer video mirrors actions within ~1 second.
- [ ] Chat messages sent from one window appear immediately in the other.
- [ ] Floating emoji reaction clicked on one window floats up in both windows.
- [ ] Playlist addition updates across both windows; playing item changes active video.
- [ ] Poll created by host allows viewer to vote; percentage bars update in real time.

### ✅ Multiple-Laptop LAN Testing (Same Wi-Fi)
- [ ] Host laptop IPv4 identified via `ipconfig` (e.g., `192.168.1.15`).
- [ ] Backend `.env` configured with `CLIENT_URL=http://<HOST_IP>:5173` and `ALLOWED_ORIGINS`.
- [ ] Frontend `.env` configured with `VITE_SERVER_URL=http://<HOST_IP>:5000`.
- [ ] Windows Firewall permits inbound TCP traffic on ports `5000` and `5173`.
- [ ] Frontend started with `npm run dev -- --host`.
- [ ] Client laptop opens `http://<HOST_IP>:5173` and successfully displays **Connected**.
- [ ] Client laptop joins room using shared room code.
- [ ] Playback sync, chat, emoji reactions, and polls function seamlessly between laptops.

### ✅ Online Deployment Testing (Vercel & Render)
- [ ] Render health endpoint `https://watch-party-p7ix.onrender.com/health` returns `status: ok`.
- [ ] Vercel frontend `https://watch-party-rlope6gvr-ash-c968.vercel.app` loads over HTTPS.
- [ ] Navbar switches from `Connecting...` to **Connected** once Render is awake.
- [ ] Host creates room and clicks **Copy Invite Link**.
- [ ] Friend opens invite link on a separate network or smartphone.
- [ ] Pre-filled room code banner displays properly; friend joins room.
- [ ] Playback commands and chat synchronize across disparate networks without errors.

---

## 11. GitHub Submission & Workflow

Follow these steps to stage, commit, and push your documentation updates to the GitHub repository.

### 1. Check Current Git Status and Branch
Open PowerShell in the project root:
```powershell
git branch
git status
```
Confirm you are on the correct branch (e.g., `main`).

### 2. Verify `.env` Files Are Not Tracked
Ensure sensitive `.env` files containing database passwords are not listed under *Changes to be committed*:
```powershell
git status --ignored
```
Confirm that `backend/.env` is listed under **Ignored files**.

### 3. Stage and Commit `README.md`
```powershell
git add README.md
git commit -m "docs: add comprehensive project README and setup guide"
```

### 4. Push to GitHub
```powershell
# Push to the current branch (replace 'main' if using another branch)
git push origin main
```

---

## 12. Technologies Used

- **Frontend**: [React 19](https://react.dev/), [Vite](https://vite.dev/), [Socket.IO Client](https://socket.io/docs/v4/client-api/), HTML5 Video API, CSS3 Flexbox/Grid
- **Backend**: [Node.js](https://nodejs.org/), [Express 5](https://expressjs.com/), [Socket.IO](https://socket.io/), [CORS](https://github.com/expressjs/cors), [Dotenv](https://github.com/motdotla/dotenv)
- **Database**: [MongoDB Atlas](https://www.mongodb.com/atlas), [Mongoose 9](https://mongoosejs.com/)
- **Hosting & Deployment**: [Vercel](https://vercel.com/) (Frontend SPA), [Render](https://render.com/) (Backend Web Service)
