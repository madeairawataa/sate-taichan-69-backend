const express = require('express');
const router = express.Router();
const Notifikasi = require('../Models/Notifikasi');
const verifyAdmin = require('../Middleware/VerifyAdmin');

// GET notifikasi admin
router.get('/admin', verifyAdmin, async (req, res) => {
  try {
    const data = await Notifikasi.find().sort({ createdAt: -1 }).limit(50);
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Gagal ambil notifikasi' });
  }
});

// 🔴 Hapus semua notifikasi
router.delete('/admin', verifyAdmin, async (req, res) => {
  try {
    await Notifikasi.deleteMany({});
    res.json({ message: 'Notifikasi dihapus semua' });
  } catch {
    res.status(500).json({ error: 'Gagal menghapus notifikasi' });
  }
});

router.put('/admin/terbaca', verifyAdmin, async (req, res) => {
  try {
    await Notifikasi.updateMany({ terbaca: false }, { $set: { terbaca: true } });
    res.json({ message: 'Notifikasi ditandai terbaca' });
  } catch {
    res.status(500).json({ error: 'Gagal tandai notifikasi terbaca' });
  }
});


module.exports = router;
