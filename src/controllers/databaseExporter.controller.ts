import { ObjectId } from "mongodb";
import fs from "fs";
import path from "path";
import multer from "multer";
import type { Request, Response } from "express";
import { CarouselMedia } from "../models/carouselMedia.model";
import { Category } from "../models/category.model";
import { Desert } from "../models/desert.model";
import { Drink } from "../models/drink.model";
import { Extra } from "../models/extra.model";
import { History } from "../models/history.model";
import { Ingrediant } from "../models/ingrediant.model";
import { Product } from "../models/product.model";
import { Settings } from "../models/settings.model";
import { Type } from "../models/type.model";
import { TypeVariation } from "../models/typeVariation.model";
import { User } from "../models/user.model";
import { Variation } from "../models/variation.model";
import { PROJECT_ROOT, paths } from "../config/paths";
import { errorMessage } from "../utils/helpers";

type ImportDoc = Record<string, unknown> & {
  _id: { toString(): string } | string;
  image?: unknown;
  media?: unknown;
  restaurantId?: unknown;
};

type ExporterModel = {
  schema: { paths: Record<string, unknown> };
  find: (filter: Record<string, unknown>) => {
    lean: () => Promise<unknown[]>;
  };
  insertMany: (
    docs: ImportDoc[],
    options: { ordered: boolean }
  ) => Promise<unknown>;
};

const models = {
  CarouselMedia,
  Category,
  Desert,
  Drink,
  Extra,
  History,
  Ingrediant,
  Product,
  Settings,
  Type,
  TypeVariation,
  User,
  Variation,
} as unknown as Record<string, ExporterModel>;

function updateOids(obj: unknown, oidMap: Map<string, string>): void {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      if (typeof obj[i] === "string") {
        if (/^[0-9a-fA-F]{24}$/.test(obj[i]) && oidMap.has(obj[i])) {
          obj[i] = oidMap.get(obj[i]);
        }
      } else {
        updateOids(obj[i], oidMap);
      }
    }
    return;
  }

  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const value = record[key];

    if (typeof value === "string") {
      if (/^[0-9a-fA-F]{24}$/.test(value) && oidMap.has(value)) {
        record[key] = oidMap.get(value);
      }
    } else if (Array.isArray(value)) {
      updateOids(value, oidMap);
    } else if (typeof value === "object" && value !== null) {
      updateOids(value, oidMap);
    }
  }
}

export const exportRestaurantData = async (req: Request, res: Response) => {
  const { restaurantId } = req;
  if (!restaurantId)
    return res
      .status(400)
      .json({ message: "Restaurant ID missing from middleware." });

  try {
    const exportDataRaw: Record<string, unknown[]> = {};
    const exportDataCloned: Record<string, unknown[]> = {};
    const counts: { raw: Record<string, number>; cloned: Record<string, number> } = {
      raw: {},
      cloned: {},
    };

    for (const [name, Model] of Object.entries(models)) {
      const query = Model.schema.paths.restaurantId ? { restaurantId } : {};
      const data = await Model.find(query).lean();
      if (data?.length) {
        exportDataRaw[name] = data;
        counts.raw[name] = data.length;
      }
    }
    for (const [name] of Object.entries(models)) {
      if (name === "History") continue;
      if (exportDataRaw[name]) {
        exportDataCloned[name] = exportDataRaw[name];
        counts.cloned[name] = exportDataRaw[name].length;
      }
    }

    if (Object.keys(exportDataRaw).length === 0)
      return res
        .status(404)
        .json({ message: "No data found for this restaurant." });

    const exportFolder = path.join(PROJECT_ROOT, "data", "exports");
    if (!fs.existsSync(exportFolder))
      fs.mkdirSync(exportFolder, { recursive: true });

    const now = new Date();
    const timestamp = `${now.getDate().toString().padStart(2, "0")}-${(now.getMonth() + 1).toString().padStart(2, "0")}-${now.getFullYear()}`;
    const rawFileName = `restaurant_${restaurantId}_raw_${timestamp}.json`;
    const clonedFileName = `restaurant_${restaurantId}_cloned_${timestamp}.json`;
    const rawFilePath = path.join(exportFolder, rawFileName);
    const clonedFilePath = path.join(exportFolder, clonedFileName);

    await Promise.all([
      fs.promises.writeFile(rawFilePath, JSON.stringify(exportDataRaw, null, 2), "utf-8"),
      fs.promises.writeFile(clonedFilePath, JSON.stringify(exportDataCloned, null, 2), "utf-8"),
    ]);

    const [rawStat, clonedStat] = await Promise.all([
      fs.promises.stat(rawFilePath),
      fs.promises.stat(clonedFilePath),
    ]);

    return res.json({
      success: true,
      message: "Export files generated successfully.",
      files: [
        { type: "raw", filename: rawFileName, size: rawStat.size, docCounts: counts.raw },
        { type: "cloned", filename: clonedFileName, size: clonedStat.size, docCounts: counts.cloned },
      ],
    });
  } catch (err) {
    console.error("Export error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Error exporting data", error: errorMessage(err) });
  }
};

