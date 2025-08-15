const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const Invoice = require('../Utils/xendit');
const Pesanan = require('../Models/Pesanan');
const Notifikasi = require('../Models/Notifikasi');
const Menu = require('../Models/Menu');

// Middleware untuk memverifikasi token (dari kode awal)
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
      next();
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
      successRedirectURL: `http://70.153.136.221:5000/status?orderId=${simpan._id}`,
      callbackURL: 'http://70.153.136.221:5000/api/pembayaran/callback',
    });

    res.json({ invoiceUrl: response.invoice_url, pesananId: simpan._id });
  } catch (error) {
    console.error('❌ Gagal buat invoice:', error);
    res.status(500).json({ error: 'Gagal membuat invoice', detail: error.message });
  }
});

// ✅ POST: Buat reservasi baru (anti duplikat + generate nomor unik)
router.post('/buat-reservasi', async (req, res) => {
  const { uuid, nama, email, meja, waktu, jumlahOrang, catatan, tanggal } = req.body;

  if (!uuid || !nama || !email || !meja || !tanggal || !waktu || !jumlahOrang) {
    return res.status(400).json({ error: 'Data reservasi tidak lengkap' });
  }

  try {
    // 🔍 Cek UUID sudah ada atau belum
    const existingUUID = await ReservasiMeja.findOne({ uuid });
    if (existingUUID) {
      return res.status(409).json({ error: 'Reservasi ini sudah pernah dibuat' });
    }

    // 🔍 Cek apakah meja sudah dipesan di waktu dan tanggal itu
    const existing = await ReservasiMeja.findOne({
      meja,
      tanggalReservasi: tanggal,
      waktu,
    });
    if (existing) {
      return res.status(409).json({ error: 'Meja sudah dipesan pada waktu tersebut' });
    }

    // 📷 Ambil gambar meja
    const mejaData = await Meja.findOne({ nomor: parseInt(meja) });

    // 🔢 Hitung nomor urut di tanggal tersebut
    const countReservasiToday = await ReservasiMeja.countDocuments({
      tanggalReservasi: tanggal
    });
    const urutan = String(countReservasiToday + 1).padStart(3, '0');
    const tanggalFormattedForID = new Date(tanggal).toISOString().slice(0, 10).replace(/-/g, '');
    const noReservasi = `RES-${tanggalFormattedForID}-${urutan}`;

    const newReservasi = new ReservasiMeja({
      uuid,
      noReservasi, // nomor unik
      nama,
      email,
      meja,
      waktu,
      jumlahOrang,
      catatan,
      tanggalReservasi: tanggal,
      gambarMeja: mejaData?.gambar || '',
    });

    await newReservasi.save();

    // 🔔 Tambahkan notifikasi ke admin
    const tanggalFormatted = new Date(tanggal).toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    await Notifikasi.create({
      jenis: 'Reservasi',
      pesan: `Reservasi Meja ${meja} oleh ${nama} untuk ${jumlahOrang} orang pada ${tanggalFormatted} jam ${waktu}`,
      refId: newReservasi._id
    });

    // 🔌 Emit notifikasi ke admin via socket
    req.app.get('io').emit('notifikasi', {
      type: 'reservasi',
      waktu: new Date(),
      detail: { nama, meja, jumlahOrang, waktu, tanggal: tanggalFormatted },
    });

    req.app.get('io').emit('updateReservasi');
    res.status(201).json(newReservasi);
  } catch (err) {
    console.error('❌ Gagal membuat reservasi:', err);
    if (err.code === 11000 && err.keyPattern?.uuid) {
      return res.status(409).json({ error: 'Reservasi ini sudah ada' });
    }
    res.status(500).json({ error: 'Gagal membuat reservasi' });
  }
});

router.post('/invoice', async (req, res) => {
  try {
    const { externalID, payerEmail, description, amount, successRedirectURL } = req.body;
    const invoice = await createInvoice({
      externalID,
      payerEmail,
      description,
      amount,
      successRedirectURL,
    });
    res.json(invoice);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal membuat invoice' });
  }
});

router.post('/buat-invoice', async (req, res) => {
  try {
    const {
      externalID,
      payerEmail,
      description,
      amount,
      nama,
      meja,
      tanggal,
      waktu,
      jumlahOrang,
      catatan,
      email,
      userId
    } = req.body;

    const invoice = await createInvoice({
      externalID,
      payerEmail,
      description,
      amount,
      successRedirectURL: `http://70.153.136.221:5000/status-reservasi/${externalID}`,
      metadata: {
        nama,
        meja,
        tanggal,
        waktu,
        jumlahOrang,
        catatan,
        email,
        userId: userId || null
      }
    });

    res.json(invoice);
  } catch (err) {
    console.error('❌ Gagal buat invoice:', err);
    res.status(500).json({ error: 'Gagal membuat invoice' });
  }
});

// Callback dari Xendit
router.post('/callback', async (req, res) => {
  const data = req.body;
  console.log('📥 Callback dari Xendit:', {
    externalId: data.external_id,
    status: data.status,
    timestamp: new Date().toISOString(),
  });

  try {
    if (data.status === 'PAID') {
      const pesanan = await Pesanan.findOneAndUpdate(
        { externalId: data.external_id },
        { $set: { status: 'Menunggu' } },
        { new: true }
      );

      if (!pesanan) {
        console.error('Pesanan tidak ditemukan untuk externalId:', data.external_id);
        return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
      }

      console.log(`✅ Pembayaran ${data.external_id} berhasil, pesanan diperbarui:`, pesanan);
      if (global.io) {
        global.io.emit('updatePesanan', { id: pesanan._id, status: pesanan.status });
      }
    }
  } catch (error) {
    console.error('❌ Gagal memproses callback:', error);
  }

  res.status(200).send('Callback diterima');
});

module.exports = router;