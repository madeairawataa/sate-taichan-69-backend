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
import PDFDocument from "pdfkit";



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
// GET: STRUK pesanan
// ============================

// ============================
// GET: STRUK pesanan (PDF)
// ============================
router.get('/:id/struk', async (req, res) => {
  try {
    const pesanan = await Pesanan.findById(req.params.id);

    if (!pesanan) {
      return res.status(404).send('<h2>❌ Pesanan tidak ditemukan</h2>');
    }

    const tanggalPesan = new Date(pesanan.createdAt).toLocaleString('id-ID');
    const tanggalCetak = new Date().toLocaleString('id-ID');

    // Buat dokumen PDF
    const doc = new PDFDocument({ margin: 30, size: "A4" });

    // Setting header agar langsung download
    res.setHeader('Content-disposition', `attachment; filename=struk-${pesanan.nomorPesanan}.pdf`);
    res.setHeader('Content-type', 'application/pdf');

    // Pipe PDF ke response
    doc.pipe(res);

    // ==========================
    // ISI STRUK
    // ==========================
    doc.fontSize(16).fillColor("green").text("✅ PEMBAYARAN BERHASIL", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(14).fillColor("black").text("SATE TAICHAN 69", { align: "center" });
    doc.moveDown();
    doc.fontSize(10).text("Mertasari Culinary Center, Pantai Mertasari, Sanur, Bali", { align: "center" });
    doc.text("Telp: 087759744555", { align: "center" });
    doc.moveDown();

    doc.moveTo(30, doc.y).lineTo(550, doc.y).dash(2, { space: 2 }).stroke();
    doc.moveDown();

    doc.fontSize(10).text(`No. Pesanan: ${pesanan.nomorPesanan}`);
    doc.text(`Tanggal Pesan: ${tanggalPesan}`);
    doc.text(`Tanggal Cetak: ${tanggalCetak}`);
    doc.moveDown();

    doc.text(`Nama Pemesan: ${pesanan.namaPemesan}`);
    doc.text(`Tipe Pesanan: ${pesanan.tipePesanan || '-'}`);
    doc.moveDown();

    // Garis
    doc.moveTo(30, doc.y).lineTo(550, doc.y).dash(2, { space: 2 }).stroke();
    doc.moveDown();

    // Tabel Pesanan
    doc.fontSize(12).text("DETAIL PESANAN", { underline: true });
    doc.moveDown(0.5);

    // Header table
    doc.fontSize(10).text("Item", 50, doc.y, { continued: true });
    doc.text("Qty", 200, doc.y, { continued: true });
    doc.text("Harga", 300, doc.y, { continued: true });
    doc.text("Subtotal", 400, doc.y);
    doc.moveDown();

    pesanan.items.forEach((item) => {
      doc.text(item.nama, 50, doc.y, { continued: true });
      doc.text(item.jumlah.toString(), 200, doc.y, { continued: true });
      doc.text(`Rp ${item.harga.toLocaleString("id-ID")}`, 300, doc.y, { continued: true });
      doc.text(`Rp ${(item.harga * item.jumlah).toLocaleString("id-ID")}`, 400, doc.y);
    });

    doc.moveDown(1);
    doc.fontSize(12).text(`TOTAL: Rp ${pesanan.totalHarga.toLocaleString("id-ID")}`, { align: "right", bold: true });
    doc.moveDown(2);

    doc.fontSize(10).text("Simpan struk ini sebagai bukti pesanan.", { align: "center" });
    doc.text("Untuk informasi lebih lanjut hubungi nomor di atas.", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text("TERIMA KASIH", { align: "center" });
    doc.text("Selamat menikmati makanan Anda!", { align: "center" });

    // Akhiri dokumen
    doc.end();

  } catch (error) {
    console.error('❌ Gagal generate struk PDF:', error);
    res.status(500).send('<h2>Terjadi kesalahan</h2>');
  }
});


module.exports = router;
