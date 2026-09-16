# LayaFood test stack on Debian 13

You are a **sudo user**, not the DNS owner. Deploy and prove it on the **VPS IP** first.
The owner points `dev.layafood.com` at this IP **after** backend + dashboard are up.

**Do not** put `https://dev.layafood.com` in the dashboard build until DNS actually points here. If you do it early, the UI on the new IP still calls **prod**.

Isolated Mongo only. Never reuse the production `DATABASE_URL`.

Replace `YOUR_VPS_IP` and every `CHANGE_ME` before running.

---

## Phase 1 — host on the IP (you)

Public URLs until DNS moves:

| URL | Serves |
|---|---|
| `http://YOUR_VPS_IP/` | Dashboard |
| `http://YOUR_VPS_IP/api/...` | Backend `127.0.0.1:3300` |
| `http://YOUR_VPS_IP/socket.io/` | Socket.IO |
| `http://YOUR_VPS_IP/uploads/...` | Media files |

Media API stays internal (`127.0.0.1:4000`).

### 1. Sudo check

SSH as `debian`, then:

```bash
whoami
sudo -n true && echo "sudo ok" || echo "NEED OWNER TO GRANT SUDO"
```

If sudo fails, stop. Ask the owner to add you to sudo (`usermod -aG sudo debian`) or to run the package install themselves. You cannot install Nginx/Node/Docker without it.

### 2. Packages, swap, firewall

```bash
sudo apt update && sudo apt upgrade -y

# Swap if RAM is under ~2GB (CRA build will OOM)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

sudo apt install -y nginx git curl ufw \
  build-essential python3 pkg-config ca-certificates gnupg \
  libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev libpixman-1-dev

# Docker (MongoDB on Debian 13)
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo tee /etc/apt/keyrings/docker.asc >/dev/null
sudo chmod a644 /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker "$USER"

# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
sudo npm install -g pm2

sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
```

Log out and back in so the `docker` group applies (`groups` should list `docker`).

Skip Certbot until Phase 2. It needs the domain to resolve to this IP.

### 3. New MongoDB (not prod)

```bash
sudo mkdir -p /var/lib/layafood-mongo
docker run -d --name layafood-mongo --restart unless-stopped \
  -p 127.0.0.1:27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD='CHANGE_ME_MONGO_ROOT' \
  -v /var/lib/layafood-mongo:/data/db \
  mongo:7
```

```bash
docker exec -it layafood-mongo mongosh -u admin -p 'CHANGE_ME_MONGO_ROOT' --authenticationDatabase admin
```

```javascript
use layafood_dev
db.createUser({
  user: "layafood",
  pwd: "CHANGE_ME_MONGO_APP",
  roles: [{ role: "readWrite", db: "layafood_dev" }]
})
exit
```

```
mongodb://layafood:CHANGE_ME_MONGO_APP@127.0.0.1:27017/layafood_dev?authSource=layafood_dev
```

### 4. Clone apps

Backend **must** be `feat/typescript-migration`. Dashboard: GitHub `main`.

```bash
sudo mkdir -p /var/www/layafood/{backend,dashboard,media,media-uploads}
sudo chown -R "$USER":"$USER" /var/www/layafood
sudo chown -R www-data:www-data /var/www/layafood/media-uploads
sudo chmod -R u+rwX /var/www/layafood/media-uploads
# nginx + node both need this dir
sudo usermod -aG www-data "$USER"

cd /var/www/layafood
git clone -b feat/typescript-migration https://github.com/khaledxpeke/Tacos-korner-Multiple-backend.git backend
git clone -b main https://github.com/khaledxpeke/TacosKorner_dashboard.git dashboard
git clone https://github.com/khaledxpeke/MediaBackend.git media
```

Copy `backend/config/push-notification-key.json` from your PC (Firebase). Without it the API crashes on push init.

### 5. Env files — use the IP, not the domain

Generate secrets: `openssl rand -hex 32`

**`/var/www/layafood/backend/.env`**

```
PORT=3300
DATABASE_URL=mongodb://layafood:CHANGE_ME_MONGO_APP@127.0.0.1:27017/layafood_dev?authSource=layafood_dev
JWT_SECRET=CHANGE_ME_LONG_RANDOM
ENCRYPTION_KEY=CHANGE_ME_32_CHARS_OR_HEX
EMAIL_HOST=
EMAIL_PORT=587
EMAIL_USER=
EMAIL_PASSWORD=
EMAIL_SENDER=
EMAIL_NAME=LayaFood
RESTAURANT_TIMEZONE=Europe/Paris
MEDIA_SERVER_URL=http://127.0.0.1:4000
CAROUSEL_URL=
PRINTER_SERVER_URL=
BASE_URL=http://YOUR_VPS_IP
MARKETPAY_CLIENT_ID=
MARKETPAY_MERCHANT_ID=
MARKETPAY_DEBUG=true
```

