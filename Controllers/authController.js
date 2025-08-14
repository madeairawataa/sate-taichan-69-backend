const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../Models/User');
require('dotenv').config();

// LOGIN
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Cari user berdasarkan email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Email tidak ditemukan' });
    }

    // Cek password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Password salah' });
    }

    // Buat token JWT dengan role sesuai database
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET || 'RAHASIA_JWT',
      { expiresIn: '1d' }
    );

    res.json({
      message: 'Login berhasil',
      token,
      role: user.role,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Login gagal' });
  }
};

// REGISTER
exports.register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Cek jika email sudah ada
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email sudah digunakan' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Buat user baru
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role: role || 'user', // default user
    });

    await newUser.save();
    res.status(201).json({ message: 'Registrasi berhasil', user: newUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Registrasi gagal' });
  }
};
