require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const kirimKodeOTP = async (emailTujuan, otp) => {
  const mailOptions = {
    from: `"Reservasi Taichan" <${process.env.EMAIL_USER}>`,
    to: emailTujuan,
    subject: 'Kode Verifikasi Registrasi',
    text: `Kode verifikasi kamu adalah: ${otp}`,
  };

  await transporter.sendMail(mailOptions);
};

module.exports = { kirimKodeOTP };
