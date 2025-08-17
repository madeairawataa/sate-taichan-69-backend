const dotenv = require('dotenv');
dotenv.config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;

// Import Routes
const authRoutes = require('./Routes/auth');
const menuRoutes = require('./Routes/menu');
const pesananRoutes = require('./Routes/Pesanan');
const notifikasiRoutes = require('./Routes/notifikasi');
const dashboardRoutes = require('./Routes/dashboard');
const mejaRoutes = require('./Routes/meja');
const feedbackRoutes = require('./Routes/feedbackRoutes');
const historyRoutes = require('./Routes/history');
const reservasiMejaRoutes = require('./Routes/reservasiMeja');
const pembayaranRoute = require('./Routes/pembayaran');

// Import fungsi update status reservasi otomatis
const updateReservasiStatus = require('./Utils/updateReservasiStatus');

const app = express();
const port = process.env.PORT || 5000;

// Route untuk cek status reservasi/pesanan
app.get("/status", async (req, res) => {
  try {
    const { orderId } = req.query;
    if (!orderId) {
      return res.status(400).json({ error: "orderId wajib dikirim" });
    }

    const reservasi = await Reservasi.findById(orderId);
    if (!reservasi) {
      return res.status(404).json({ error: "Reservasi tidak ditemukan" });
    }

    res.json({
      orderId: reservasi._id,
      nama: reservasi.nama,
      status: reservasi.status, // contoh: "Menunggu", "Diterima", "Selesai"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});

// Konfigurasi Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? 'https://sate-taichan-69-frontend.vercel.app' : 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('✅ MongoDB terkoneksi'))
  .catch((err) => console.error('❌ Gagal koneksi MongoDB:', err));

// Routes
app.use('/auth', authRoutes);
app.use('/menu', menuRoutes);
app.use('/makanan', menuRoutes);
app.use('/api/pesanan', pesananRoutes);
app.use('/notifikasi', notifikasiRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/meja', mejaRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/reservasi', reservasiMejaRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/pembayaran', pembayaranRoute);

// Endpoint untuk update reservasi (digunakan untuk cron jobs)
app.get('/api/update-reservasi', async (req, res) => {
  try {
    await updateReservasiStatus();
    res.json({ message: 'Reservasi status updated successfully' });
  } catch (error) {
    console.error('Error updating reservasi:', error);
    res.status(500).json({ message: 'Error updating reservasi' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Jalankan server hanya di lokal (tidak untuk Vercel)
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`🚀 Server berjalan di http://localhost:${port}`);
  });
}

// Export app untuk Vercel
module.exports = app;