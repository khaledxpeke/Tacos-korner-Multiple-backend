// migrationUtils.js (running on Main Backend)
const axios = require("axios");
const FormData = require("form-data");

const mediaBackendUrl = process.env.MEDIA_SERVER_URL || "http://localhost:4000";

exports.getFileHashViaApi = async ({ fileBuffer, originalname }) => {
    const formHash = new FormData();
    formHash.append("file", fileBuffer, {
        filename: originalname,
        contentType: 'image/jpeg', 
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