const express = require('express');
const router = express.Router();
const ReservasiMeja = require('../Models/ReservasiMeja');
const Meja = require('../Models/Meja');
const Notifikasi = require('../Models/Notifikasi');
const { createInvoice } = require('../Utils/xendit');

// Util untuk mapping waktu ke jam mulai
const getStartHour = (slot) => slot.split(' - ')[0];

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
      successRedirectURL: `http://localhost:3000/status-reservasi/${externalID}`,
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

router.get('/by-email/:email', async (req, res) => {
  try {
    const reservasi = await ReservasiMeja.findOne({
      email: req.params.email,
    }).sort({ createdAt: -1 });

    if (!reservasi) return res.status(404).json({ error: 'Reservasi tidak ditemukan' });

    const [jamMulai, menitMulai] = reservasi.waktu.split(' - ')[0].split(':').map(Number);
    const waktuMulai = new Date(reservasi.tanggalReservasi);
    waktuMulai.setHours(jamMulai, menitMulai, 0, 0);

    const waktuSelesai = new Date(waktuMulai.getTime() + 2 * 60 * 60 * 1000);
    const now = new Date();

    if (now >= waktuSelesai && reservasi.status !== 'Selesai') {
      reservasi.status = 'Selesai';
      await reservasi.save();
      req.app.get('io').emit('updateReservasi');
    }

    res.json(reservasi);
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil reservasi' });
  }
});

router.get('/cek-slot', async (req, res) => {
  const { tanggal, meja } = req.query;
  if (!tanggal || !meja) return res.status(400).json({ error: 'Tanggal dan meja wajib diisi' });

  try {
    const [year, month, day] = tanggal.split('-');
    const targetDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    const nextDay = new Date(targetDate);
    nextDay.setHours(23, 59, 59, 999);

    const reservasi = await ReservasiMeja.find({
      meja,
      tanggalReservasi: {
        $gte: targetDate,
        $lte: nextDay
      },
      status: { $in: ['Belum Aktif', 'Aktif'] }
    });

    const now = new Date();
    const waktuBooked = reservasi
      .filter((r) => now < new Date(r.tanggalReservasi).setHours(...r.waktu.split(' - ')[1].split(':').map(Number)))
      .map((r) => r.waktu);

    res.json(waktuBooked);
  } catch (err) {
    console.error('Gagal cek slot waktu:', err);
    res.status(500).json({ error: 'Gagal cek slot waktu' });
  }
});

router.get('/', async (req, res) => {
  try {
    const semuaReservasi = await ReservasiMeja.find().sort({ createdAt: -1 });
    const now = new Date();

    const updatedReservasi = await Promise.all(
      semuaReservasi.map(async (r) => {
        const [jam, menit] = r.waktu.split(' - ')[0].split(':').map(Number);
        const waktuMulai = new Date(r.tanggalReservasi);
        waktuMulai.setHours(jam, menit, 0, 0);
        const waktuSelesai = new Date(waktuMulai.getTime() + 2 * 60 * 60 * 1000);

        let statusBaru = r.status;
        if (now < waktuMulai) {
          statusBaru = 'Belum Aktif';
        } else if (now >= waktuMulai && now < waktuSelesai) {
          statusBaru = 'Aktif';
        } else if (now >= waktuSelesai) {
          statusBaru = 'Selesai';
        }

        if (r.status !== statusBaru) {
          r.status = statusBaru;
          await r.save();
        }

        return r;
      })
    );

    res.json(updatedReservasi);
  } catch (err) {
    console.error('❌ Gagal mengambil data reservasi meja:', err);
    res.status(500).json({ error: 'Gagal mengambil data reservasi meja' });
  }
});

router.get('/by-id/:id', async (req, res) => {
  try {
    const reservasi = await ReservasiMeja.findById(req.params.id);
    if (!reservasi) return res.status(404).json({ error: 'Reservasi tidak ditemukan' });
    res.json(reservasi);
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil reservasi berdasarkan ID' });
  }
});

module.exports = router;
