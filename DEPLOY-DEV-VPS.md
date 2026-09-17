# LayaFood test stack on Debian 13

You are a **sudo user**, not the DNS owner.

**Status (16 Sep 2026): Phase 1 is DONE.** Dashboard, API, local Mongo (Atlas dump restored), and media files work on the **VPS IP** over HTTP.

Do **not** put `https://dev.layafood.com` in the dashboard build until DNS actually points here. If you do it early, Certbot fails and the UI can still call the wrong host.

Isolated Mongo only (`layafood_dev`). Never reuse production `DATABASE_URL`.

---

## Where you are

| Check | Status |
|---|---|
| Docker Mongo on `127.0.0.1:27017` | Done |
| Atlas `TakosKorner` restored into `layafood_dev` | Done |
| Backend + dashboard + media cloned, built, PM2 | Done |
| Nginx on IP (`server_name _;`) | Done |
| Login + restaurants + images on `http://YOUR_VPS_IP/` | Done |
| Media files in `/var/www/layafood/media-uploads` | Done |
| DNS `dev.layafood.com` → this VPS | **Waiting on owner** |
| HTTPS / Certbot | **Not yet** |

Until DNS moves, public URLs are:

| URL | Serves |
|---|---|
| `http://YOUR_VPS_IP/` | Dashboard |
| `http://YOUR_VPS_IP/api/...` | Backend `127.0.0.1:3300` |
| `http://YOUR_VPS_IP/socket.io/` | Socket.IO |
| `http://YOUR_VPS_IP/uploads/...` | Files in `/var/www/layafood/media-uploads` |

Media API stays internal (`127.0.0.1:4000`). Do not bind `3300` / `4000` / `27017` to `0.0.0.0`.

---

## What you do now (today)

### 1. Make sure PM2 restarts after a reboot

On the VPS:

```bash
pm2 status
pm2 save
pm2 startup systemd
```

Run the `sudo ...` command it prints (once). Then:

```bash
pm2 save
```

### 2. Message the owner

Send them:

> The test stack is live on this VPS IP. Please point the DNS **A record** of `dev.layafood.com` to **YOUR_VPS_IP**. Do not change anything else yet. I will add HTTPS after the name resolves.

Replace `YOUR_VPS_IP` with the real IP (`curl -4 ifconfig.me` on the VPS).

### 3. Optional cleanup (safe)

```bash
rm -rf ~/mongo-dump /tmp/media-uploads-copy ~/uploads
```

Do **not** delete `/var/lib/layafood-mongo` or `/var/www/layafood/media-uploads`.

Skip creating `admin@layafood.com` — the restored Atlas users already work.

---

## What you wait for

**Wait for the owner to change DNS.** You cannot do HTTPS before that.

From **your PC** (not the VPS), poll until the name is this VPS:

```bash
nslookup dev.layafood.com
```

or:

```bash
ping dev.layafood.com
```

You are ready for Phase 2 only when that IP **equals the VPS IP**.

- If it still shows the old server / nothing: **keep waiting**. Do not run Certbot.
- DNS can take minutes to a few hours.

Do **not**:

- Run `certbot` early (fails + can rate-limit you)
- Rebuild the dashboard with `https://dev.layafood.com` while the name still points elsewhere
- Change kiosk/mobile API URLs until you decide they should use this host

---

## Phase 2 — after DNS points here (you)

Do these **in order**. One command at a time.

### 1. Confirm DNS

From your PC: `nslookup dev.layafood.com` → VPS IP.

From the VPS you can also check, but the laptop check is what matters for Let's Encrypt.

### 2. Point Nginx at the domain

```bash
sudo nano /etc/nginx/sites-available/layafood-dev
```

Change only:

```nginx
server_name dev.layafood.com;
```

Keep `listen 80` and the rest. Then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Open `http://dev.layafood.com` — dashboard should load (still HTTP).

### 3. HTTPS (Certbot)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d dev.layafood.com
```

Follow the prompts (email, agree ToS). Certbot will edit Nginx for 443 and redirect HTTP → HTTPS.

### 4. Switch app URLs to HTTPS

**`/var/www/layafood/backend/.env`**

```
BASE_URL=https://dev.layafood.com
ALLOWED_ORIGINS=https://dev.layafood.com
```

Leave `DATABASE_URL` and `MEDIA_SERVER_URL=http://127.0.0.1:4000` unchanged.

**`/var/www/layafood/media/.env.production`**

```
NODE_ENV=production
PORT=4000
BASE_URL=https://dev.layafood.com
UPLOAD_DIR=/var/www/layafood/media-uploads
```

**`/var/www/layafood/dashboard/.env`** (must rebuild after this)

```
REACT_APP_API_URL=https://dev.layafood.com/api
REACT_APP_MEDIA_URL=https://dev.layafood.com
REACT_APP_NAME=LayaFood
```

