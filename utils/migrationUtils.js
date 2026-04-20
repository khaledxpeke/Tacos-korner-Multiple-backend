// migrationUtils.js (running on Main Backend)
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");

function getMediaBackendBaseUrl() {
  const raw = process.env.MEDIA_SERVER_URL || "http://localhost:4000";
  return String(raw).trim().replace(/\/+$/, "");
}

exports.getMediaBackendBaseUrl = getMediaBackendBaseUrl;

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

  const base = getMediaBackendBaseUrl();
  const url = `${base}/api/media/hash`;

  try {
    const hashResponse = await axios.post(url, formHash, {
      headers: formHash.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: () => true,
    });

    if (hashResponse.status < 200 || hashResponse.status >= 300) {
      const detail =
        typeof hashResponse.data === "object"
          ? JSON.stringify(hashResponse.data)
          : String(hashResponse.data);
      throw new Error(
        `Media hash API ${hashResponse.status} at ${url}: ${detail || hashResponse.statusText}`
      );
    }

    const data = hashResponse.data;
    if (!data || data.hash == null) {
      throw new Error(
        `Media hash API returned no hash from ${url}: ${JSON.stringify(data)}`
      );
    }
    return data;
  } catch (err) {
    if (err.response) {
      const detail =
        typeof err.response.data === "object"
          ? JSON.stringify(err.response.data)
          : String(err.response.data);
      throw new Error(
        `Media hash API ${err.response.status} at ${url}: ${detail || err.message}`
      );
    }
    if (err.code === "ECONNREFUSED") {
      throw new Error(
        `Cannot reach media server at ${base} (${err.code}). Is it running? Is MEDIA_SERVER_URL correct in .env?`
      );
    }
    throw err;
  }
};
