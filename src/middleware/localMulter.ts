import multer, { type FileFilterCallback } from "multer";
import path from "path";
import fs from "fs/promises";
import type { Request } from "express";
import { paths } from "../config/paths";

const uploadDir = paths.uploads;

// Whitelist of known subfolder names actually used across the app when
// uploading via localUpload (see controllers/*.ts and media.controller.ts).
// Anything outside of this list is rejected to prevent path traversal via
// req.query.type / req.body.type being interpolated into a filesystem path.
const ALLOWED_UPLOAD_TYPES = [
  "general",
  "image",
  "product",
  "products",
  "category",
  "ingredient",
  "ingrediants",
  "allergy_icon",
  "allergies",
  "banner",
  "banners",
  "logo",
  "carousel",
] as const;

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
];

class InvalidUploadTypeError extends Error {
  constructor(type: string) {
    super(`Invalid upload type: ${type}`);
    this.name = "InvalidUploadTypeError";
  }
}

const resolveUploadType = (req: Request): string => {
  const type =
    (typeof req.query.type === "string" && req.query.type) ||
    (typeof req.body?.type === "string" && req.body.type) ||
    "general";
  return type;
};

const storage = multer.diskStorage({
  destination: async (req, _file, cb) => {
    const type = resolveUploadType(req);
    if (!(ALLOWED_UPLOAD_TYPES as readonly string[]).includes(type)) {
      cb(new InvalidUploadTypeError(type), "");
      return;
    }
    const targetDir = path.join(uploadDir, type);
    await fs.mkdir(targetDir, { recursive: true });
    cb(null, targetDir);
  },
  filename: (_req, file, cb) => {
    // path.basename strips any directory separators (e.g. "../../evil.png")
    // so a crafted originalname can't escape the destination directory,
    // since multer joins destination + filename verbatim.
    const baseName = path.basename(file.originalname).replace(/\s+/g, "_");
    cb(null, `${Date.now()}-${baseName}`);
  },
});

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(new Error(`Invalid file type: ${file.mimetype}`));
    return;
  }
  cb(null, true);
};

const localUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 },
});

export default localUpload;
