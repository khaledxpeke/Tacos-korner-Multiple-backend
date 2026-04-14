// migrationUtils.js (running on Main Backend)
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");

const mediaBackendUrl = process.env.MEDIA_SERVER_URL || "http://localhost:4000";

function guessContentTypeFromFilename(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
    ".ico": "image/x-icon",
  };
  return map[ext] || "application/octet-stream";
}

exports.guessContentTypeFromFilename = guessContentTypeFromFilename;

exports.getFileHashViaApi = async ({ fileBuffer, originalname }) => {
  const contentType = guessContentTypeFromFilename(originalname);
  const formHash = new FormData();
  formHash.append("file", fileBuffer, {
    filename: originalname,
    contentType,
  });

  const hashResponse = await axios.post(
    `${mediaBackendUrl}/api/media/hash`,
    formHash,
    {
      headers: formHash.getHeaders(),
    }
  );
  return hashResponse.data;
};
