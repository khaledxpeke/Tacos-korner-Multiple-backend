import multer, { type FileFilterCallback } from "multer";
import path from "path";
import type { Request } from "express";
import { paths } from "../config/paths";

// Note: req.uploadTarget is set server-side by trusted controller code
// (never derived from user input), so path traversal is not a concern here.
// We still restrict mimetypes/size the same way localMulter.ts does.
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
];

export const imageFileFilter = (
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

export const imageFileLimits = { fileSize: 10 * 1024 * 1024 };

const storage = multer.diskStorage({
  destination: function (req, _file, cb) {
    const baseUploadDir = paths.uploads;

    let uploadDir: string;
    switch (req.uploadTarget) {
      case "category":
        uploadDir = path.join(baseUploadDir, "category");
        break;
      case "restaurant":
        uploadDir = path.join(baseUploadDir, "restaurant");
        break;
      case "product":
        uploadDir = path.join(baseUploadDir, "product");
        break;
      case "ingrediants":
        uploadDir = path.join(baseUploadDir, "ingrediants");
        break;
      case "extras":
        uploadDir = path.join(baseUploadDir, "extras");
        break;
      case "dessert":
        uploadDir = path.join(baseUploadDir, "dessert");
        break;
      case "boisson":
        uploadDir = path.join(baseUploadDir, "boisson");
        break;
      default:
        uploadDir = baseUploadDir;
        break;
    }

    cb(null, uploadDir);
  },
  filename: function (_req, file, cb) {
    // path.extname on a crafted originalname (e.g. "../../evil.png") still
    // only yields the extension, so this is already safe from traversal,
    // but use basename defensively in case the extension logic changes.
    const fileExt = path.extname(path.basename(file.originalname));
    cb(null, Date.now() + fileExt);
  },
});

export default storage;
