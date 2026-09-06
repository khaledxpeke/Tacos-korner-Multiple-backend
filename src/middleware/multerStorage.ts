import multer from "multer";
import path from "path";
import { paths } from "../config/paths";

const storage = multer.diskStorage({
  destination: function (req, _file, cb) {
    const baseUploadDir = paths.uploads;

    let uploadDir: string;
    switch (req.uploadTarget) {
      case "category":
        uploadDir = path.join(baseUploadDir, "category");
        break;
      case "restaurant":
        uploadDir = path.join(baseUploadDir, "restaurant");
        break;
      case "product":
        uploadDir = path.join(baseUploadDir, "product");
        break;
      case "ingrediants":
        uploadDir = path.join(baseUploadDir, "ingrediants");
        break;
      case "extras":
        uploadDir = path.join(baseUploadDir, "extras");
        break;
      case "dessert":
        uploadDir = path.join(baseUploadDir, "dessert");
        break;
      case "boisson":
        uploadDir = path.join(baseUploadDir, "boisson");
        break;
      default:
        uploadDir = baseUploadDir;
        break;
    }

    cb(null, uploadDir);
  },
  filename: function (_req, file, cb) {
    const fileExt = path.extname(file.originalname);
    cb(null, Date.now() + fileExt);
  },
});

export default storage;
