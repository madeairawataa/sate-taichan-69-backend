const express = require('express');
const router = express.Router();
const FeedbackModel = require('../Models/Feedback'); // pastikan path benar

// POST - Simpan feedback (sudah ada)
router.post('/', async (req, res) => {
  try {
    const { pesananId, rating, komentar, namaPemesan } = req.body;

    const feedback = new FeedbackModel({
      pesananId,
      namaPemesan,
      rating,
      komentar,
    });

    await feedback.save();

    res.json({ message: 'Feedback disimpan!' });
  } catch (err) {
    console.error('Error simpan feedback:', err);
    res.status(500).json({ error: 'Gagal menyimpan feedback.' });
  }
});


// GET - Ambil semua feedback
router.get('/', async (req, res) => {
  try {
    const feedbackList = await FeedbackModel.find().sort({ createdAt: -1 });
    res.json(feedbackList);
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil feedback' });
  }
});

module.exports = router;
