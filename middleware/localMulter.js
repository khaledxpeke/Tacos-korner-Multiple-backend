const multer = require("multer");
const path = require("path");
const fs = require("fs");
const localUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const tempDir = path.join(process.cwd(), "temp");
      fs.mkdirSync(tempDir, { recursive: true });
      cb(null, tempDir);
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

module.exports = localUpload;