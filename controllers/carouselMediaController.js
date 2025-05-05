const CarouselMedia = require("../models/carouselMedia");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Settings = require("../models/settings");
const uploadDir = path.join(__dirname, "..", "uploads", "carousel");
const url = process.env.CAROUSEL_URL;
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "video/mp4",
    ];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Type de fichier non valide"), false);
    }
    cb(null, true);
  },
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
}).array("files", 10);

// Add new media
exports.addMedia = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    try {
      const { restaurantId } = req;
      const { duration, mediaType } = req.body;
      const lastMedia = await CarouselMedia.findOne({ restaurantId }).sort(
        "-order"
      );
      const startOrder = lastMedia ? parseInt(lastMedia.order) : 0;

      const savedMedia = await Promise.all(
        req.files.map(async (file, index) => {
          const media = new CarouselMedia({
            mediaType: mediaType,
            fileUrl: `uploads/carousel/${file.filename}`,
            duration: mediaType === "image" ? duration : null,
            order: startOrder + index + 1,
            restaurantId,
          });
          return media.save();
        })
      );
      res.status(201).json(savedMedia);
    } catch (error) {
      if (req.files) {
        req.files.forEach((file) => {
          fs.unlinkSync(
            path.join(__dirname, "..", "uploads", "carousel", file.filename)
          );
        });
      }
      res.status(500).json({ error: error.message });
    }
  });
};

exports.updateOrder = async (req, res) => {
  try {
    const { items } = req.body;
    const { restaurantId } = req;
    await Promise.all(
      items.map((item) =>
        CarouselMedia.findOneAndUpdate(
          { _id: item.id, restaurantId },
          { order: item.order }
        )
      )
    );

    res.status(200).json({ message: "Ordre mise à jour avec succès" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAllMedia = async (req, res) => {
  try {
    const { restaurantId } = req;
    const media = await CarouselMedia.find({
      isActive: true,
      restaurantId,
    }).sort("order");
    res.status(200).json(media);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getCarouselStream = async (req, res) => {
  try {
    const { restaurantId } = req;
    const activeMedia = await CarouselMedia.find({
      isActive: true,
      restaurantId,
    })
      .sort("order")
      .select("mediaType fileUrl duration");
    const settings = await Settings.findOne({ restaurantId });
    const STATIC_DURATION = settings.carouselDuration || 5;
    res.render("carousel-viewer", {
      media: activeMedia,
      mediaDurations: activeMedia.map(() => STATIC_DURATION).join(","),
      mediaTypes: activeMedia.map((m) => m.mediaType),
      apiUrl: url,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteMedia = async (req, res) => {
  try {
    const { restaurantId } = req;
    const media = await CarouselMedia.findOne({
      _id: req.params.id,
      restaurantId,
    });
    if (!media) {
      return res.status(404).json({ message: "Média non trouvé" });
    }

    fs.unlinkSync(path.join(__dirname, "..", media.fileUrl));
    await CarouselMedia.findOneAndDelete({ _id: req.params.id, restaurantId });

    res.status(200).json({ message: "Le média a été supprimé avec succès" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
