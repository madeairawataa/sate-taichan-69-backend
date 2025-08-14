const express = require('express');
const router = express.Router();
const Meja = require('../Models/Meja');
const verifyAdmin = require('../Middleware/VerifyAdmin');
const { cloudinary, upload, deleteImage } = require('../Utils/cloudinary');

// ✅ GET semua meja
router.get('/', async (req, res) => {
  try {
    const daftar = await Meja.find().sort({ nomor: 1 });
    res.json(daftar);
  } catch (err) {
    console.error('Error fetching meja:', err);
    res.status(500).json({ error: 'Gagal mengambil data meja' });
  }
});

// ✅ POST tambah meja
router.post('/', verifyAdmin, upload.single('gambar'), async (req, res) => {
  try {
    const { nomor, kapasitas } = req.body;
    if (!nomor || !kapasitas) {
      return res.status(400).json({ error: 'Data meja tidak lengkap' });
    }

    let gambarUrl = '';
    let publicId = '';

    // Upload ke Cloudinary jika ada gambar
    if (req.file) {
      try {
        const uploadResult = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { folder: 'restoran/meja', use_filename: true, unique_filename: true },
            (error, result) => {
              if (error) return reject(error);
              resolve(result);
            }
          ).end(req.file.buffer);
        });

        gambarUrl = uploadResult.secure_url;
        publicId = uploadResult.public_id;
        console.log('Cloudinary upload success:', gambarUrl);
      } catch (uploadErr) {
        console.error('Cloudinary upload error:', uploadErr);
        return res.status(500).json({ error: 'Gagal mengunggah gambar ke Cloudinary' });
      }
    }

    const mejaBaru = new Meja({
      nomor,
      kapasitas,
      gambar: gambarUrl,
      publicId,
    });

    await mejaBaru.save();
    res.status(201).json(mejaBaru);
  } catch (err) {
    console.error('Error adding meja:', err);
    res.status(500).json({ error: 'Gagal menambahkan meja' });
  }
});

// ✅ PUT update meja
router.put('/:id', verifyAdmin, upload.single('gambar'), async (req, res) => {
  try {
    const { nomor, kapasitas } = req.body;
    const meja = await Meja.findById(req.params.id);

    if (!meja) return res.status(404).json({ error: 'Meja tidak ditemukan' });
    if (!nomor || !kapasitas) {
      return res.status(400).json({ error: 'Data meja tidak lengkap' });
    }

    let gambarUrl = meja.gambar;
    let publicId = meja.publicId;

    // Jika ada gambar baru
    if (req.file) {
      // Hapus gambar lama
      if (publicId) await deleteImage(publicId);

      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          { folder: 'restoran/meja', use_filename: true, unique_filename: true },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          }
        ).end(req.file.buffer);
      });

      gambarUrl = uploadResult.secure_url;
      publicId = uploadResult.public_id;
      console.log('Cloudinary update success:', gambarUrl);
    }

    meja.nomor = nomor;
    meja.kapasitas = kapasitas;
    meja.gambar = gambarUrl;
    meja.publicId = publicId;

    await meja.save();
    res.json(meja);
  } catch (err) {
    console.error('Error updating meja:', err);
    res.status(500).json({ error: 'Gagal mengubah data meja' });
  }
});

// ✅ DELETE meja
router.delete('/:id', verifyAdmin, async (req, res) => {
  try {
    const deleted = await Meja.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Meja tidak ditemukan' });

    // Hapus gambar di Cloudinary jika ada
    if (deleted.publicId) {
      await deleteImage(deleted.publicId);
      console.log('Image deleted from Cloudinary:', deleted.publicId);
    }

    res.json({ message: 'Meja berhasil dihapus' });
  } catch (err) {
    console.error('Error deleting meja:', err);
    res.status(500).json({ error: 'Gagal menghapus meja' });
  }
});

module.exports = router;
