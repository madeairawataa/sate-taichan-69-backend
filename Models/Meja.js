const mongoose = require('mongoose');

const mejaSchema = new mongoose.Schema({
  nomor: {
    type: String,
    required: true,
    trim: true,
  },
  kapasitas: {
    type: Number,
    required: true,
    min: 1,
  },
  gambar: {
    type: String,
    default: '',
  },
  publicId: {
    type: String,
    default: '',
  },
}, { timestamps: true });

module.exports = mongoose.model('Meja', mejaSchema);
