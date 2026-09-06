import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { paths } from "../config/paths";

const uploadDir = paths.uploads;

const storage = multer.diskStorage({
  destination: async (req, _file, cb) => {
    const type =
      (typeof req.query.type === "string" && req.query.type) ||
      (typeof req.body?.type === "string" && req.body.type) ||
      "general";
    const targetDir = path.join(uploadDir, type);
    await fs.mkdir(targetDir, { recursive: true });
    cb(null, targetDir);
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const localUpload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
});

export default localUpload;
