const express = require('express');
const router = express.Router();
const Pesanan = require('../models/Pesanan');
const verifyAdmin = require('../Middleware/VerifyAdmin');
const ReservasiMeja = require('../Models/ReservasiMeja');
const Menu = require('../Models/Menu'); // DITAMBAHKAN untuk logika tidak laris

// GET /api/dashboard/ringkasan
router.get('/ringkasan', verifyAdmin, async (req, res) => {
  try {
    const { periode = 'bulan' } = req.query;
    const now = new Date();

    let mulai;
    if (periode === 'hari') {
      mulai = new Date(now.setHours(0, 0, 0, 0));
    } else if (periode === 'minggu') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      mulai = new Date(now.setDate(diff));
      mulai.setHours(0, 0, 0, 0);
    } else if (periode === 'tahun') {
      mulai = new Date(now.getFullYear(), 0, 1);
    } else {
      mulai = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const pesanan = await Pesanan.find({ createdAt: { $gte: mulai } });
    const reservasi = await ReservasiMeja.find({ createdAt: { $gte: mulai } });

    const totalPesanan = pesanan.length;
    const mejaDipesan = reservasi.length;
    const deposit = 25000;
    const totalPendapatan = pesanan.reduce((acc, cur) => acc + (cur.totalHarga || 0), 0) + mejaDipesan * deposit;

    const semuaItem = pesanan.flatMap(p => p.items || []);
    const hitungMenu = {};
    semuaItem.forEach(item => {
      if (!hitungMenu[item.nama]) hitungMenu[item.nama] = 0;
      hitungMenu[item.nama] += item.jumlah || 1;
    });

    const urutan = Object.entries(hitungMenu).sort((a, b) => b[1] - a[1]);
    const menuPalingLaris = urutan[0]?.[0] || '-';

    let menuPalingTidakLaris = '-';

    if (periode === 'minggu' || periode === 'bulan' || periode === 'tahun') {
      const semuaMenu = await Menu.find();
      const namaMenuDipakai = new Set(semuaItem.map(item => item.nama));
      const tidakLaris = semuaMenu
        .map(menu => menu.nama)
        .filter(nama => !namaMenuDipakai.has(nama));

      menuPalingTidakLaris = tidakLaris.length > 0 ? tidakLaris[0] : '-';
    }

    res.json({
      totalPesanan,
      totalPendapatan,
      menuPalingLaris,
      menuPalingTidakLaris,
      mejaDipesan,
    });
  } catch (err) {
    console.error('Gagal ambil ringkasan:', err);
    res.status(500).json({ error: 'Gagal ambil data ringkasan' });
  }
});

// routes/Dashboard.js
router.get('/statistik-menu', verifyAdmin, async (req, res) => {
  try {
    const { periode = 'bulan' } = req.query;
    const now = new Date();
    let mulai;

    if (periode === 'hari') {
      mulai = new Date(now.setHours(0, 0, 0, 0));
    } else if (periode === 'minggu') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      mulai = new Date(now.setDate(diff));
      mulai.setHours(0, 0, 0, 0);
    } else if (periode === 'tahun') {
      mulai = new Date(now.getFullYear(), 0, 1);
    } else {
      mulai = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const pesanan = await Pesanan.find({ createdAt: { $gte: mulai } });
    const semuaItem = pesanan.flatMap(p => p.items || []);

    const statistik = {};

    semuaItem.forEach(item => {
      if (!statistik[item.nama]) statistik[item.nama] = 0;
      statistik[item.nama] += item.jumlah || 1;
    });

    const semuaMenu = await Menu.find();
   const hasil = semuaMenu.map(menu => {
  const namaMenu = menu.nama;
  // Cari key yang cocok di statistik (case insensitive)
  const key = Object.keys(statistik).find(k => k.toLowerCase() === namaMenu.toLowerCase());
  return {
    nama: namaMenu,
    total: key ? statistik[key] : 0
  };
});

    res.json(hasil);
  } catch (err) {
    console.error('Gagal ambil statistik menu:', err);
    res.status(500).json({ error: 'Gagal ambil data statistik menu' });
  }
});


// GET /api/dashboard/transaksi
router.get('/transaksi', verifyAdmin, async (req, res) => {
  try {
    const { periode = 'bulan' } = req.query;
    const now = new Date();

    let mulai;
    if (periode === 'hari') {
      mulai = new Date(now.setHours(0, 0, 0, 0));
    } else if (periode === 'minggu') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      mulai = new Date(now.setDate(diff));
      mulai.setHours(0, 0, 0, 0);
    } else if (periode === 'tahun') {
      mulai = new Date(now.getFullYear(), 0, 1);
    } else {
      mulai = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const pesananData = await Pesanan.find({ createdAt: { $gte: mulai } }).sort({ createdAt: -1 });
    const reservasiData = await ReservasiMeja.find({ createdAt: { $gte: mulai } }).sort({ createdAt: -1 });

    const pesananTransaksi = pesananData.map(p => ({
      nama: p.namaPemesan || 'Guest',
      meja: p.nomorMeja || '-',
      total: p.totalHarga || 0,
      status: p.status || 'Diproses',
      waktu: p.createdAt,
      jenis: 'Pesanan',
    }));

    const reservasiTransaksi = reservasiData.map(r => ({
      nama: r.nama,
      meja: r.meja,
      total: 25000,
      status: 'Reservasi',
      waktu: r.createdAt,
      jenis: 'Reservasi',
    }));

    const semuaTransaksi = [...pesananTransaksi, ...reservasiTransaksi]
      .sort((a, b) => new Date(b.waktu) - new Date(a.waktu))
      .slice(0, 20);

    res.json(semuaTransaksi);
  } catch (error) {
    console.error('Gagal ambil transaksi:', error);
    res.status(500).json({ error: 'Gagal ambil data transaksi' });
  }
});

module.exports = router;
