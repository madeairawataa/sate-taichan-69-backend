const mongoose = require('mongoose');

const menuSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  nama: { type: String, required: true },
  harga: { type: Number, required: true },
  kategori: { type: String, required: true },
  gambar: { type: String },
  publicId: { type: String }, 
  deskripsi: { type: String },
}, {
  timestamps: true 
});

module.exports = mongoose.models.Menu || mongoose.model('Menu', menuSchema);