No trailing slash on `REACT_APP_MEDIA_URL`.

### 5. Put API back in production mode (Secure cookies)

HTTP on the IP needed `NODE_ENV=development` so the login cookie was not `Secure`. HTTPS can use production.

**`/var/www/layafood/ecosystem.config.cjs`** — both apps:

```javascript
module.exports = {
  apps: [
    {
      name: "layafood-api",
      cwd: "/var/www/layafood/backend",
      script: "dist/server.js",
      instances: 1,
      env: { NODE_ENV: "production" },
    },
    {
      name: "layafood-media",
      cwd: "/var/www/layafood/media",
      script: "index.js",
      interpreter: "node",
      env: { NODE_ENV: "production" },
    },
  ],
};
```

Pull the latest backend (trust proxy + cookie helper) if the VPS is missing those commits:

```bash
cd /var/www/layafood/backend
git pull origin feat/typescript-migration
npm run build
```

### 6. Rebuild dashboard and restart

```bash
cd /var/www/layafood/dashboard
npm run build

pm2 delete layafood-api layafood-media
pm2 start /var/www/layafood/ecosystem.config.cjs
pm2 save
```

### 7. Prove HTTPS

From your laptop:

- `https://dev.layafood.com` → login
- Restaurants and images load
- Browser padlock, no mixed-content errors

If login works then every page is `No token provided`, you are still on HTTP or `NODE_ENV=production` with `BASE_URL` still `http://...`. Fix `BASE_URL` to `https://...` and restart the API.

---

## After Phase 2 (optional, not blocking)

- Printer / carousel: old LAN IPs do not work on this VPS. Leave empty until you have a printer path.
- Kiosk / mobile: still on the old API until you change their `API_URL` / `MEDIA_URL` to `https://dev.layafood.com`.
- Rotate Atlas / Gmail secrets that were pasted in chat.
- Rebuild dashboard after **any** `REACT_APP_*` change.

---

## Phase 1 reference (already done — do not rerun)

Kept so you can rebuild a box later. Skip this until you need a fresh VPS.

### Packages

- Debian 13, sudo user `debian`
- Swap 2G if RAM &lt; ~2GB
- Nginx, git, Docker, Node 20, PM2, UFW
- Docker GPG: `sudo chmod a+r /etc/apt/keyrings/docker.asc` (not `a644`)
- Log out of PuTTY and back in after `usermod -aG docker`

### Mongo

- Container `layafood-mongo`, bound to `127.0.0.1:27017`
- App DB `layafood_dev`, user `layafood`
- If the app password contains `@`, encode it as `%40` in `DATABASE_URL`
- Data: `mongodump` Atlas DB `TakosKorner` on the PC (Database Tools, not Compass mongosh), `scp` to VPS, `docker cp` + `mongorestore --nsFrom='TakosKorner.*' --nsTo='layafood_dev.*'`

### Layout

```
/var/www/layafood/backend
/var/www/layafood/dashboard
/var/www/layafood/media
/var/www/layafood/media-uploads
```

Clone into those names (`git clone … media`). If you clone `MediaBackend` into an existing `media` folder it nests; flatten or clone again with the last argument `media`.

### Env that made HTTP-on-IP work

Backend:

```
PORT=3300
DATABASE_URL=mongodb://layafood:PASSWORD@127.0.0.1:27017/layafood_dev?authSource=layafood_dev
MEDIA_SERVER_URL=http://127.0.0.1:4000
BASE_URL=http://YOUR_VPS_IP
ALLOWED_ORIGINS=http://YOUR_VPS_IP
```

`ALLOWED_ORIGINS` is required (default is localhost). No `/api` on `BASE_URL`.

Dashboard (baked at build):

```
REACT_APP_API_URL=http://YOUR_VPS_IP/api
REACT_APP_MEDIA_URL=http://YOUR_VPS_IP
```

Media:

```
UPLOAD_DIR=/var/www/layafood/media-uploads
```

not `/var/www/media-backend/uploads`.

### HTTP cookie workaround

Until HTTPS, `layafood-api` in PM2 used `NODE_ENV: "development"` so the `jwt` cookie was not `Secure`. Switch back to `production` in Phase 2.

Also: `app.set("trust proxy", 1)` so `express-rate-limit` accepts Nginx `X-Forwarded-For`.

### Media files

`uploads/` is gitignored. Copy with `scp` into `/var/www/layafood/media-uploads` so you see `restaurant_*` folders **directly** there (not `media-uploads/uploads/...`). Then:

```bash
sudo chown -R debian:www-data /var/www/layafood/media-uploads
sudo chmod -R 775 /var/www/layafood/media-uploads
```

### Nginx IP vhost

`server_name _;` plus `default_server` — do not put the IP in `server_name`.
