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
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const multipleUpload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.match(/\.(jpg|JPG|jpeg|JPEG|png|PNG|gif|GIF)$/)) {
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
