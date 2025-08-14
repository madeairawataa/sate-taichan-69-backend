const express = require('express');
const router = express.Router();
const Menu = require('../Models/Menu'); // cek huruf besar sesuai folder
const verifyAdmin = require('../Middleware/VerifyAdmin');
const { cloudinary, upload, deleteImage } = require('../Utils/cloudinary'); // cek huruf besar

// GET semua menu
router.get('/', async (req, res) => {
  try {
    const menus = await Menu.find().sort({ nama: 1 });
    res.json(menus);
  } catch (err) {
    console.error('Error fetching menu:', err);
    res.status(500).json({ error: 'Gagal mengambil data menu' });
  }
});

// POST menu baru
router.post('/', verifyAdmin, upload.single('gambar'), async (req, res) => {
  try {
    const { nama, harga, kategori, deskripsi } = req.body;

    // Validasi input
    if (!nama || !harga || !kategori) {
      return res.status(400).json({ error: 'Nama, harga, dan kategori wajib diisi' });
    }
    const hargaNum = parseFloat(harga);
    if (isNaN(hargaNum) || hargaNum <= 0) {
      return res.status(400).json({ error: 'Harga harus berupa angka positif' });
    }

    let gambarUrl = '';
    if (req.file) {
      try {
        console.log('File received:', req.file.originalname);

        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { folder: 'restoran/menu', use_filename: true, unique_filename: true },
            (error, result) => {
              if (error) return reject(error);
              resolve(result);
            }
          ).end(req.file.buffer);
        });

        gambarUrl = result.secure_url;
        console.log('Cloudinary upload success:', gambarUrl);
      } catch (uploadErr) {
        console.error('Cloudinary upload error:', uploadErr);
        return res.status(500).json({ error: 'Gagal mengunggah gambar ke Cloudinary' });
      }
    }

    const menuBaru = new Menu({ nama, harga: hargaNum, kategori, deskripsi, gambar: gambarUrl });
    await menuBaru.save();

    res.status(201).json({ message: '✅ Menu ditambahkan', data: menuBaru });
  } catch (err) {
    console.error('Error adding menu:', err);
    res.status(500).json({ error: 'Gagal menambahkan menu' });
  }
});

// PUT edit menu
router.put('/:id', verifyAdmin, upload.single('gambar'), async (req, res) => {
  try {
    const { nama, harga, kategori, deskripsi } = req.body;

    if (!nama || !harga || !kategori) {
      return res.status(400).json({ error: 'Nama, harga, dan kategori wajib diisi' });
    }
    const hargaNum = parseFloat(harga);
    if (isNaN(hargaNum) || hargaNum <= 0) {
      return res.status(400).json({ error: 'Harga harus berupa angka positif' });
    }

    const updateData = { nama, harga: hargaNum, kategori, deskripsi };

    if (req.file) {
      try {
        console.log('File received for update:', req.file.originalname);

        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { folder: 'restoran/menu', use_filename: true, unique_filename: true },
            (error, result) => {
              if (error) return reject(error);
              resolve(result);
            }
          ).end(req.file.buffer);
        });

        updateData.gambar = result.secure_url;
        console.log('Cloudinary update success:', updateData.gambar);
      } catch (uploadErr) {
        console.error('Cloudinary upload error:', uploadErr);
        return res.status(500).json({ error: 'Gagal mengunggah gambar ke Cloudinary' });
      }
    }

    const menu = await Menu.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!menu) {
      return res.status(404).json({ error: 'Menu tidak ditemukan' });
    }
    res.json({ message: '✅ Menu diupdate', data: menu });
  } catch (err) {
    console.error('Error updating menu:', err);
    res.status(500).json({ error: 'Gagal mengubah data menu' });
  }
});

// DELETE menu
router.delete('/:id', verifyAdmin, async (req, res) => {
  try {
    const deleted = await Menu.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Menu tidak ditemukan' });
    }

    if (deleted.gambar) {
      try {
        // Ambil public_id dari URL Cloudinary
        const parts = deleted.gambar.split('/');
        const filename = parts.pop().split('.')[0];
        const publicId = `restoran/menu/${filename}`;
        await deleteImage(publicId);
        console.log('Image deleted from Cloudinary:', publicId);
      } catch (imgErr) {
        console.error('Error deleting image from Cloudinary:', imgErr);
      }
    }

    res.json({ message: '🗑️ Menu dihapus', data: deleted });
  } catch (err) {
    console.error('Error deleting menu:', err);
    res.status(500).json({ error: 'Gagal menghapus menu' });
  }
});

module.exports = router;