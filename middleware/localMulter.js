const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;

const uploadDir = path.join(__dirname, "..", "uploads");

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    // ✅ Use type from query, body, or fallback to "general"
    const type = req.query.type || req.body.type || "general";
    const targetDir = path.join(uploadDir, type);
    await fs.mkdir(targetDir, { recursive: true });
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

module.exports = multer({ 
  storage, 
  limits: { fileSize: 100 * 1024 * 1024 }
});