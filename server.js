const dotenv = require('dotenv');
dotenv.config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
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
const pembayaranRoute = require('./Routes/pembayaran'); // ✅ Tambahan

// ⬇️ Import fungsi update status reservasi otomatis
const updateReservasiStatus = require('./Utils/updateReservasiStatus');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

app.set('io', io); // ⬅️ Penting untuk emit dari controller

// Konfigurasi Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Socket.io
global.io = io;
io.on('connection', (socket) => {
  console.log('🔌 Socket connected');
});

const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
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
app.use('/api/pembayaran', pembayaranRoute); // ✅ Tambahan
app.use('/api/pembayaran', require('./Routes/pembayaran'));

// ⏰ Jalankan update status reservasi setiap 1 menit
setInterval(() => updateReservasiStatus(io), 60 * 1000);

// Jalankan Server
server.listen(port, () => {
  console.log(`🚀 Server berjalan di http://localhost:${port}`);
});
