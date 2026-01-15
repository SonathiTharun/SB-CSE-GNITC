require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

console.log('Testing email with:');
console.log('User:', process.env.EMAIL_USER);
console.log('Pass:', process.env.EMAIL_PASS ? '***set***' : 'NOT SET');

transporter.sendMail({
  from: `"GNITC Test" <${process.env.EMAIL_USER}>`,
  to: process.env.EMAIL_USER,  // Send to self for testing
  subject: 'Test Email from GNITC Portal',
  html: '<h1>Email Test Successful!</h1><p>If you received this, emails are working.</p>'
}, (err, info) => {
  if (err) {
    console.log('❌ Email FAILED:', err.message);
    console.log('Full error:', err);
  } else {
    console.log('✅ Email SENT:', info.response);
  }
  process.exit();
});
