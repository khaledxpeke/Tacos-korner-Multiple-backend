# Production server

The receipt PDF and the email PDF are rendered with Chrome through Puppeteer. Chrome is downloaded by `npm install`. Debian still has to provide the libraries it loads, or every receipt scan returns an empty 500 and the log says `libnspr4.so: cannot open shared object file`.

Install these once on the production VPS, the same way they were installed on the dev VPS. No backend rebuild is required after this.

```bash
sudo apt-get update
sudo apt-get install -y libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2
```

If apt says a package name does not exist, that Debian release renamed it with a `t64` suffix. Install `libnspr4` first, then the same list using `t64` on the names that failed.

The receipt link also needs these in the backend `.env`:

- `BASE_URL` is the public API address, with no `/api` on the end, for example `https://dev.layafood.com`. A phone opens this host from the QR.
- `RECEIPT_LINK_SECRET` is its own long random string. Do not reuse `JWT_SECRET`.

Restart the API after changing `.env`.
