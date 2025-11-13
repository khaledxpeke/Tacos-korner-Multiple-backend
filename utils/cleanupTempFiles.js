const fs = require("fs").promises;

async function cleanupTempFile(filePath) {
  if (!filePath) return;
  try {
    await fs.access(filePath);
    await fs.unlink(filePath);
  } catch (cleanupErr) {
    console.error("Error deleting temp file:", cleanupErr);
  }
}
module.exports = cleanupTempFile;