`MEDIA_SERVER_URL` stays localhost. The backend talks to media on the same machine.

**`/var/www/layafood/media/.env.production`**

```
NODE_ENV=production
PORT=4000
BASE_URL=http://YOUR_VPS_IP
UPLOAD_DIR=/var/www/layafood/media-uploads
```

**`/var/www/layafood/dashboard/.env`** (baked at **build** time)

```
REACT_APP_API_URL=http://YOUR_VPS_IP/api
REACT_APP_MEDIA_URL=http://YOUR_VPS_IP
REACT_APP_NAME=LayaFood
```

No trailing slash on `REACT_APP_MEDIA_URL`.

### 6. Build + PM2

```bash
cd /var/www/layafood/backend
npm ci
npm run build

cd /var/www/layafood/media
npm ci

cd /var/www/layafood/dashboard
npm ci
npm run build
```

**`/var/www/layafood/ecosystem.config.cjs`**

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

```bash
pm2 start /var/www/layafood/ecosystem.config.cjs
pm2 save
pm2 startup systemd
# run the command it prints (it will use sudo)
```

```bash
pm2 status
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3300/api/auth/login
ss -tlnp | grep -E '3300|4000|27017'
```

### 7. Nginx on the IP (HTTP only)

**`/etc/nginx/sites-available/layafood-dev`**

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    root /var/www/layafood/dashboard/build;
    index index.html;

    client_max_body_size 100M;

    location /uploads/ {
        alias /var/www/layafood/media-uploads/;
        expires 30d;
        add_header Cache-Control "public";
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3300;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3300;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
sudo ln -sf /etc/nginx/sites-available/layafood-dev /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### 8. First admin (empty DB)

`POST /api/auth/create` cannot create `admin`.

```bash
cd /var/www/layafood/backend
node --input-type=module <<'EOF'
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

await mongoose.connect(process.env.DATABASE_URL);
const password = await bcrypt.hash("CHANGE_ME_ADMIN_PASSWORD", 10);
await mongoose.connection.collection("users").insertOne({
  email: "admin@layafood.com",
  password,
  fullName: "Admin",
  role: "admin",
  isBlocked: false,
  restaurants: [],
  userId: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
});
await mongoose.connection.collection("counters").updateOne(
  { id: "userId" },
  { $set: { seq: 1 } },
  { upsert: true }
);
console.log("admin@layafood.com created");
await mongoose.disconnect();
EOF
```

### 9. Prove it, then ping the owner

From your laptop (not from the VPS):

- `http://YOUR_VPS_IP/` → dashboard login
- Log in as `admin@layafood.com`
- Create a restaurant
- Upload an image (file lands in `/var/www/layafood/media-uploads/`)

Tell the owner: **apps are live on this IP, you can point `dev.layafood.com` now.**

---

## Phase 2 — after the owner changes DNS (you again)

Wait until from your laptop:

```bash
nslookup dev.layafood.com
```

shows **YOUR_VPS_IP**. Then HTTPS + rebuild the dashboard for the domain.

```bash
sudo apt install -y certbot python3-certbot-nginx
```

Set `server_name` so Certbot can issue the cert. Edit the same nginx file:

```nginx
server_name dev.layafood.com;
```

Keep `listen 80` and the rest unchanged.

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d dev.layafood.com
```

Switch public URLs to HTTPS:

**backend `.env`**

```
BASE_URL=https://dev.layafood.com
```

**media `.env.production`**

```
BASE_URL=https://dev.layafood.com
```

**dashboard `.env`**

```
REACT_APP_API_URL=https://dev.layafood.com/api
REACT_APP_MEDIA_URL=https://dev.layafood.com
REACT_APP_NAME=LayaFood
```

```bash
cd /var/www/layafood/dashboard
npm run build

pm2 restart layafood-api layafood-media
```

Open `https://dev.layafood.com` and confirm login + images.

---

## Notes

- Prod Mongo stays untouched (`layafood_dev` only).
- Rebuild dashboard after any `REACT_APP_*` change.
- Printer / carousel LAN IPs from local `.env` will not work here.
- Mobile app is unchanged until you point its API URL at this host.
- Media in production does not serve `/uploads`; Nginx does.
- Do not bind 3300 / 4000 / 27017 to `0.0.0.0`.
- Do not run Certbot before DNS points here. It will fail and can rate-limit you.
