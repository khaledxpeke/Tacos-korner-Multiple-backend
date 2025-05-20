const StatusHistory = require("../models/statusHistory");
const express = require("express");
const app = express();
require("dotenv").config();
app.use(express.json());

exports.getStatusHistory = async (req, res) => {
    try {
      const { historyId } = req.params;
      const { restaurantId } = req;
      
      const statusHistory = await StatusHistory.find({ historyId, restaurantId })
        .sort({ updatedAt: -1 });
      
      res.status(200).json(statusHistory);
    } catch (error) {
      console.error("Erreur de trouvée des status d'historique", error);
      res.status(500).json({ error: "Erreur interne du serveur" });
    }
  };