
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");
const path = require("path");

const mediaBackendUrl = process.env.MEDIA_SERVER_URL || "http://localhost:4000";

exports.forwardToMediaBackend = async ({ filePath, restaurantId, type, originalname }) => {
  try {
    const form = new FormData();
    form.append("file", fs.createReadStream(filePath), {
      filename: originalname || path.basename(filePath),
    });

    const params = new URLSearchParams();
    params.append("type", type);
    if (restaurantId) {
      params.append("restaurantId", restaurantId);
    }

    const url = `${mediaBackendUrl}/api/media/upload?${params.toString()}`;

    const response = await axios.post(url, form, {
      headers: form.getHeaders(),
      timeout: 30000,
    });
    return response.data;
  } catch (err) {
    const errorInfo = err.response?.data || err.message || err;
    throw new Error(
      typeof errorInfo === "string" ? errorInfo : JSON.stringify(errorInfo)
    );
  }
};
