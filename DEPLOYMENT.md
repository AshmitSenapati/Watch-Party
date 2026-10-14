# Watch Party — Public Deployment Guide

This guide walks you through deploying the Watch Party application to the public internet so that users on different laptops, networks, and locations can watch videos together in real time.

---

## Architecture & Hosting Arrangement

- **Frontend**: **Vercel** (Static Single-Page Application with Vite & React 19).
- **Backend**: **Render** (Node.js & Express HTTP + Socket.IO WebSocket server).
- **Database**: **MongoDB Atlas** (Cloud MongoDB cluster storing room metadata).

> [!IMPORTANT]
> **Single Backend Instance Note (Horizontal Scaling Limitation):**
> Active rooms, real-time playback synchronization, chat history, and ephemeral live emoji reactions are coordinated in-memory on the backend server for minimal latency.
> Therefore, all users must connect to the **same backend instance**. Keep Render configured to a single instance (Render Free / Starter default is 1 instance).
> If multi-instance horizontal autoscaling is needed in the future, a Redis message broker with `@socket.io/redis-adapter` would be required.

---

## Step 1: Prepare MongoDB Atlas

Render needs permission to connect to your MongoDB Atlas cluster from the cloud.

1. Log in to [MongoDB Atlas](https://cloud.mongodb.com/).
2. In the left navigation, select **Network Access**.
3. Check the **IP Access List**:
   - If it currently only allows your home IP or local laptop, click **+ Add IP Address**.
   - Choose **Allow Access from Anywhere** (`0.0.0.0/0`).
   - Click **Confirm**. (Render dynamic cloud servers do not have fixed IP addresses unless you purchase an expensive static outbound IP add-on, so `0.0.0.0/0` with strong database user credentials is standard practice).
4. Select **Database Access** in the left menu and ensure you have a database user with read/write permissions. Note the username and password.
5. In **Database** > **Connect** > **Drivers**, copy your connection string:
   ```text
   mongodb+srv://<username>:<password>@<cluster-domain>/watchparty?retryWrites=true&w=majority
   ```
   *(Replace `<username>` and `<password>` with your real credentials).*

---

## Step 2: Deploy Backend to Render

1. Push your project repository to GitHub or GitLab.
2. Log in to [Render](https://dashboard.render.com/).
3. Click **New +** and select **Web Service**.
4. Connect your Watch Party Git repository.
5. Configure the service settings:
   - **Name**: `watch-party-backend` (or a name of your choice)
   - **Region**: Choose a region close to you (e.g., Oregon, Frankfurt, Singapore)
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
6. Scroll down to **Health Check Path** and set it to:
   ```text
   /health
   ```
7. Open **Environment Variables** and add:
   | Key | Value | Description |
   | :--- | :--- | :--- |
   | `PORT` | `10000` | Render port assignment |
   | `HOST` | `0.0.0.0` | Bind to all network interfaces |
   | `MONGODB_URI` | `mongodb+srv://...` | Your MongoDB Atlas connection URI |
   | `ALLOWED_ORIGINS` | `http://localhost:5173` | Temporary until Vercel URL is created |
   | `CLIENT_URL` | `http://localhost:5173` | Temporary until Vercel URL is created |
8. Click **Deploy Web Service**.
9. Wait 2–3 minutes for the build to finish. Once live, copy your Render service URL from the dashboard:
   ```text
   https://watch-party-backend-xxxx.onrender.com
   ```
10. Test the health check in your browser:
    Open `https://watch-party-backend-xxxx.onrender.com/health` in your browser. You should receive:
    ```json
    {
      "status": "ok",
      "message": "Watch Party backend is running",
      "database": "connected",
      "activeRooms": 0,
      "uptimeSeconds": 14
    }
    ```

---

## Step 3: Deploy Frontend to Vercel

1. Log in to [Vercel](https://vercel.com/).
2. Click **Add New...** > **Project**.
3. Import your Watch Party Git repository.
4. Configure the project settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click *Edit* and select `frontend`.
   - **Build and Output Settings**:
     - Build Command: `npm run build`
     - Output Directory: `dist`
5. Expand **Environment Variables** and add:
   | Key | Value | Description |
   | :--- | :--- | :--- |
   | `VITE_SERVER_URL` | `https://watch-party-backend-xxxx.onrender.com` | Your deployed Render backend URL (no trailing slash) |
6. Click **Deploy**.
7. Vercel will build and deploy your site in ~30 seconds.
8. Once complete, copy your public Vercel website URL:
   ```text
   https://your-watch-party.vercel.app
   ```

---

## Step 4: Link Frontend and Backend (Allow CORS)

Now that you have your public Vercel URL, update Render's allowed origins so your Vercel frontend can make API and Socket.IO requests:

1. Return to the **Render Dashboard** > Select `watch-party-backend`.
2. Go to **Environment** tab.
3. Update `ALLOWED_ORIGINS` and `CLIENT_URL`:
   - `ALLOWED_ORIGINS`: `http://localhost:5173,https://your-watch-party.vercel.app`
   - `CLIENT_URL`: `https://your-watch-party.vercel.app`
   *(Replace with your actual Vercel domain)*
4. Click **Save Changes**. Render will automatically re-deploy with the new CORS permissions.

---

## Step 5: Test Across Different Laptops & Networks

1. **Laptop 1 (Host)**:
   - Open your deployed Vercel site: `https://your-watch-party.vercel.app`.
   - Check the top right navbar: It should display **Connected** with a green dot.
   - Enter your name (e.g., `Ashmit`) and click **Create Room**.
   - Click **Copy Invite Link**. The copied link will be in this format:
     `https://your-watch-party.vercel.app/?room=ABC123`
   - Send this link to a friend on another laptop or open it on your phone connected to mobile data (different Wi-Fi/network).
2. **Laptop 2 / Phone (Viewer)**:
   - Open the invite link: `https://your-watch-party.vercel.app/?room=ABC123`.
   - Notice the invite banner: *"You were invited to join room ABC123! Choose your username and click Join Room below."*
   - Enter a username (e.g., `Alex`) and click **Join Room**.
3. **Verify Synchronized Features Across Networks**:
   - **Presence**: Both screens should display `2/10 online`.
   - **Playback Sync**: When Laptop 1 presses Play, Pause, or seeks to a timestamp, Laptop 2 updates simultaneously over WSS.
   - **Live Reactions**: Click `🔥` or `❤️` on Laptop 2; the floating animation appears over the video on Laptop 1 instantly.
   - **Chat**: Send a message from Laptop 1; Laptop 2 receives it immediately with an unread badge if on another tab.
   - **Shared Playlist**: Add a video URL on Laptop 1; Laptop 2 sees it instantly. Click Play; both screens switch videos in unison.
   - **Polls**: Create a poll from Laptop 1; vote on Laptop 2; view live tally percentages.

---

## Troubleshooting & Tips

### 1. Render Free Tier Sleep & Cold Starts
On Render's Free tier, services spin down after 15 minutes of inactivity. When a user first opens your Watch Party site after a dormant period, the initial connection might take ~30–50 seconds while Render spins the container back up. The frontend automatically shows `Reconnecting...` and connects as soon as the backend is awake.

### 2. Video Format & CORS on Browsers
Always use direct HTTP/HTTPS `.mp4` URLs (such as demo files or files hosted on public CDNs, S3, Cloudflare R2, or GitHub releases). YouTube/Netflix web pages cannot be loaded directly into HTML5 `<video>` tags due to DRM and cross-origin blocking.

### 3. Mixed Content Warning
If your frontend is on HTTPS (`https://your-watch-party.vercel.app`), your backend **must also be on HTTPS** (`https://...onrender.com`). Modern browsers block WebSocket/HTTP connections from secure HTTPS sites to insecure `http://` endpoints. Render automatically provides free TLS certificates (`https://` and `wss://`).
