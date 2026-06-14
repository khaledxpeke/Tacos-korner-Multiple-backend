/**
 * Link legacy string image paths to Media ObjectIds when files are ALREADY
 * on the media server (e.g. under uploads/media/shared/...) but categories/
 * products still store old strings like uploads/category/... or uploads/product/...
 *
 * runAllMigrations.js cannot help here — it requires files in backend/uploads/.
 *
 * Usage:
 *   node scripts/migrations/linkLegacyImageRefs.js           # dry-run
 *   node scripts/migrations/linkLegacyImageRefs.js --apply   # write to DB
 *
 * Env:
 *   DATABASE_URL          (required)
 *   MEDIA_UPLOAD_DIR      media server upload root, e.g. /var/www/media-backend/uploads
 *   MEDIA_SERVER_URL      optional, for hashing via API
 */
const fs = require("fs").promises;
const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env"),
});

const Media = require("../../models/media");
const Category = require("../../models/category");
const Product = require("../../models/product");
const Ingrediant = require("../../models/ingrediant");
const Allergy = require("../../models/allergy");
const {
  getFileHashViaApi,
  guessContentTypeFromFilename,
} = require("../../utils/migrationUtils");

const APPLY = process.argv.includes("--apply");

const UPLOAD_ROOT =
  process.env.MEDIA_UPLOAD_DIR ||
  path.join(__dirname, "..", "..", "..", "mediaBackend", "uploads");

const LEGACY_FOLDER_MAP = {
  category: "category",
  product: "product",
  ingrediants: "ingredient",
  ingredient: "ingredient",
  allergy: "allergy",
};

const ENTITIES = [
  {
    label: "categories",
    Model: Category,
    collection: "categories",
    field: "image",
    targetType: "Category",
    mediaType: "category",
  },
  {
    label: "products",
    Model: Product,
    collection: "products",
    field: "image",
    targetType: "Product",
    mediaType: "product",
  },
  {
    label: "ingredients",
    Model: Ingrediant,
    collection: "ingrediants",
    field: "image",
    targetType: "Ingrediant",
    mediaType: "ingredient",
  },
  {
    label: "allergies",
    Model: Allergy,
    collection: "allergies",
    field: "icon",
    targetType: "Allergy",
    mediaType: "allergy",
  },
];

function normalizeRelative(url) {
  return String(url || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^uploads\/?/, "");
}

function buildSharedUrl(folder, fileName) {
  return path.posix.join("uploads", "media", "shared", folder, fileName);
}

