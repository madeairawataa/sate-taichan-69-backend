const express = require('express');
const router = express.Router();
const Pesanan = require('../models/Pesanan');
const Feedback = require('../Models/Feedback');
const verifyAdmin = require('../Middleware/VerifyAdmin');
const Menu = require('../Models/Menu');
const Notifikasi = require('../Models/Notifikasi');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// Middleware untuk memverifikasi token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
      req.userId = decoded.id;
      console.log('Token verified:', { userId: decoded.id, role: decoded.role });
      next();
    } catch (err) {
      console.error('Invalid token:', err.message);
      return next();
    }
  } else {
    console.log('No token provided');
    next();
  }
};

// Buat Kode Unik Pemesanan
const getNextOrderNumber = async () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const dateString = `${year}${month}${day}`;

  const startOfDay = new Date(year, today.getMonth(), today.getDate(), 0, 0, 0);
  const endOfDay = new Date(year, today.getMonth(), today.getDate(), 23, 59, 59);

  const lastOrder = await Pesanan.findOne({
    createdAt: { $gte: startOfDay, $lte: endOfDay }
  }).sort({ createdAt: -1 });

  let orderNumber = 1;
  if (lastOrder && lastOrder.nomorPesanan) {
    const lastNumber = parseInt(lastOrder.nomorPesanan.split('-')[2], 10);
    orderNumber = lastNumber + 1;
  }

  return `ORD-${dateString}-${String(orderNumber).padStart(4, '0')}`;
};


// Buat invoice pembayaran
router.post('/buat-invoice', verifyToken, async (req, res) => {
  try {
    const { nama, email, total, tipe, detail, userId, uuid, nomorMeja, catatan } = req.body;

    if (!nama || !total || !detail || detail.length === 0) {
      return res.status(400).json({ error: 'Nama, total, dan detail pesanan wajib diisi.' });
    }

    const finalUserId = req.userId || userId || null;
    const externalId = uuidv4();
    const nomorPesanan = await getNextOrderNumber();

    const itemsWithGambar = await Promise.all(
      detail.map(async (item) => {
        try {
          const menuData = await Menu.findById(item.id);
          return {
            ...item,
            gambar: menuData?.gambar || '',
            nama: menuData?.nama || item.nama || 'Menu tidak ditemukan',
            harga: menuData?.harga || item.harga || 0,
          };
        } catch {
          return { ...item, gambar: '', nama: 'Menu tidak ditemukan', harga: 0 };
        }
      })
    );

    const pesananBaru = new Pesanan({
      nomorPesanan,
      userId: finalUserId,
      uuid: finalUserId ? null : uuid || uuidv4(),
      namaPemesan: nama || 'Pengguna',
      nomorMeja: nomorMeja || '-',
      catatan: catatan || '',
      tipePesanan: req.body.tipePesanan || 'Dine In',
      items: itemsWithGambar,
      totalHarga: total,
      status: 'Menunggu',
      externalId,
    });

    const simpan = await pesananBaru.save();

    await Notifikasi.create({
      jenis: 'Pesanan',
      pesan: `Pesanan baru dari ${simpan.namaPemesan}, Meja ${simpan.nomorMeja}, Total Rp ${simpan.totalHarga?.toLocaleString('id-ID')}`,
      waktu: new Date(),
      refId: simpan._id,
    });

    if (global.io) {
      global.io.emit('notifikasi', {
        type: 'pesanan',
        waktu: new Date(),
        detail: {
          nama: simpan.namaPemesan,
          meja: simpan.nomorMeja,
          total: simpan.totalHarga,
        },
      });
      global.io.emit('updatePesanan');
    }

    // Panggil API Xendit untuk buat invoice
    const response = await Invoice.createInvoice({
      externalID: externalId,
      payerEmail: email,
      description: `Pembayaran untuk ${tipe === 'menu' ? 'menu makanan' : 'reservasi meja'} oleh ${nama}`,
      amount: total,
      successRedirectURL: `http://localhost:3000/status?orderId=${simpan._id}`,
      callbackURL: 'http://localhost:5000/api/pembayaran/callback',
    });

    res.json({ invoiceUrl: response.invoice_url, pesananId: simpan._id });
  } catch (error) {
    console.error('❌ Gagal buat invoice:', error);
    res.status(500).json({ error: 'Gagal membuat invoice', detail: error.message });
  }
});

// ============================
// GET: Ambil semua pesanan untuk admin
// ============================
router.get('/admin', verifyAdmin, async (req, res) => {
  try {
    const semuaPesanan = await Pesanan.find()
      .sort({ createdAt: -1 })
      .populate('userId', 'nama email');

    res.json({ data: semuaPesanan });
  } catch (err) {
    console.error('Gagal ambil semua pesanan admin:', err);
    res.status(500).json({ error: 'Gagal mengambil data pesanan', detail: err.message });
  }
});

// ============================
// GET: Ambil pesanan user berdasarkan token atau uuid
// ============================
router.get('/', verifyToken, async (req, res) => {
  const { uuid } = req.query;
  const userId = req.userId; // Ambil dari token

  if (!uuid && !userId) {
    return res.status(400).json({ error: 'UUID (guest) atau userId (login) dibutuhkan.' });
  }

  try {
    let filter = {};

    if (userId) {
      filter.userId = userId;
    }

    if (uuid && !userId) {
      // Hanya kalau tidak login, ambil berdasarkan UUID guest
      filter.uuid = uuid;
      filter.userId = null;
    }

    console.log('Mencari pesanan dengan filter:', filter);
    const daftar = await Pesanan.find(filter).sort({ createdAt: -1 });
    console.log('Pesanan ditemukan:', daftar.length);
    res.json({ data: daftar });
  } catch (err) {
    console.error('Error saat ambil pesanan user:', err);
    res.status(500).json({ error: 'Gagal mengambil data pesanan', detail: err.message });
  }
});

// ============================
// PUT: Update status pesanan
// ============================
router.put('/:id/status', async (req, res) => {
  const { status } = req.body;
  const validStatus = ['Menunggu', 'Diproses', 'Siap Diantar', 'Selesai', 'Dibatalkan'];

  if (!validStatus.includes(status)) {
    return res.status(400).json({ error: 'Status pesanan tidak valid.' });
  }

  try {
    const update = await Pesanan.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!update) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });

    if (global.io) {
      global.io.emit('updatePesanan', { id: update._id, status: update.status });
    }

    res.json(update);
  } catch (err) {
    console.error('Error saat update status:', err);
    res.status(500).json({ error: 'Gagal mengubah status pesanan', detail: err.message });
  }
});

// ============================
// GET: Ambil pesanan berdasarkan ID
// ============================
router.get('/:id', async (req, res) => {
  try {
    const pesanan = await Pesanan.findById(req.params.id);
    if (!pesanan) {
      return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
    }

    // Ambil feedback terkait
    const feedback = await Feedback.findOne({ pesananId: pesanan._id.toString() });

    const responseData = {
      ...pesanan.toObject(),
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

    res.json(responseData);
  } catch (err) {
    console.error('Gagal ambil pesanan by ID:', err);
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
});

// ============================
// DELETE: Hapus pesanan
// ============================
router.delete('/:id', verifyAdmin, async (req, res) => {
  try {
    const deleted = await Pesanan.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });

    await Notifikasi.deleteMany({ refId: deleted._id });

    res.json({ message: 'Pesanan dan notifikasi berhasil dihapus.', data: deleted });
  } catch (err) {
    console.error('Error saat menghapus pesanan:', err);
    res.status(500).json({ error: 'Gagal menghapus pesanan', detail: err.message });
  }
});

module.exports = router;