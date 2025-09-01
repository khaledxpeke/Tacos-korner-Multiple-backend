// models/StatusHistory.js
const mongoose = require('mongoose');

const statusHistorySchema = new mongoose.Schema({
  historyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'History',
    required: true,
    index: true 
  },
  status: {
    type: String,
    enum: ["enCours", "terminee", "annulee", "enRetard", "echouee", "remboursee", "enAttente"],
    required: true
  },
  updatedBy: {
    type: String,
    required: true
  },
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant'
  }
}, { timestamps: true });

module.exports = mongoose.model('StatusHistory', statusHistorySchema);