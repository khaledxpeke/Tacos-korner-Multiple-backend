const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");
const path = require("path");
const Media = require("../models/media");

const mediaBackendUrl = process.env.MEDIA_SERVER_URL || "http://localhost:4000";

exports.forwardToMediaBackend = async ({
  filePath,
  type,
  originalname,
  restaurantId,
}) => {
  const cleanUrl = (fullUrl) => {
        if (!fullUrl) return null;

        if (fullUrl.startsWith(mediaBackendUrl)) {
            return fullUrl.substring(mediaBackendUrl.length).replace(/^\/+/g, '');
        }
        return fullUrl;
    };
  const formHash = new FormData();
  formHash.append("file", fs.createReadStream(filePath), {
    filename: originalname,
  });

  const hashResponse = await axios.post(
    `${mediaBackendUrl}/api/media/hash`,
    formHash,
    {
      headers: formHash.getHeaders(),
    }
  );
  const { hash, mimeType, size } = hashResponse.data;

  const existingMedia = await Media.findOne({ hash: hash });

  if (existingMedia) {
    const relativeUrl = cleanUrl(existingMedia.url);
    return {
      url: relativeUrl,
      hash: hash,
      mimeType: existingMedia.mimeType,
      size: existingMedia.size,
      filename: existingMedia.filename,
      existing: true,
    };
  }

  const formSave = new FormData();
  formSave.append("file", fs.createReadStream(filePath), {
    filename: originalname,
  });

  const params = new URLSearchParams();
  params.append("type", type);
  params.append("hash", hash);
  if (restaurantId) params.append("restaurantId", restaurantId);

  const url = `${mediaBackendUrl}/api/media/upload?${params.toString()}`;

  const saveResponse = await axios.post(url, formSave, {
    headers: formSave.getHeaders(),
  });

  return saveResponse.data;
};
