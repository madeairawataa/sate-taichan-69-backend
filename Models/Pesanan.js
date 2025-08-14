const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  nama: { type: String, required: true },
  jumlah: { type: Number, required: true },
  harga: { type: Number, required: true },
  gambar: { type: String, default: '' },
});

const pesananSchema = new mongoose.Schema(
  {
    userId: { type: String, default: null },
    uuid: {
      type: String,
      required: function () {
        return !this.userId;
      },
    },
    namaPemesan: { type: String, default: 'Pengguna' },
    nomorPesanan: { type: String, required: true, unique: true },
    nomorMeja: { type: String, default: '-' },
    catatan: { type: String, default: '' },
    tipePesanan: { type: String, default: 'Dine In' },
    totalHarga: { type: Number, required: true },
    items: { type: [itemSchema], required: true },
    status: {
      type: String,
     enum: [ 'Menunggu', 'Diproses', 'Siap Diantar', 'Selesai', 'Dibatalkan'],
    default: 'Menunggu',
  },
  externalId: { type: String, unique: true },
    feedback: {
      rating: { type: Number, default: 0 },
      komentar: { type: String, default: '' },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.models.Pesanan || mongoose.model('Pesanan', pesananSchema);