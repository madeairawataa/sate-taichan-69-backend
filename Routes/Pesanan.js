const express = require('express');
const router = express.Router();
const Pesanan = require('../Models/Pesanan');
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
      successRedirectURL: `http://70.153.136.221:5000/api/pesanan/${simpan._id}/struk`,
      callbackURL: 'http://70.153.136.221:5000/api/pembayaran/callback',
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

// ============================
// GET: Struk sederhana setelah pembayaran berhasil
// ============================
router.get('/:id/struk', async (req, res) => {
  try {
    const pesanan = await Pesanan.findById(req.params.id);
    if (!pesanan) {
      return res.status(404).send('<h2>Pesanan tidak ditemukan</h2>');
    }

    let itemsHTML = '';
    pesanan.items.forEach(item => {
      itemsHTML += `
        <tr>
          <td>${item.nama}</td>
          <td>${item.jumlah}</td>
          <td>Rp ${item.harga?.toLocaleString('id-ID')}</td>
        </tr>
      `;
    });

    const html = `
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <title>Struk Pesanan ${pesanan.nomorPesanan}</title>
        <style>
          body { font-family: Arial, sans-serif; background:#f8f8f8; padding:20px; }
          .struk { max-width:600px; margin:0 auto; background:#fff; padding:20px; border-radius:10px; box-shadow:0 2px 6px rgba(0,0,0,0.1); }
          h2, h3 { text-align:center; }
          table { width:100%; border-collapse: collapse; margin-top:15px; }
          th, td { border:1px solid #ddd; padding:8px; text-align:left; }
          th { background:#f2f2f2; }
          .total { text-align:right; font-weight:bold; margin-top:15px; }
          .print-btn { display:block; margin:20px auto; padding:10px 20px; background:#ff6b35; color:white; text-decoration:none; border-radius:6px; text-align:center; }
          .print-btn:hover { background:#e55a28; }
        </style>
      </head>
      <body>
        <div class="struk">
          <h2>✅ Pembayaran Berhasil</h2>
          <h3>Struk Pesanan</h3>
          <p><strong>No. Pesanan:</strong> ${pesanan.nomorPesanan}</p>
          <p><strong>Nama Pemesan:</strong> ${pesanan.namaPemesan}</p>
          <p><strong>Meja:</strong> ${pesanan.nomorMeja}</p>
          <p><strong>Tipe:</strong> ${pesanan.tipePesanan}</p>
          <hr/>
          <table>
            <thead>
              <tr>
                <th>Menu</th>
                <th>Jumlah</th>
                <th>Harga</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHTML}
            </tbody>
          </table>
          <p class="total">Total: Rp ${pesanan.totalHarga.toLocaleString('id-ID')}</p>
          <p><strong>Status:</strong> ${pesanan.status}</p>
          <a href="javascript:window.print()" class="print-btn">Cetak / Simpan PDF</a>
        </div>
      </body>
      </html>
    `;

    res.send(html);
  } catch (err) {
    console.error('Gagal buat struk:', err);
    res.status(500).send('<h2>Terjadi kesalahan server</h2>');
  }
});


module.exports = router;
