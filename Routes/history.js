const express = require('express');
const router = express.Router();
const Pesanan = require('../models/Pesanan');
const Feedback = require('../Models/Feedback');
const verifyToken = require('../Middleware/VerifyToken');

// GET riwayat pesanan user (dari token)
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'User ID tidak valid' });
    }

    const history = await Pesanan.find({ userId }).sort({ createdAt: -1 });

    if (!history.length) {
      return res.status(200).json({ message: 'Belum ada riwayat pesanan.', data: [] });
    }

    const historyWithFeedback = await Promise.all(
      history.map(async (order) => {
        const feedback = await Feedback.findOne({ pesananId: order._id.toString() });
        return {
          ...order.toObject(),
          feedback: feedback
            ? {
                rating: feedback.rating,
                komentar: feedback.komentar,
              }
            : {
                rating: 0,
                komentar: '',
              },
        };
      })
    );

    res.status(200).json({ data: historyWithFeedback });
  } catch (err) {
    console.error('Error saat mengambil riwayat:', err);
    res.status(500).json({ error: 'Gagal mengambil riwayat.', detail: err.message });
  }
});

module.exports = router;
