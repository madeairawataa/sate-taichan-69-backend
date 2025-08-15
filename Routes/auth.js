const express = require('express');
const router = express.Router();
const User = require('../Models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const otpGenerator = require('otp-generator');
const { kirimKodeOTP } = require('../Utils/email');

require('dotenv').config();
const SECRET_KEY = process.env.JWT_SECRET || 'your_jwt_secret';

// Penyimpanan OTP sementara (pakai Redis untuk produksi)
let otpSession = {};

/* ---------------------------------------------------
  ✅ STEP 1 - Minta OTP lewat Email (REGISTER)
--------------------------------------------------- */
router.post('/register-request', async (req, res) => {
  const { username, email, password, role } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Semua field wajib diisi' });
  }

  try {
    const existing = await User.findOne({ $or: [{ username }, { email }] });
    if (existing) return res.status(400).json({ message: 'Username atau email sudah digunakan' });

    const otp = otpGenerator.generate(6, {
      upperCaseAlphabets: false,
      specialChars: false,
    });

    otpSession[email] = {
      otp,
      userData: { username, email, password, role },
      createdAt: Date.now(),
      type: 'register'
    };

    await kirimKodeOTP(email, otp);
    console.log('OTP dikirim:', { email, otp });
    res.status(200).json({ message: 'Kode OTP berhasil dikirim ke email' });
  } catch (error) {
    console.error('Gagal kirim OTP:', error);
    res.status(500).json({ message: 'Gagal mengirim OTP', error: error.message });
  }
});

/* ---------------------------------------------------
  ✅ STEP 2 - Verifikasi OTP & Simpan Akun
--------------------------------------------------- */
router.post('/register-verify', async (req, res) => {
  const { email, otp } = req.body;
  const session = otpSession[email];

  if (!session || session.type !== 'register') {
    return res.status(400).json({ message: 'OTP tidak ditemukan. Silakan daftar ulang.' });
  }

  if (Date.now() - session.createdAt > 5 * 60 * 1000) {
    delete otpSession[email];
    return res.status(400).json({ message: 'Kode OTP sudah kedaluwarsa' });
  }

  if (session.otp !== otp) {
    return res.status(400).json({ message: 'Kode OTP salah' });
  }

  try {
    const hashedPassword = await bcrypt.hash(session.userData.password, 10);
    const user = new User({
      username: session.userData.username,
      email: session.userData.email,
      password: hashedPassword,
      role: session.userData.role || 'user',
    });

    const savedUser = await user.save();
    delete otpSession[email];

    const token = jwt.sign({ id: savedUser._id, role: savedUser.role }, SECRET_KEY, { expiresIn: '1h' });

    console.log('Akun dibuat:', { userId: savedUser._id, email, role: savedUser.role });
    res.status(201).json({
      message: 'Akun berhasil dibuat',
      token,
      userId: savedUser._id.toString(),
      role: savedUser.role,
      username: savedUser.username,
      email: savedUser.email,
    });
  } catch (err) {
    console.error('Error saat menyimpan user:', err);
    res.status(500).json({ message: 'Gagal menyimpan akun', error: err.message });
  }
});

/* ---------------------------------------------------
  ✅ LOGIN USER dengan Email
--------------------------------------------------- */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email dan password wajib diisi' });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'Email tidak ditemukan' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Password salah' });

    const token = jwt.sign({ id: user._id, role: user.role }, SECRET_KEY, { expiresIn: '1h' });

    console.log('User login:', { userId: user._id, email, role: user.role });
    res.json({
      token,
      userId: user._id.toString(),
      role: user.role,
      email: user.email,
      username: user.username,
    });
  } catch (err) {
    console.error('Login gagal:', err);
    res.status(500).json({ message: 'Login gagal karena server error', error: err.message });
  }
});

/* ---------------------------------------------------
  ✅ LOGOUT
--------------------------------------------------- */
router.post('/logout', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const userId = req.userId || 'unknown';
  console.log('User logout:', { userId, token });
  res.status(200).json({ 
    message: 'Logout berhasil. Hapus token dan data login di klien.',
    action: 'clearClientData'
  });
});

/* ---------------------------------------------------
  ✅ GET /login untuk tes dari browser
--------------------------------------------------- */
router.get('/login', (req, res) => {
  res.send('Gunakan metode POST untuk login');
});

/* ---------------------------------------------------
  ✅ LUPA PASSWORD - Request OTP
--------------------------------------------------- */
router.post('/forgot-password-request', async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ message: 'Email wajib diisi' });

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'Email tidak ditemukan' });

    const otp = otpGenerator.generate(6, {
      upperCaseAlphabets: false,
      specialChars: false,
    });

    otpSession[email] = {
      otp,
      createdAt: Date.now(),
      type: 'reset-password'
    };

    await kirimKodeOTP(email, otp);
    console.log('OTP reset password dikirim:', { email, otp });

    res.status(200).json({ message: 'Kode OTP telah dikirim ke email' });
  } catch (err) {
    console.error('Gagal kirim OTP reset password:', err);
    res.status(500).json({ message: 'Gagal mengirim OTP', error: err.message });
  }
});

/* ---------------------------------------------------
  ✅ LUPA PASSWORD - Verifikasi OTP
--------------------------------------------------- */
router.post('/forgot-password-verify', (req, res) => {
  const { email, otp } = req.body;
  const session = otpSession[email];

  if (!session || session.type !== 'reset-password') {
    return res.status(400).json({ message: 'Tidak ada permintaan reset password untuk email ini' });
  }

  if (Date.now() - session.createdAt > 5 * 60 * 1000) {
    delete otpSession[email];
    return res.status(400).json({ message: 'Kode OTP sudah kedaluwarsa' });
  }

  if (session.otp !== otp) {
    return res.status(400).json({ message: 'Kode OTP salah' });
  }

  res.status(200).json({ message: 'OTP valid, silakan masukkan password baru' });
});

/* ---------------------------------------------------
  ✅ LUPA PASSWORD - Simpan Password Baru
--------------------------------------------------- */
router.post('/reset-password', async (req, res) => {
  const { email, newPassword, confirmPassword } = req.body;

  if (!email || !newPassword || !confirmPassword) {
    return res.status(400).json({ message: 'Semua field wajib diisi' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ message: 'Password dan konfirmasi tidak cocok' });
  }

  const session = otpSession[email];
  if (!session || session.type !== 'reset-password') {
    return res.status(400).json({ message: 'Tidak ada sesi valid untuk reset password' });
  }

  try {
    const hashed = await bcrypt.hash(newPassword, 10);
    const updated = await User.findOneAndUpdate(
      { email },
      { password: hashed },
      { new: true }
    );

    delete otpSession[email];

    if (!updated) return res.status(404).json({ message: 'User tidak ditemukan' });

    console.log('Password berhasil di-reset untuk:', email);
    res.status(200).json({ message: 'Password berhasil diubah. Silakan login kembali.' });
  } catch (err) {
    console.error('Gagal reset password:', err);
    res.status(500).json({ message: 'Gagal reset password', error: err.message });
  }
});

module.exports = router;
