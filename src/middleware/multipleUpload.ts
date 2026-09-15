import multer from "multer";
import path from "path";
import fs from "fs";
import { paths } from "../config/paths";

const uploadDir = paths.uploads;
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    // path.basename strips directory separators (e.g. "../../evil.png") so a
    // crafted originalname can't escape the destination directory, since
    // multer joins destination + filename verbatim.
    const baseName = path.basename(file.originalname);
    cb(null, `${Date.now()}-${baseName}`);
  },
});

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/gif"];

const multipleUpload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error("Only image files are allowed!"));
    }
    cb(null, true);
  },
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
}).fields([
  { name: "logo", maxCount: 1 },
  { name: "banner", maxCount: 1 },
]);

export default multipleUpload;
