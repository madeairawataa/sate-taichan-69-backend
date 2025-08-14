const mongoose = require('mongoose');

const reservasiMejaSchema = new mongoose.Schema({
  uuid: { type: String, required: true, unique: true }, 
  nama: { type: String, required: true },
  noReservasi: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  meja: { type: String, required: true },
  waktu: { type: String, required: true },
  jumlahOrang: { type: Number, required: true },
  catatan: { type: String },
  tanggalReservasi: { type: Date, required: true },
  status: {
  type: String,
  enum: ['Belum Aktif', 'Aktif', 'Selesai'],
  default: 'Belum Aktif'
},
  gambarMeja: { type: String }, //
}, {
  timestamps: true,
});


module.exports = mongoose.models.ReservasiMeja || mongoose.model('ReservasiMeja', reservasiMejaSchema);
