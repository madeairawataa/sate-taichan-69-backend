const cloudinary = require('cloudinary').v2;
const multer = require('multer');

// Konfigurasi Cloudinary dari environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Validasi konfigurasi Cloudinary
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.error('❌ Cloudinary configuration missing. Please check .env file.');
}

// Setup Multer untuk form-data dengan memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Hanya file JPG, JPEG, atau PNG yang diizinkan'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // Batas ukuran file 5MB
});

// Fungsi untuk menghapus gambar dari Cloudinary
const deleteImage = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId, { invalidate: true });
    console.log(`✅ Gambar dengan publicId ${publicId} berhasil dihapus dari Cloudinary`);
  } catch (err) {
    console.error(`❗ Gagal hapus gambar dari Cloudinary: ${err.message}`);
  }
};

// Ekspor modul
module.exports = { cloudinary, upload, deleteImage };