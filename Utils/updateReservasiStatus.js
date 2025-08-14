const ReservasiMeja = require('../Models/ReservasiMeja');

const updateReservasiStatus = async (io) => {
  try {
    const now = new Date();
    const semuaReservasi = await ReservasiMeja.find();

    for (const reservasi of semuaReservasi) {
      const tanggal = new Date(reservasi.tanggalReservasi);

      const [startTime, endTime] = reservasi.waktu.split(' - ');
      const [startJam, startMenit] = startTime.split(':').map(Number);
      const [endJam, endMenit] = endTime.split(':').map(Number);

      const waktuMulai = new Date(tanggal);
      waktuMulai.setHours(startJam, startMenit, 0, 0);

      const waktuSelesai = new Date(tanggal);
      waktuSelesai.setHours(endJam, endMenit, 0, 0);

      let statusBaru = '';

      if (now < waktuMulai.getTime() - 2 * 60 * 60 * 1000) {
        statusBaru = 'Belum Aktif';
      } else if (now >= waktuMulai.getTime() - 2 * 60 * 60 * 1000 && now < waktuSelesai) {
        statusBaru = 'Aktif';
      } else {
        statusBaru = 'Selesai';
      }

      if (reservasi.status !== statusBaru) {
        reservasi.status = statusBaru;
        await reservasi.save();
        console.log(`📝 Reservasi ${reservasi.nama} [${reservasi.waktu}] diubah ke status: ${statusBaru}`);
      }
    }

    io.emit('updateReservasi');
    console.log('✅ Semua status reservasi diperbarui & socket dikirim ke client');
  } catch (err) {
    console.error('❌ Gagal update status reservasi:', err.message);
  }
};

module.exports = updateReservasiStatus;
