const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema(
  {
    pesananId: { type: String, required: true },
    namaPemesan: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    komentar: { type: String, default: '' },
  },
  { timestamps: true }
);

// Gunakan mongoose.models untuk menghindari overwrite
module.exports = mongoose.models.Feedback || mongoose.model('Feedback', feedbackSchema);