export const downloadRestaurantExport = async (req: Request, res: Response) => {
  const { restaurantId } = req;
  const { file } = req.query;

  if (!restaurantId) {
    return res.status(400).json({ message: "Restaurant ID missing from middleware." });
  }
  if (!file) {
    return res.status(400).json({ message: "file query parameter is required." });
  }

  const fileName = typeof file === "string" ? file : String(file);
  const safeRegex = new RegExp(`^restaurant_${restaurantId}_(raw|cloned)_\\d{2}-\\d{2}-\\d{4}\\.json$`);
  if (!safeRegex.test(fileName)) {
    return res.status(403).json({ message: "Invalid or forbidden file name." });
  }

  const exportFolder = path.join(PROJECT_ROOT, "data", "exports");
  const fullPath = path.join(exportFolder, fileName);

  if (path.dirname(fullPath) !== exportFolder) {
    return res.status(400).json({ message: "Invalid path." });
  }

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ message: "File not found." });
  }

  return res.download(fullPath, fileName, (err) => {
    if (err) {
      console.error("Download error:", err);
    }
  });
};

const imageCollections: Record<string, string> = {
  Category: "category",
  Product: "product",
  Ingrediant: "ingrediants",
  Extra: "extras",
  Desert: "dessert",
  Drink: "boisson",
  CarouselMedia: "carousel",
};

function copyImageIfExists(
  imagePath: unknown,
  collectionName: string,
  newRestaurantId: string,
  uniqueId: unknown
): string | null {
  if (!imagePath || typeof imagePath !== "string") return null;
  const baseUploadDir = paths.uploads;
  const subDir = imageCollections[collectionName];
  if (!subDir) return imagePath;

  const oldImageFullPath = path.join(PROJECT_ROOT, imagePath);
  if (!fs.existsSync(oldImageFullPath)) return imagePath;

  const ext = path.extname(imagePath);
  const newFileName = `${newRestaurantId}_${uniqueId}${ext}`;
  const newImageRelPath = path.join("uploads", subDir, newFileName);
  const newImageFullPath = path.join(baseUploadDir, subDir, newFileName);

  fs.copyFileSync(oldImageFullPath, newImageFullPath);

  return newImageRelPath.replace(/\\/g, "/");
}

const multerUpload = multer({ dest: path.join(PROJECT_ROOT, "data") });

export const importRestaurantData = async (req: Request, res: Response) => {
  const { restaurantId: newRestaurantId } = req;
  if (!newRestaurantId)
    return res.status(400).json({ message: "Target restaurant ID missing." });

  if (!req.file)
    return res.status(400).json({ message: "JSON file is required." });

  const filePath = req.file.path;

  try {
    const jsonData = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<
      string,
      ImportDoc[] | undefined
    >;
    const oidMap = new Map<string, string>();
    const insertedCollections: string[] = [];

    for (const [name] of Object.entries(models)) {
      const data = jsonData[name];
      if (!data || data.length === 0) continue;
      data.forEach((doc) => {
        const oldId = doc._id.toString();
        const newId = new ObjectId().toHexString();
        oidMap.set(oldId, newId);
      });
    }

    for (const [name, Model] of Object.entries(models)) {
      const data = jsonData[name];
      if (!data || data.length === 0) continue;

      const clonedData = data.map((doc) => {
        const newDoc: ImportDoc = { ...doc };
        const oldId = newDoc._id.toString();
        newDoc._id = oidMap.get(oldId) || oldId;
        newDoc.restaurantId = newRestaurantId;
        if (newDoc.image) {
          newDoc.image = copyImageIfExists(
            newDoc.image,
            name,
            newRestaurantId,
            newDoc._id
          );
        }
        if (name === "CarouselMedia" && newDoc.media) {
          newDoc.media = copyImageIfExists(
            newDoc.media,
            name,
            newRestaurantId,
            newDoc._id
          );
        }
        return newDoc;
      });

      clonedData.forEach((doc) => updateOids(doc, oidMap));

      try {
        await Model.insertMany(clonedData, { ordered: false });
        insertedCollections.push(name);
      } catch (err) {
        const code =
          err && typeof err === "object" && "code" in err
            ? (err as { code: unknown }).code
            : undefined;
        if (code === 11000) {
          console.log(`Duplicate keys skipped in collection ${name}`);
          insertedCollections.push(name);
        } else {
          throw err;
        }
      }
    }

    fs.unlinkSync(filePath);

    return res.json({
      success: true,
      message: "Import complete",
      insertedCollections,
    });
  } catch (err) {
    console.error("Import error:", err);
    return res.status(500).json({
      success: false,
      message: "Error importing data",
      error: errorMessage(err),
    });
  }
};

export const upload = multerUpload.single("file");
