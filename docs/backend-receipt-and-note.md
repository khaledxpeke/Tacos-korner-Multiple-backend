# Receipt QR, order note removal, card minimum (backend)

The kiosk now ends every order on a final screen showing the order number, the amount paid and the customer name. That screen also shows a **QR code**. The customer scans it with their phone and downloads the receipt as a PDF.

The kiosk is ready. It shows the QR as soon as the API returns a link. Until then the QR stays hidden and nothing breaks.

This note covers three backend tasks:

1. A public receipt PDF link, returned by `POST /api/history`.
2. Removing the order note, which the kiosk and the cashier no longer use.
3. A check that the card minimum is live.

File paths refer to `Tacos-korner-Multiple-backend` as it is in this workspace. Line numbers may have moved.

---

## 1. Public receipt PDF

### Contract with the kiosk

`POST /api/history` (201) adds one field to the response:

```json
{
  "_id": "6650f1…",
  "commandNumber": 42,
  "receiptUrl": "https://dev.layafood.com/api/history/6650f1…/receipt.pdf?sig=3f9c…"
}
```

- `receiptUrl` is an **absolute** URL that a phone can open. It must not depend on the kiosk's network. Build it from `MEDIA_SERVER_URL` or `BASE_URL`.
- The kiosk reads `receiptUrl` from the body it already gets back: `history`, `data` or the root object. It puts the value as-is into the QR.
- If the field is missing or empty, the kiosk shows no QR.

### Route

```
GET /api/history/:id/receipt.pdf?sig=<signature>
```

- **No auth.** The customer's phone has no token.
- **Signed link.** Mongo ids can be guessed, so the link carries a signature:
  - `sig = HMAC-SHA256(secret, "<historyId>.<restaurantId>")`, encoded as hex or base64url.
  - The secret comes from a new env var such as `RECEIPT_LINK_SECRET`. Do not reuse the JWT secret.
  - Compare with `crypto.timingSafeEqual`.
  - Wrong or missing `sig`: respond **404**, not 403, so the route doesn't reveal which ids exist.
- **Optional expiry.** Add `exp` (a unix timestamp) to the signed string and to the query, e.g. 7 days. When it has passed, respond 410 or 404.
- **Rate limit.** Use the same limiter as `/loyalty/login` (`src/routes/loyalty.routes.ts`).
- **Response:**
  - `Content-Type: application/pdf`
  - `Content-Disposition: attachment; filename="recu-<commandNumber>.pdf"`
  - `Cache-Control: private, max-age=3600`
- **Generate in memory.** Use `page.pdf()` without `path` and send the buffer. Do not write to `./uploads`: that folder is served publicly through `/api/uploads`.
- CSRF lets GET through, and Helmet's CORP is `cross-origin`, so no middleware change is needed.

### PDF content

The PDF mirrors the thermal ticket the kiosk prints (`takos_korner/lib/utils/printer_model_thermal.dart`, `addReceipt`), in the same order. Use a receipt layout about 80 mm wide (`width: "80mm"`, height set to fit the content, one page), not A4.

1. Restaurant name, then address.
2. A dark band with `#<commandNumber>` on the left and the pack label on the right (`pack.label`, e.g. Sur place / À emporter).
3. Customer name, large.
4. Date `dddd dd/MM/yyyy HH:mm` in the restaurant language, using `boughtAt` or `createdAt`.
5. "Moyen de paiement : <method.label>".
6. Item table (Produit | Prix). For each product:
   - The main line: `N X <plat.name>` when count > 1, and `plat.price * count`.
   - The variation as an indented line, with its price shown only when > 0.
   - Addons as ` NX <name>`, with the price shown only when > 0.
   - An "Extras" header, then the extras with their prices.
   - A separator between products.
7. Separator, then the TVA (x%) amount and the HT amount, computed on the amount paid:
   - `HT = 100 * paid / (100 + tva)`
   - `TVA = paid − HT`
8. If there is a coupon or loyalty reduction: the subtotal (sum of the product totals), the coupon discount (`-x%` or `-x.xx`) and the loyalty discount (`-x.xx`).
9. **TOTAL**: the amount paid, with the currency.
10. The two thank-you lines ("Laissez-nous 5 étoiles sur Google…", "À bientôt !"), the restaurant QR code (`settings.qrCode`) and "Powered by LayaFood".

Translate the labels with the existing `req.t` / i18n keys in the **restaurant default language** (`settings.defaultLanguage`), as the email PDF does.

### Implementation hints

- Reuse puppeteer and Handlebars from `src/services/history-pdf.service.ts`. Add a new template, `template/receipt.handlebars`, rather than changing the A4 `pdf.handlebars` used by email.
- `generatePDF` currently builds a fake `req` (`undefined as unknown as Request`). The `req.t(...)` calls, including the one in the `catch`, crash if `restaurantId` is missing. The new code should take a translator function, or a language code, as an argument.
- For the QR inside the PDF, render `settings.qrCode` as a data URL (the `qrcode` npm package, or the same method the email uses if it has one).
- Reuse one browser instance, or a small pool. Launching puppeteer on every scan is slow on a busy kiosk.

### Done when

- Placing an order on the kiosk shows a QR on the final screen.
- A phone that scans it downloads `recu-<n>.pdf`, and its content matches the printed ticket.
- Changing one character of `sig` gives 404.

---

## 2. Remove the order note

The kiosk no longer sends `note` in `POST /api/history`. The cashier no longer reads or prints it. The change is backward compatible: older kiosks that still send `note` just have it ignored.

Remove it everywhere:

| Where | What |
| --- | --- |
| `src/models/history.model.ts` | the `note` field (type around L56, schema around L126) |
| `src/interfaces/history.interface.ts` | `note` in the print/PDF order type (around L58) and in `AddHistoryBody` (around L128) |
| `src/controllers/history.controller.ts` | `readOrderNote()` (around L51-57), `note` in the body destructuring (around L71), `note: readOrderNote(note)` in the save (around L163) |
| `src/services/loyalty.service.ts` | `note` in the `.select(...)` (around L202) and in the mapped customer history (around L238) |
| `src/services/print.service.ts` | `noteXml` (around L57-60) and its use on the customer ticket (around L342) and the kitchen ticket (around L367-370) |
| `TacosKorner_dashboard/src/components/hitoryModal.jsx` | `const note = …` (around L20) and the "Note :" line (around L229-231). Delete the `table.note` key from the dashboard locales |
| `/fidelite` customer web app | check whether it shows `note` in the order history and remove it if so |

Existing orders in Mongo can keep the field. Mongoose ignores it once it is out of the schema. A cleanup `$unset` is optional.

---

## 3. Card minimum: confirm it is live

The kiosk now follows `takos_korner/docs/card-payment-minimum.md`:

- It reads `settings.cardMinAmount`, defaulting to **10** when absent; `0` means no minimum.
- It disables "Carte bancaire" when the amount paid (after coupon and loyalty) is below that minimum.

The workspace copy of the backend has **no** `cardMinAmount` yet. If the live API doesn't have it either, add:

- `cardMinAmount: { type: Number, default: 10, min: 0 }` in `src/models/settings.model.ts`, and its parsing in `updateSettings` (`src/controllers/settings.controller.ts`, next to the loyalty fields). The `settings-updated` socket emit already sends the whole settings object.
- The check in `addHistory`: if `method._id` is `settings.method[0]._id` and the paid total (coupon applied, then loyalty cashback subtracted when `pointsToRedeem > 0`) is below `cardMinAmount`, respond **400** with the translated `history.card_minimum` message ("Le paiement par carte demande au moins 10.00 €."). The kiosk shows that message as-is.