async function findFileOnDisk({ oldUrl, folder, restaurantId }) {
  const fileName = path.basename(oldUrl);
  const candidates = [
    path.join(UPLOAD_ROOT, "media", "shared", folder, fileName),
    path.join(UPLOAD_ROOT, folder, fileName),
    path.join(UPLOAD_ROOT, normalizeRelative(oldUrl)),
  ];

  if (restaurantId) {
    candidates.push(
      path.join(UPLOAD_ROOT, `restaurant_${restaurantId}`, folder, fileName),
      path.join(
        UPLOAD_ROOT,
        `restaurant_${restaurantId}`,
        folder === "ingredient" ? "ingredient" : folder,
        fileName
      )
    );
  }

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

async function linkEntity({ entity, config, stats }) {
  const raw = entity[config.field];
  if (!raw || typeof raw !== "string") return;
  if (raw.startsWith("http")) {
    stats.skippedExternal++;
    return;
  }
  if (raw.includes("/media/shared/")) {
    stats.skippedAlreadyNew++;
    return;
  }

  const relative = normalizeRelative(raw);
  const firstSegment = relative.split("/")[0];
  const folder = LEGACY_FOLDER_MAP[firstSegment];

  if (!folder) {
    stats.skippedUnknownPattern++;
    stats.samples.push({ name: entity.name, url: raw, reason: "unknown folder" });
    return;
  }

  const fileName = path.basename(relative);
  const newUrl = buildSharedUrl(folder, fileName);
  const restaurantId = entity.restaurantId?.toString?.() || null;

  const diskPath = await findFileOnDisk({
    oldUrl: raw,
    folder,
    restaurantId,
  });

  if (!diskPath) {
    stats.missingFile++;
    stats.samples.push({
      name: entity.name,
      url: raw,
      expected: newUrl,
      reason: "file not on disk",
    });
    return;
  }

  let hash;
  let mimeType;
  let size;
  try {
    const fileBuffer = await fs.readFile(diskPath);
    size = fileBuffer.length;
    mimeType = guessContentTypeFromFilename(fileName);
    const hashResult = await getFileHashViaApi({
      fileBuffer,
      originalname: fileName,
    });
    hash = hashResult.hash;
    mimeType = hashResult.mimeType || mimeType;
    size = hashResult.size || size;
  } catch (err) {
    stats.hashFailed++;
    stats.samples.push({
      name: entity.name,
      url: raw,
      reason: `hash failed: ${err.message}`,
    });
    return;
  }

  let mediaDoc = await Media.findOne({
    $or: [{ url: newUrl }, { hash, targetId: entity._id }],
  });

  if (!mediaDoc) {
    mediaDoc = new Media({
      filename: fileName,
      url: newUrl,
      mimeType,
      size,
      hash,
      type: config.mediaType,
      targetType: config.targetType,
      targetId: entity._id,
      restaurantId,
      scope: "shared",
    });
  } else {
    mediaDoc.filename = fileName;
    mediaDoc.url = newUrl;
    mediaDoc.mimeType = mimeType;
    mediaDoc.size = size;
    mediaDoc.hash = hash;
    mediaDoc.type = config.mediaType;
    mediaDoc.targetType = config.targetType;
    mediaDoc.targetId = entity._id;
    mediaDoc.restaurantId = restaurantId;
    mediaDoc.scope = "shared";
  }

  if (APPLY) {
    await mediaDoc.save();
    await config.Model.findByIdAndUpdate(entity._id, {
      $set: { [config.field]: mediaDoc._id },
    });
  }

  stats.linked++;
  console.log(
    `  ${APPLY ? "✅" : "🧪"} ${entity.name}: ${raw} → Media(${mediaDoc._id}) url=${newUrl}`
  );
}

async function processCollection(config) {
  const stats = {
    linked: 0,
    missingFile: 0,
    hashFailed: 0,
    skippedExternal: 0,
    skippedAlreadyNew: 0,
    skippedUnknownPattern: 0,
    samples: [],
  };

  const docs = await mongoose.connection.db
    .collection(config.collection)
    .find({ [config.field]: { $type: 2 } })
    .toArray();

  console.log(`\n── ${config.label}: ${docs.length} legacy string path(s) ──`);

  for (const doc of docs) {
    await linkEntity({ entity: doc, config, stats });
  }

  console.log(`  Linked: ${stats.linked}`);
  console.log(`  Missing file on disk: ${stats.missingFile}`);
  console.log(`  Hash API failed: ${stats.hashFailed}`);
  console.log(`  Skipped (external URL): ${stats.skippedExternal}`);
  console.log(`  Skipped (already media/shared): ${stats.skippedAlreadyNew}`);
  console.log(`  Skipped (unknown path): ${stats.skippedUnknownPattern}`);

  if (stats.samples.length) {
    console.log("  Samples:");
    stats.samples.slice(0, 5).forEach((s) => {
      console.log(`    - ${s.name}: ${s.url} (${s.reason})`);
    });
  }

  return stats;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL missing");
    process.exit(1);
  }

  console.log(`🔧 Link legacy image refs — mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log(`   Upload root: ${UPLOAD_ROOT}`);

  try {
    await fs.access(UPLOAD_ROOT);
  } catch {
    console.error(`❌ MEDIA_UPLOAD_DIR not found: ${UPLOAD_ROOT}`);
    console.error("   Set MEDIA_UPLOAD_DIR in backend .env to your media server uploads folder.");
    process.exit(1);
  }

  await mongoose.connect(process.env.DATABASE_URL);

  const totals = { linked: 0, missingFile: 0 };
  for (const config of ENTITIES) {
    const stats = await processCollection(config);
    totals.linked += stats.linked;
    totals.missingFile += stats.missingFile;
  }

  console.log("\n── Summary ──");
  console.log(`  Would link / linked: ${totals.linked}`);
  console.log(`  Missing files: ${totals.missingFile}`);

  if (!APPLY && totals.linked > 0) {
    console.log("\n  Re-run with --apply to write changes:");
    console.log("  node scripts/migrations/linkLegacyImageRefs.js --apply");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌ Failed:", err.message);
  process.exit(1);
});
