require('dotenv').config();
const nodemailer = require('nodemailer');

console.log("User:", JSON.stringify(process.env.EMAIL_USER));
console.log("Pass:", JSON.stringify(process.env.EMAIL_PASS)); // TEMPORARY DEBUG
console.log("Pass Length:", process.env.EMAIL_PASS ? process.env.EMAIL_PASS.length : 0);

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

async function main() {
    try {
        console.log("Verifying connection...");
        await transporter.verify();
        console.log("✅ Connection Verified!");

        console.log("Sending test email...");
        const info = await transporter.sendMail({
            from: `"Test Script" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_USER, // Send to self
            subject: "Test Email from Script",
            text: "If you see this, email sending works!"
        });
        console.log("✅ Email Sent!", info.messageId);
    } catch (e) {
        console.error("❌ Error:", e);
    }
}

main();
