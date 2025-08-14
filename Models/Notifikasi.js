const mongoose = require('mongoose');

const NotifikasiSchema = new mongoose.Schema(
  {
    jenis: { type: String, required: true }, // 'Pesanan' atau 'Reservasi'
    pesan: { type: String, required: true },
    waktu: { type: Date, default: Date.now }, // default waktu sekarang
    terbaca: { type: Boolean, default: false },
    refId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pesanan', // bisa juga 'Reservasi'
    },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Notifikasi || mongoose.model('Notifikasi', NotifikasiSchema);
