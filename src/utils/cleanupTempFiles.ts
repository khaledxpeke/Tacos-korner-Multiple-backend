import fs from "fs/promises";

export async function cleanupTempFile(filePath?: string | null): Promise<void> {
  if (!filePath) return;
  try {
    await fs.access(filePath);
    await fs.unlink(filePath);
  } catch (cleanupErr) {
    console.error("Error deleting temp file:", cleanupErr);
  }
}

export default cleanupTempFile;
