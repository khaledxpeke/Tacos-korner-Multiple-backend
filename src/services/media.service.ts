import fs from "fs";
import axios from "axios";
import FormData from "form-data";
import type { Request } from "express";
import { Media } from "../models/media.model";
import { env } from "../config/environment";

const mediaBackendUrl = env.mediaServerUrl;

export const forwardToMediaBackend = async ({
  filePath,
  type,
  originalname,
  restaurantId,
}: {
  filePath: string;
  type: string;
  originalname: string;
  restaurantId?: string;
}) => {
  const cleanUrl = (fullUrl?: string | null) => {
    if (!fullUrl) return null;

    if (fullUrl.startsWith(mediaBackendUrl)) {
      return fullUrl.substring(mediaBackendUrl.length).replace(/^\/+/g, "");
    }
    return fullUrl;
  };

  const formHash = new FormData();
  formHash.append("file", fs.createReadStream(filePath), {
    filename: originalname,
  });

  const hashResponse = await axios.post<{
    hash: string;
    mimeType?: string;
    size?: number;
  }>(`${mediaBackendUrl}/api/media/hash`, formHash, {
    headers: formHash.getHeaders(),
  });
  const { hash, mimeType, size } = hashResponse.data;

  const existingMedia = await Media.findOne({ hash });

  if (existingMedia) {
    const relativeUrl = cleanUrl(existingMedia.url);
    return {
      url: relativeUrl,
      hash,
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

  return saveResponse.data as {
    url: string;
    hash: string;
    mimeType?: string;
    size?: number;
    filename?: string;
  };
};

export const resolveMediaFromRequest = async ({
  req,
  restaurantId,
  userId,
  targetType,
  targetId = null,
  type,
}: {
  req: Request;
  restaurantId?: string | null;
  userId?: string;
  targetType: string;
  targetId?: unknown;
  type: string;
}) => {
  if (req.file) {
    const mediaResponse = await forwardToMediaBackend({
      filePath: req.file.path,
      restaurantId: restaurantId?.toString(),
      type,
      originalname: req.file.originalname,
    });

    let mediaDoc = await Media.findOne({ hash: mediaResponse.hash });

    if (!mediaDoc) {
      mediaDoc = new Media({
        filename: mediaResponse.filename || req.file.originalname,
        url: mediaResponse.url,
        mimeType: mediaResponse.mimeType || req.file.mimetype,
        size: mediaResponse.size || req.file.size,
        hash: mediaResponse.hash,
        uploadedBy: userId,
        targetType,
        targetId,
        type,
        restaurantId: restaurantId?.toString(),
        scope: "shared",
      });
      await mediaDoc.save();
    }

    return mediaDoc;
  }

  if (req.body.mediaId) {
    const mediaDoc = await Media.findOne({
      _id: req.body.mediaId,
      scope: "shared",
    });

    if (!mediaDoc) {
      const error = new Error("Media not found") as Error & { status?: number };
      error.status = 404;
      throw error;
    }

    return mediaDoc;
  }

  return null;
};
