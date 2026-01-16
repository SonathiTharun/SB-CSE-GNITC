require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const cloudinary = require('cloudinary').v2;

// Auto-detect production environment (Render sets RENDER=true)
if (process.env.RENDER) {
  process.env.NODE_ENV = 'production';
}

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Helper: Upload buffer to Cloudinary
async function uploadToCloudinary(buffer, folder, publicId) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { 
        folder: folder,
        public_id: publicId,
        overwrite: true,
        resource_type: 'image'
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    uploadStream.end(buffer);
  });
}

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration for production
const allowedOrigins = [
  'http://localhost:4200',
  'https://gnitc-sb-placements.vercel.app',
  /vercel\.app$/  // Allow all Vercel deployments (including previews)
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.some(allowed => 
    allowed instanceof RegExp ? allowed.test(origin) : allowed === origin
  )) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Health check endpoint for UptimeRobot (keeps Render free tier awake)
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// File upload config (max 2MB) - Use memory storage for Cloudinary
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, JPEG, PNG allowed'));
    }
  }
});

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Trust proxy for Render (required for secure cookies behind reverse proxy)
app.set('trust proxy', 1);

app.use(session({
  secret: process.env.SESSION_SECRET || 'placement-portal-secret-key-2025',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));

// Email Config - Using Gmail API with OAuth2 (Works on Render)
const { google } = require('googleapis');
const OAuth2 = google.auth.OAuth2;

const oauth2Client = new OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground" // Redirect URL
);

oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

// Helper: Create Raw Email
function makeBody(to, from, subject, message) {
    const str = [
        "To: " + to,
        "From: " + from, 
        "Subject: " + subject,
        "MIME-Version: 1.0",
        "Content-Type: text/html; charset=utf-8",
        "",
        message
    ].join("\r\n");

    return Buffer.from(str)
        .toString("base64")
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

// Helper: Send Email using Gmail API
async function sendEmail(to, subject, html) {
    try {
        console.log(`📨 [Gmail API] Sending email to ${to}...`);
        
        // Refresh token handling is automatic with googleapis
        const raw = makeBody(to, process.env.GMAIL_SENDER || process.env.EMAIL_USER, subject, html);
        
        const response = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: raw
            }
        });

        console.log(`✅ [Gmail API] Email sent to ${to}: ${subject} (ID: ${response.data.id})`);
        return true;
    } catch (e) {
        console.error(`❌ [Gmail API] Failed to send to ${to}: ${e.message}`);
        // Log full error if available
        if (e.response) {
            console.error('   API Error:', JSON.stringify(e.response.data));
        }
        return false;
    }
}

// Emergency Email Test Route
app.get('/api/test-email', async (req, res) => {
    try {
        console.log('🧪 Triggering test email...');
        const result = await sendEmail(
             'gni.hrnotify@gmail.com', // Send to self for test
            'Test Email from GNITC Portal (Gmail API)',
            '<h1>It Works!</h1><p>Email configuration via Gmail API is correct.</p>'
        );
        if (result) res.send('Email Sent Successfully via Gmail API! Check logs.');
        else res.status(500).send('Email Failed. Check server logs.');
    } catch (e) {
        res.status(500).send(e.message);
    }
});

// Notification Schema
const notificationSchema = new mongoose.Schema({
    recipient: String,      // Student ID or 'admin' 
    recipientEmail: String, // For copy
    title: String,
    message: String,
    type: { type: String, default: 'info' }, // info, success, warning, error
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
const Notification = mongoose.model('Notification', notificationSchema);

// Helper: Create Notification
async function createNotification(recipient, title, message, type = 'info') {
    try {
        // 1. Save to DB
        await Notification.create({ recipient, title, message, type });
        
        // 2. Send Real-time notification (if using socket.io later, for now polling handles it)
        
        // 3. Send Email (Async)
        let email = '';
        if (recipient === 'admin') email = process.env.EMAIL_USER; // Send to admin email
        else {
            // If recipient is student ID, try to find email or construct it
            // Assuming studentId@gniindia.org pattern as per requirements
            email = `${recipient.toLowerCase()}@gniindia.org`;
        }
        
        // We only send email for specific high-priority events, logic will be in trigger points
    } catch (e) {
        console.error('Notification Error:', e);
    }
}

// ==================== NOTIFICATION ROUTES ====================

// Get Notifications for Current User
app.get('/api/notifications', async (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
        
        const recipient = req.session.user.role === 'admin' ? 'admin' : req.session.user.id;
        const notifications = await Notification.find({ recipient }).sort({ createdAt: -1 }).limit(20);
        const unreadCount = await Notification.countDocuments({ recipient, read: false });
        
        res.json({ notifications, unreadCount });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Mark as Read
app.post('/api/notifications/read', async (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
        
        const recipient = req.session.user.role === 'admin' ? 'admin' : req.session.user.id;
        
        if (req.body.id) {
            // Mark one
            await Notification.findByIdAndUpdate(req.body.id, { read: true });
        } else {
            // Mark all
            await Notification.updateMany({ recipient, read: false }, { read: true });
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.use('/logos', express.static(path.join(__dirname, 'logos')));
app.use('/styles.css', express.static(path.join(__dirname, 'styles.css')));

// Prevent favicon 404
app.get('/favicon.ico', (req, res) => res.status(204).end());

// MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/placement_db';
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB!');
    migratePasswords(); // Run migration on start
    checkStudentVerification(); // Check photos
    syncCompanies(); // Sync logos to DB
  })
  .catch(err => console.error('❌ MongoDB error:', err));

// ... (keep schema same)

// Auto-Sync Logos to Company DB
async function syncCompanies() {
    try {
        const logoDir = path.join(__dirname, 'logos');
        if (!fs.existsSync(logoDir)) return;

        // 1. Cleanup Broken Links in DB
        const dbCompanies = await Company.find({ logo: { $ne: '' } });
        for (const company of dbCompanies) {
            // SKIP verification if it's a remote URL (Cloudinary)
            if (company.logo && company.logo.startsWith('http')) continue;

            const logoPath = path.join(logoDir, company.logo);
            if (!fs.existsSync(logoPath)) {
                console.log(`⚠️ Logo missing for ${company.name}: ${company.logo}. Cleaning up...`);
                // Optional: Try to find a match with different extension
                const files = fs.readdirSync(logoDir);
                const match = files.find(f => path.parse(f).name.toLowerCase() === path.parse(company.logo).name.toLowerCase());
                
                if (match) {
                     company.logo = match;
                     await company.save();
                     console.log(`   ✅ Fixed with ${match}`);
                } else {
                     // If file completely gone, clear the logo field (or delete company?)
                     // User asked "update it", so let's keep company but clear logo to avoid 404
                     company.logo = ''; 
                     await company.save();
                }
            }
        }

        // 2. Add New Files from Disk
        const files = fs.readdirSync(logoDir).filter(f => /\.(jpg|jpeg|png|webp|jfif)$/i.test(f));
        let count = 0;
        
        for (const file of files) {
            const name = path.parse(file).name; // 'Google' from 'Google.png'
            // Check if exists (case insensitive)
            const exists = await Company.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
            
            if (!exists) {
                await Company.create({
                    name: name.charAt(0).toUpperCase() + name.slice(1), // Capitalize
                    logo: file
                });
                count++;
            } else if (!exists.logo) {
                // If company exists but has no logo, and we found one matching its name
                exists.logo = file;
                await exists.save();
                console.log(`   ✅ Attached ${file} to existing company ${exists.name}`);
            }
        }
        if (count > 0) console.log(`🏢 Synced ${count} new companies from logo files.`);
    } catch (e) {
        console.error('Company Sync Error:', e.message);
    }
}

// Schema: Each placement is a separate entry
const placementSchema = new mongoose.Schema({
  studentId: { type: String, required: true },
  name: String,
  company: String,
  salary: Number,
  photo: String,
  logo: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: Date,
  isOriginal: { type: Boolean, default: false }, // true for original imported data
  verificationStatus: { type: String, default: 'verified', enum: ['verified', 'pending', 'rejected'] }
});
const Placement = mongoose.model('Placement', placementSchema);

// Activity Log Schema
const logSchema = new mongoose.Schema({
    user: String,
    role: String,
    action: String,
    details: String,
    ip: String,
    timestamp: { type: Date, default: Date.now }
});
const ActivityLog = mongoose.model('ActivityLog', logSchema);

async function logActivity(req, action, details) {
    try {
        const user = req.session?.user ? `${req.session.user.name} (${req.session.user.id})` : 'Anonymous';
        const role = req.session?.user?.role || 'guest';
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        
        await ActivityLog.create({ user, role, action, details, ip });
    } catch (e) { console.error('Log error:', e.message); }
}

// Student Schema
const studentSchema = new mongoose.Schema({
  sno: Number,
  id: { type: String, required: true, unique: true },
  name: String,
  company: String,
  salary: Number,
  photo: String,
  logo: String,
  updatedBy: String,
  updatedAt: Date,
  password: { type: String, default: 'Welcome@123' },
  passwordChanged: { type: Boolean, default: false },
  verificationStatus: { type: String, default: 'verified', enum: ['verified', 'pending', 'rejected'] }
});
const Student = mongoose.model('Student', studentSchema);

// Auto-Migrate Passwords on Startup
async function migratePasswords() {
    try {
        const students = await Student.find({});
        let count = 0;
        for (const s of students) {
            // Check if password is not hashed (bcrypt hashes are 60 chars)
            if (s.password && s.password.length < 50) {
                s.password = await bcrypt.hash(s.password, 10);
                await s.save();
                count++;
            }
        }
        if (count > 0) console.log(`🔐 Migrated ${count} passwords to secure hashes.`);
    } catch (e) { console.error('Migration error:', e); }
}

// Auto-check Verification Status on Startup
async function checkStudentVerification() {
    try {
        const res = await Student.updateMany(
            { $or: [{ photo: null }, { photo: '' }] }, 
            { $set: { verificationStatus: 'pending' } }
        );
        if (res.modifiedCount > 0) {
            console.log(`⚠️  Marked ${res.modifiedCount} students as unverified (pending) due to missing photos.`);
        }
    } catch (e) { console.error('Verification check error:', e); }
}

// ==================== CREDENTIALS ====================
const ADMIN_CREDENTIALS = { username: 'ADMIN001', passwordHash: '' }; 
const ADMIN_PLAIN = process.env.ADMIN_PASSWORD || 'admin@123';

// ==================== AUTH MIDDLEWARE ====================
function requireLogin(req, res, next) {
  if (req.session && req.session.user) {
    next();
  } else {
    res.redirect('/login');
  }
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    next();
  } else {
    // For API calls, return JSON error instead of redirect
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Unauthorized - Admin login required' });
    }
    res.redirect('/login');
  }
}

function requireStudent(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'student') {
    next();
  } else {
    res.redirect('/login');
  }
}

// ==================== ROUTES ====================

// NEW: Get All Students (Admin)

// Root - redirect based on role
app.get('/', (req, res) => {
  if (req.session && req.session.user) {
    if (req.session.user.role === 'admin') {
      res.redirect('/admin');
    } else {
      res.redirect('/student');
    }
  } else {
    res.redirect('/login');
  }
});

// Login page
app.get('/login', (req, res) => {
  if (req.session && req.session.user) {
    if (req.session.user.role === 'admin') {
      res.redirect('/admin');
    } else {
      res.redirect('/student');
    }
  } else {
    res.sendFile(path.join(__dirname, 'login.html'));
  }
});

// Login API
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const upperUsername = username.toUpperCase();
    
    // Check Admin
    if (upperUsername === ADMIN_CREDENTIALS.username) {
        if (password === ADMIN_PLAIN) { // Keep admin simple or hash it too? Let's use simple for now as requested
            req.session.user = { id: 'ADMIN001', name: 'Administrator', role: 'admin' };
            await logActivity(req, 'LOGIN', 'Admin logged in');
            return res.json({ success: true, role: 'admin' });
        }
    }
    
    // Check Student
    const student = await Student.findOne({ id: { $regex: new RegExp(`^${upperUsername}$`, 'i') } });
    if (student) {
      const match = await bcrypt.compare(password, student.password);
      if (match) {
        req.session.user = { 
          id: student.id, 
          name: student.name, 
          role: 'student', 
          passwordChanged: student.passwordChanged 
        };
        await logActivity(req, 'LOGIN', `Student logged in: ${student.id}`);
        return res.json({ success: true, role: 'student' });
      }
    }
    
    await logActivity(req, 'LOGIN_FAIL', `Failed login attempt for: ${username}`);
    res.json({ success: false, message: 'Invalid credentials' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Change Password API
app.post('/api/change-password', requireStudent, async (req, res) => {
  try {
    const { newPassword } = req.body;
    
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await Student.findOneAndUpdate(
      { id: { $regex: new RegExp(`^${req.session.user.id}$`, 'i') } },
      { password: hashedPassword, passwordChanged: true }
    );
    
    await logActivity(req, 'PASSWORD_CHANGE', 'Student changed password');
    
    req.session.user.passwordChanged = true;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Auth Status Check
app.get('/api/auth/status', (req, res) => {
    if (req.session && req.session.user) {
        res.json({ isAuthenticated: true, user: req.session.user });
    } else {
        res.json({ isAuthenticated: false });
    }
});

// Activity Logs API
app.get('/api/admin/logs', requireAdmin, async (req, res) => {
    const logs = await ActivityLog.find().sort({ timestamp: -1 }).limit(100);
    res.json(logs);
});

app.get('/api/me', requireLogin, (req, res) => res.json(req.session.user));

// Get all placements for admin (combines original + new)
app.get('/api/placements', requireAdmin, async (req, res) => {
  try {
    // Get original student data
    const students = await Student.find().sort({ sno: 1 });
    
    // Get new placements added by students
    const newPlacements = await Placement.find({ isOriginal: false }).sort({ createdAt: -1 });
    
    // Combine: original students + new placements
    const allPlacements = [
      ...students.map(s => ({
        _id: s._id,
        studentId: s.id,
        name: s.name,
        company: s.company,
        salary: s.salary,
        photo: s.photo,
        logo: s.logo,
        logo: s.logo,
        isOriginal: true,
        verificationStatus: s.verificationStatus || 'verified'
      })),
      ...newPlacements.map(p => ({
        _id: p._id,
        studentId: p.studentId,
        name: p.name,
        company: p.company,
        salary: p.salary,
        photo: p.photo,
        logo: p.logo,
        logo: p.logo,
        isOriginal: false,
        createdAt: p.createdAt,
        verificationStatus: p.verificationStatus || 'verified'
      }))
    ];
    
    res.json({ placements: allPlacements, total: allPlacements.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get student's own data + placements
app.get('/api/my-profile', requireStudent, async (req, res) => {
  try {
    const student = await Student.findOne({ id: { $regex: new RegExp(`^${req.session.user.id}$`, 'i') } });
    const myPlacements = await Placement.find({ 
      studentId: { $regex: new RegExp(`^${req.session.user.id}$`, 'i') },
      isOriginal: false 
    }).sort({ createdAt: -1 });
    
    res.json({
      student: student || { id: req.session.user.id, name: req.session.user.name },
      placements: myPlacements,
      hasPhoto: !!student?.photo
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add new placement
app.post('/api/placements', requireStudent, async (req, res) => {
  try {
    const { company, salary, logo } = req.body;
    const student = await Student.findOne({ id: { $regex: new RegExp(`^${req.session.user.id}$`, 'i') } });
    
    if (!student?.photo) {
      return res.status(400).json({ error: 'Please upload your photo first' });
    }
    
    // Create initial placement
    const newPlacement = await Placement.create({
        studentId: req.session.user.id,
        name: student.name,
        company,
        salary: parseFloat(salary),
        logo: logo || student.logo, // Use provided logo or student's default
        photo: student.photo,
        verificationStatus: 'pending',
        isOriginal: false
    });
    
    // Notify Admin
    await createNotification('admin', 'New Placement Submission', `${req.session.user.name} (${req.session.user.id}) submitted placement at ${company}`, 'info');
    
    // Email Admin
    const alertHtml = `
        <div style="font-family: Arial, sans-serif;">
            <h2>🔔 Record Update - GNITC Special Batch</h2>
            <p>A student has submitted new placement details:</p>
            <ul>
                <li><strong>Student:</strong> ${req.session.user.name} (${req.session.user.id})</li>
                <li><strong>Company:</strong> ${company}</li>
                <li><strong>Package:</strong> ${salary} LPA</li>
            </ul>
            <p><a href="https://gnitc-sb-placements.vercel.app/login" style="color: #4f46e5; font-weight: bold;">Login to Verify</a></p>
        </div>
    `;
    // Fire-and-forget: don't block API response waiting for email
    sendEmail(process.env.EMAIL_USER, '🔔 New Submission - GNITC Special Batch', alertHtml)
      .catch(e => console.error('Email send failed:', e.message));

    await logActivity(req, 'ADD_PLACEMENT', `Added placement at ${company}`);
    return res.json({ success: true, placement: newPlacement });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete placement (only own, non-original)
app.delete('/api/placements/:id', requireStudent, async (req, res) => {
  try {
    const result = await Placement.deleteOne({
      _id: req.params.id,
      studentId: req.session.user.id,
      isOriginal: false
    });
    res.json({ success: result.deletedCount > 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload photo
app.post('/api/upload-photo', requireStudent, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Upload to Cloudinary
    const result = await uploadToCloudinary(
        req.file.buffer, 
        'student_photos', 
        req.session.user.id // Use student ID as public_id
    );
    
    const photoUrl = result.secure_url;
    
    // Update student record
    await Student.findOneAndUpdate(
      { id: { $regex: new RegExp(`^${req.session.user.id}$`, 'i') } },
      { photo: photoUrl, verificationStatus: 'pending' }
    );
    
    await logActivity(req, 'UPLOAD_PHOTO', 'Student uploaded new photo (Cloudinary)');
    
    // Update session
    req.session.user.photo = photoUrl;
    
    res.json({ success: true, photo: photoUrl });
  } catch (error) {
    console.error('Upload Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve Student Photos
app.get('/api/photo/:filename', (req, res) => {
    const filename = decodeURIComponent(req.params.filename);
    const filepath = path.join(__dirname, filename);
    if (fs.existsSync(filepath)) {
        res.sendFile(filepath);
    } else {
        res.status(404).send('Photo not found');
    }
});

// Serve Company Logos
app.get('/api/logos/:filename', (req, res) => {
    const filename = decodeURIComponent(req.params.filename);
    const filepath = path.join(__dirname, 'logos', filename);
    if (fs.existsSync(filepath)) {
        res.sendFile(filepath);
    } else {
        res.status(404).send('Logo not found');
    }
});

// Serve photos
app.get('/photo/:filename', requireLogin, (req, res) => {
  const filePath = path.join(__dirname, decodeURIComponent(req.params.filename));
  if (fs.existsSync(filePath)) res.sendFile(filePath);
  else res.status(404).send('Not found');
});

// Create new student account (Admin only)
app.post('/api/students/create', requireAdmin, async (req, res) => {
  try {
    const { id, name } = req.body;
    
    if (!id) return res.status(400).json({ error: 'Student ID is required' });
    
    const existingStudent = await Student.findOne({ id: { $regex: new RegExp(`^${id}$`, 'i') } });
    if (existingStudent) {
      return res.status(400).json({ error: 'Student ID already exists' });
    }
    
    // Hash default password
    const hashedPassword = await bcrypt.hash('Welcome@123', 10);
    
    const newStudent = new Student({
      id: id.toUpperCase(),
      name: name || 'Student',
      sno: await Student.countDocuments() + 1, // Simple auto-increment
      photo: '',
      logo: '',
      company: '',
      salary: 0,
      password: hashedPassword
    });
    
    await newStudent.save();
    await logActivity(req, 'CREATE_STUDENT', `Created student: ${id} (${name})`);
            
    // Notify Student (Welcome Email)
    const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <div style="background: #4f46e5; padding: 20px; text-align: center; color: white;">
            <h1 style="margin:0">GNITC SPECIAL BATCH PLACEMENT</h1>
            <p style="margin:10px 0 0;"><a href="https://gnitc-sb-placements.vercel.app/login" style="color: #fbbf24; text-decoration: underline;">https://gnitc-sb-placements.vercel.app</a></p>
        </div>
        <div style="padding: 30px; background: white;">
            <h2 style="color: #1e293b; margin-top: 0;">Welcome to the Elite League! 🌟</h2>
            <p style="color: #475569; line-height: 1.6;">Dear ${name},</p>
            <p style="color: #475569; line-height: 1.6;">You are receiving this invitation because you have successfully secured a placement. This portal serves as the official digital record of your achievement.</p>
            
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <h3 style="margin-top:0; color: #334155;">🔑 YOUR ACCESS CREDENTIALS</h3>
                <p style="margin: 5px 0;"><strong>📧 User ID:</strong> ${id}</p>
                <p style="margin: 5px 0;"><strong>🔐 Password:</strong> Welcome@123</p>
            </div>
            
            <p style="color: #15803d; font-weight: bold;">👉 ACTION REQUIRED:</p>
            <ol style="color: #475569; line-height: 1.6;">
                <li><a href="https://gnitc-sb-placements.vercel.app/login" style="color: #4f46e5;">Login to the portal</a></li>
                <li>Review your placement details</li>
                <li>Ensure your official photo is updated</li>
            </ol>
            
            <p style="color: #475569;">Best Regards,<br>GNITC Special Batch Team</p>
        </div>
    </div>`;
    // Fire-and-forget: don't block API response waiting for email
    sendEmail(`${id.toLowerCase()}@gniindia.org`, '🌟 Exclusive Access: GNITC Special Batch Portal', emailHtml)
      .catch(e => console.error('Welcome email failed:', e.message));
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Student (Admin)
app.put('/api/students/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, company, salary } = req.body;
        
        await Student.findOneAndUpdate(
            { id: { $regex: new RegExp(`^${id}$`, 'i') } },
            { name, company, salary: parseFloat(salary) || 0 }
        );
        
        await logActivity(req, 'UPDATE_STUDENT', `Admin updated student: ${id}`);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete Student (Admin)
app.delete('/api/students/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Delete from Student collection
        const student = await Student.findOneAndDelete({ id: { $regex: new RegExp(`^${id}$`, 'i') } });
        
        // Also delete their placements
        await Placement.deleteMany({ studentId: { $regex: new RegExp(`^${id}$`, 'i') } });
        
        // Delete photo file if exists
        if (student && student.photo) {
            const photoPath = path.join(__dirname, student.photo);
            if (fs.existsSync(photoPath)) {
                try { fs.unlinkSync(photoPath); } catch(e) {}
            }
        }
        
        // Notify via Email (Farewell/Notice)
        const emailHtml = `
            <div style="font-family: Arial, sans-serif;">
                <h2>Account Deletion Notice</h2>
                <p>Your account (ID: ${id}) has been removed from the GNITC Special Batch Portal.</p>
                <p>If you believe this is an error, please contact the placement cell.</p>
            </div>`;
        // Fire-and-forget: don't block response
        sendEmail(`${id.toLowerCase()}@gniindia.org`, 'Account Deleted - GNITC Special Batch', emailHtml)
          .catch(e => console.error('Deletion email failed:', e.message));
        
        await logActivity(req, 'DELETE_STUDENT', `Deleted student: ${id}`);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Verify/Reject (Admin Only)
// Verify/Reject (Admin Only)
app.post('/api/admin/verify', requireAdmin, async (req, res) => {
  try {
    const { type, id, action } = req.body; // type: 'student'|'placement', action: 'approve'|'reject'
    const status = action === 'approve' ? 'verified' : 'rejected';
    console.log(`[VERIFY] Request: Type=${type}, ID=${id}, Action=${action} -> Status=${status}`);
    
    if (type === 'placement') {
      const p = await Placement.findByIdAndUpdate(id, { verificationStatus: status });
      if (p) {
        console.log(`[VERIFY] Placement found: ${p._id}, StudentID: ${p.studentId}`);
        const student = await Student.findOne({ id: p.studentId || p.id });
        if (student) {
            console.log(`[VERIFY] Student found: ${student.id} (${student.name}). Preparing email...`);
            const title = status === 'verified' ? '✅ Official Record: VERIFIED' : '⚠️ Record Needs Revision';
            const message = status === 'verified' 
                ? `Great news! Your placement at ${p.company} has been verified and officially recorded.`
                : `Your placement at ${p.company} was not approved. Please check details and resubmit.`;
            
            // Email Content (Celebration/Revision)
            let emailHtml = '';
            if (status === 'verified') {
                emailHtml = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                    <div style="background: #4f46e5; padding: 20px; text-align: center; color: white;">
                        <h1 style="margin:0">RECORDS UPDATED</h1>
                        <p style="margin:5px 0 0; opacity: 0.9">GNITC SPECIAL BATCH</p>
                    </div>
                    <div style="padding: 30px; background: white;">
                        <h2 style="color: #1e293b; margin-top: 0;">✅ Official Record Status: VERIFIED</h2>
                        <p style="color: #475569; line-height: 1.6;">Dear ${student.name},</p>
                        <p style="color: #475569; line-height: 1.6;">This is to confirm that your placement details have been formally REVIEWED and VERIFIED by the administration.</p>
                        
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
                            <p style="margin: 5px 0;"><strong>👤 Student:</strong> ${student.name}</p>
                            <p style="margin: 5px 0;"><strong>🏢 Company:</strong> ${p.company}</p>
                            <p style="margin: 5px 0;"><strong>💰 Package:</strong> ${p.salary} LPA</p>
                            <p style="margin: 5px 0; color: #15803d; font-weight: bold;">✅ STATUS: VERIFIED</p>
                        </div>
                        
                        <p style="color: #475569;">Thank you for your cooperation in maintaining accurate records.</p>
                        <p style="color: #475569;">Best Regards,<br>GNITC Special Batch Team</p>
                    </div>
                </div>`;
            } else {
                 emailHtml = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                    <div style="background: #ef4444; padding: 20px; text-align: center; color: white;">
                        <h1 style="margin:0">ACTION REQUIRED</h1>
                        <p style="margin:5px 0 0; opacity: 0.9">GNITC SPECIAL BATCH</p>
                    </div>
                    <div style="padding: 30px; background: white;">
                        <h2 style="color: #1e293b; margin-top: 0;">⚠️ Record Status: REJECTED</h2>
                        <p style="color: #475569; line-height: 1.6;">Dear ${student.name},</p>
                        <p style="color: #475569; line-height: 1.6;">Your placement submission for <strong>${p.company}</strong> requires revision.</p>
                        <p style="color: #475569; line-height: 1.6;">Please login to the portal, edit the details, and resubmit for verification.</p>
                        <p style="color: #475569;">Best Regards,<br>GNITC Special Batch Team</p>
                    </div>
                </div>`;
            }

            await createNotification(student.id, title, message, status === 'verified' ? 'success' : 'warning');
            const emailTo = `${student.id.toLowerCase()}@gniindia.org`;
            console.log(`[VERIFY] Sending email to ${emailTo}`);
            // Fire-and-forget: don't block verification response
            sendEmail(emailTo, title, emailHtml)
              .catch(e => console.error('Verification email failed:', e.message));
        } else {
             console.error(`[VERIFY] Student NOT FOUND for placement ${p._id}, studentId: ${p.studentId}`);
        }
      } else {
          console.error(`[VERIFY] Placement NOT FOUND: ${id}`);
      }
    } else if (type === 'original') {
        const s = await Student.findByIdAndUpdate(id, { verificationStatus: status });
        if (s) {
            await createNotification(s.id, 'Profile Status Update', `Your profile verification status is now: ${status.toUpperCase()}`, 'info');
        }
    }
    
    await logActivity(req, 'VERIFY', `${action} ${type} ${id}`);
    res.json({ success: true });
  } catch (error) {
    console.error('[VERIFY] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send reminder emails to all pending verification students
app.post('/api/admin/send-pending-reminders', requireAdmin, async (req, res) => {
    try {
        // Find all pending placements
        const pendingPlacements = await Placement.find({ 
            verificationStatus: 'pending',
            isOriginal: false 
        });
        
        if (pendingPlacements.length === 0) {
            return res.json({ success: true, count: 0, message: 'No pending placements found' });
        }
        
        let sentCount = 0;
        const errors = [];
        
        for (const p of pendingPlacements) {
            const student = await Student.findOne({ id: p.studentId });
            if (!student) continue;
            
            const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                <div style="background: #f59e0b; padding: 20px; text-align: center; color: white;">
                    <h1 style="margin:0">⏳ VERIFICATION PENDING</h1>
                    <p style="margin:10px 0 0;"><a href="https://gnitc-sb-placements.vercel.app/login" style="color: white; text-decoration: underline;">GNITC Special Batch Placement Portal</a></p>
                </div>
                <div style="padding: 30px; background: white;">
                    <h2 style="color: #1e293b; margin-top: 0;">Action Required: Update Your Details</h2>
                    <p style="color: #475569; line-height: 1.6;">Dear ${student.name},</p>
                    <p style="color: #475569; line-height: 1.6;">Your placement record for <strong>${p.company}</strong> is still <span style="color: #f59e0b; font-weight: bold;">PENDING VERIFICATION</span>.</p>
                    
                    <div style="background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 20px; margin: 20px 0;">
                        <h3 style="margin-top:0; color: #92400e;">📋 YOUR SUBMISSION</h3>
                        <p style="margin: 5px 0;"><strong>👤 Name:</strong> ${student.name}</p>
                        <p style="margin: 5px 0;"><strong>🏢 Company:</strong> ${p.company}</p>
                        <p style="margin: 5px 0;"><strong>💰 Package:</strong> ${p.salary} LPA</p>
                        <p style="margin: 5px 0; color: #f59e0b; font-weight: bold;">⏳ Status: PENDING</p>
                    </div>
                    
                    <p style="color: #15803d; font-weight: bold;">👉 PLEASE ENSURE:</p>
                    <ol style="color: #475569; line-height: 1.6;">
                        <li>Your placement details are correct</li>
                        <li>Your official photo is uploaded</li>
                        <li>Company logo is visible</li>
                    </ol>
                    
                    <div style="text-align: center; margin: 25px 0;">
                        <a href="https://gnitc-sb-placements.vercel.app/login" 
                           style="background: #4f46e5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                           🔐 Login to Review
                        </a>
                    </div>
                    
                    <p style="color: #475569;">Best Regards,<br>GNITC Special Batch Team</p>
                </div>
            </div>`;
            
            const emailTo = `${student.id.toLowerCase()}@gniindia.org`;
            
            try {
                await sendEmail(emailTo, '⏳ Reminder: Your Placement is Pending Verification', emailHtml);
                sentCount++;
                console.log(`✅ Reminder sent to ${emailTo}`);
            } catch (e) {
                errors.push({ student: student.id, error: e.message });
                console.error(`❌ Failed to send to ${emailTo}: ${e.message}`);
            }
        }
        
        await logActivity(req, 'SEND_REMINDERS', `Sent ${sentCount} pending verification reminders`);
        res.json({ 
            success: true, 
            count: sentCount, 
            total: pendingPlacements.length,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        console.error('Send reminders error:', error);
        res.status(500).json({ error: error.message });
    }
});

// NEW: Get All Students (Admin)
app.get('/api/admin/students', requireAdmin, async (req, res) => {
    try {
        const students = await Student.find().sort({ sno: 1 });
        res.json(students);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Company Schema
const companySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    logo: String,
    createdAt: { type: Date, default: Date.now }
});
const Company = mongoose.model('Company', companySchema);

// ... (keep middle code) ...

// ==================== COMPANY ROUTES ====================

// Get all companies
app.get('/api/companies', requireLogin, async (req, res) => {
    try {
        const companies = await Company.find().sort({ name: 1 });
        res.json(companies);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Add new Company (Admin)
// Add new Company (Admin)
app.post('/api/companies', requireAdmin, upload.single('logo'), async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Company Name is required' });
        
        let logoUrl = '';
        
        // Upload to Cloudinary if file exists
        if (req.file) {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const result = await uploadToCloudinary(
                req.file.buffer, 
                'company_logos', 
                `company-${uniqueSuffix}`
            );
            logoUrl = result.secure_url;
        }

        const newCompany = new Company({ name, logo: logoUrl });
        await newCompany.save();
        
        await logActivity(req, 'ADD_COMPANY', `Added company: ${name}`);
        res.json({ success: true, company: newCompany });
    } catch (e) { 
        console.error('Company Add Error:', e);
        res.status(500).json({ error: e.message }); 
    }
});

// Delete Company (Admin)
app.delete('/api/companies/:id', requireAdmin, async (req, res) => {
    try {
        const company = await Company.findById(req.params.id);
        if (!company) return res.status(404).json({ error: 'Not found' });
        
        // Delete logo file
        if (company.logo) {
            const logoPath = path.join(__dirname, 'logos', company.logo);
            if (fs.existsSync(logoPath)) fs.unlinkSync(logoPath);
        }
        
        await Company.findByIdAndDelete(req.params.id);
        await logActivity(req, 'DELETE_COMPANY', `Deleted company: ${company.name}`);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get logos (Legacy compatibility + DB Check)
app.get('/api/logos', requireLogin, async (req, res) => {
  try {
    // Return formatted list for dropdowns
    const companies = await Company.find().sort({ name: 1 });
    // Transform to expected format if frontend still expects simple filenames, 
    // OR return full objects. Let's return objects to be smarter.
    // However, existing frontend expects array of strings (filenames).
    // Let's support both or just return filenames from DB.
    // Better: let's deprecate this and use /api/companies in frontend.
    // For now, keep as fallback scanning directory
    const logos = fs.readdirSync(path.join(__dirname, 'logos')).filter(f => /\.(jpg|jpeg|png|jfif)$/i.test(f));
    res.json(logos);
  } catch (e) { res.json([]); }
});

// ==================== DOWNLOADS ====================
app.get('/download/excel', requireAdmin, async (req, res) => {
  try {
    const filter = req.query.filter || 'all'; // 'all' or 'verified'
    const query = { photo: { $ne: '' } };
    if (filter === 'verified') query.verificationStatus = 'verified';
    
    const students = await Student.find(query).sort({ sno: 1 });
    
    const placementQuery = { isOriginal: false };
    if (filter === 'verified') placementQuery.verificationStatus = 'verified';
    const newPlacements = await Placement.find(placementQuery);
    
    const allData = [
      ...students.map((s, i) => ({ 'S.No': i + 1, 'Student ID': s.id, 'Name': s.name, 'Photo': s.photo, 'Company': s.company, 'Package (LPA)': s.salary, 'Type': 'Original' })),
      ...newPlacements.map((p, i) => ({ 'S.No': students.length + i + 1, 'Student ID': p.studentId, 'Name': p.name, 'Photo': p.photo, 'Company': p.company, 'Package (LPA)': p.salary, 'Type': 'New' }))
    ];
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(allData);
    XLSX.utils.book_append_sheet(wb, ws, 'Placements');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="CSE_Placement_Report.xlsx"');
    res.send(buffer);
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
});

// Helper to fetch image to base64 (supports URL and local)
async function fetchImageToBase64(imagePathOrUrl) {
  if (!imagePathOrUrl) return '';

  if (imagePathOrUrl.startsWith('http')) {
    try {
      const response = await fetch(imagePathOrUrl);
      if (!response.ok) return '';
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer).toString('base64');
    } catch (e) {
      console.error('Failed to fetch image:', imagePathOrUrl, e.message);
      return '';
    }
  } else {
    // Local fallback (for old images if any or logos folder)
    let localPath = path.join(__dirname, imagePathOrUrl);
    
    // Check if it's in logos folder explicitly locally
    if (!fs.existsSync(localPath) && !imagePathOrUrl.includes('/')) {
         localPath = path.join(__dirname, 'logos', imagePathOrUrl);
    }

    if (fs.existsSync(localPath)) {
      return fs.readFileSync(localPath).toString('base64');
    }
    return ''; // Return empty if not found, NOT 'image/png'
  }
  return '';
}

// Helper: Normalize company name for fuzzy matching
function normalizeCompanyName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/\s+/g, '') // Remove ALL spaces first
    .replace(/[^a-z0-9]/gi, '') // Remove special chars
    .replace(/(technologies|tech|solutions|pvt|ltd|limited|private|inc|llp)$/gi, '') // Remove suffixes
    .trim();
}

app.get('/download/word', requireAdmin, async (req, res) => {
  try {
    const filter = req.query.filter || 'all';
    const query = { photo: { $ne: '' } };
    if (filter === 'verified') query.verificationStatus = 'verified';
    
    const students = await Student.find(query).sort({ sno: 1 });
    
    const placementQuery = { isOriginal: false };
    if (filter === 'verified') placementQuery.verificationStatus = 'verified';
    const newPlacements = await Placement.find(placementQuery);
    
    const allPlacements = [...students, ...newPlacements];
    
    // Pre-fetch all companies for logo lookup
    const companies = await Company.find({});
    const companyLogoMap = {};
    companies.forEach(c => {
      companyLogoMap[normalizeCompanyName(c.name)] = c.logo;
    });
    
    // Process rows concurrently for speed
    const rowPromises = allPlacements.map(async (s, i) => {
      let photoImg = '', logoImg = '';
      
      const photoB64 = await fetchImageToBase64(s.photo);
      if (photoB64) {
        photoImg = `<img src="data:image/jpeg;base64,${photoB64}" width="50" height="60">`;
      }
      
      // Get logo - ALWAYS prefer Company collection (most up-to-date)
      // Old placements may have broken local API URLs or local filenames
      let logoUrl = '';
      
      // First try Company collection lookup (most reliable)
      const companyName = normalizeCompanyName(s.company);
      if (companyName && companyLogoMap[companyName]) {
        logoUrl = companyLogoMap[companyName];
      }
      
      // Fallback to stored logo ONLY if it's a valid Cloudinary URL
      if (!logoUrl && s.logo && s.logo.includes('cloudinary.com')) {
        logoUrl = s.logo;
      }
      
      if (logoUrl) {
        // FORCE JPEG (Max Compatibility for Word)
        // Remove any existing transformations first to be safe (optional, but cleaner)
        if (logoUrl.includes('cloudinary.com')) {
             if (!logoUrl.includes('f_jpg')) {
                // If it already has f_png, replace it, otherwise insert
                if (logoUrl.includes('/f_png/')) {
                    logoUrl = logoUrl.replace('/f_png/', '/f_jpg/');
                } else if (logoUrl.includes('/upload/')) {
                    logoUrl = logoUrl.replace('/upload/', '/upload/f_jpg/');
                }
             }
        }
        
        console.log(`[Report] Fetching logo for ${s.company}: ${logoUrl}`);
        const logoB64 = await fetchImageToBase64(logoUrl);
        
        if (logoB64 && logoB64.length > 100) { 
          // Use image/jpeg
          logoImg = `<img src="data:image/jpeg;base64,${logoB64}" width="40" height="25">`;
          console.log(`   ✅ Success (${logoB64.length} chars)`);
        } else {
          console.log(`   ❌ Failed to fetch/convert`);
        }
      }

      const studentId = s.studentId || s.id;
      return `<tr style="background:${i%2===0?'#f8f8f8':'white'}"><td style="border:1px solid #ccc;padding:8px">${i+1}</td><td style="border:1px solid #ccc;padding:5px">${photoImg}</td><td style="border:1px solid #ccc;padding:8px"><b>${s.name}</b><br><small>${studentId}</small></td><td style="border:1px solid #ccc;padding:8px">${s.company}</td><td style="border:1px solid #ccc;padding:5px">${logoImg}</td><td style="border:1px solid #ccc;padding:8px;color:green"><b>${s.salary} LPA</b></td></tr>`;
    });

    const rows = (await Promise.all(rowPromises)).join('');
    
    const html = `<html><head><meta charset="utf-8"><style>body{font-family:Calibri;margin:30px}h1{text-align:center}table{width:100%;border-collapse:collapse}th{background:#1e293b;color:white;padding:10px}</style></head><body><h1>CSE Placement Report 2025</h1><table><tr><th>S.No</th><th>Photo</th><th>Name/ID</th><th>Company</th><th>Logo</th><th>Package</th></tr>${rows}</table></body></html>`;
    
    res.setHeader('Content-Type', 'application/msword');
    res.setHeader('Content-Disposition', 'attachment; filename="CSE_Placement_Report.doc"');
    res.send(html);
  } catch (err) {
    console.error('Word Export Error:', err);
    res.status(500).send('Error: ' + err.message);
  }
});

app.get('/preview/word', requireAdmin, async (req, res) => {
  try {
    const students = await Student.find({ photo: { $ne: '' } }).sort({ sno: 1 });
    const newPlacements = await Placement.find({ isOriginal: false });
    const all = [...students, ...newPlacements];
    
    // Pre-fetch all companies for logo lookup
    const companies = await Company.find({});
    const companyLogoMap = {};
    companies.forEach(c => {
      companyLogoMap[normalizeCompanyName(c.name)] = c.logo;
    });
    
    const rowPromises = all.map(async (s, i) => {
      let photo = '', logo = '';
      
      const photoB64 = await fetchImageToBase64(s.photo);
      if (photoB64) {
        photo = `<img src="data:image/jpeg;base64,${photoB64}" width="55" height="70" style="border-radius:5px">`;
      }
      
      // Get logo - ALWAYS prefer Company collection (most up-to-date)
      // Old placements may have broken local API URLs or local filenames
      let logoUrl = '';
      
      // First try Company collection lookup (most reliable)
      const companyName = normalizeCompanyName(s.company);
      if (companyName && companyLogoMap[companyName]) {
        logoUrl = companyLogoMap[companyName];
      }
      
      // Fallback to stored logo ONLY if it's a valid Cloudinary URL
      if (!logoUrl && s.logo && s.logo.includes('cloudinary.com')) {
        logoUrl = s.logo;
      }
      
      if (logoUrl) {
        const logoB64 = await fetchImageToBase64(logoUrl);
        if (logoB64) {
          logo = `<img src="data:image/jpeg;base64,${logoB64}" width="45" height="30">`;
        }
      }

      const isNew = !s.sno;
      const badge = isNew ? '<span style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px;font-size:10px;margin-left:5px">NEW</span>' : '';
      return `<tr style="background:${i%2===0?'#f8fafc':'white'}"><td style="border:1px solid #e2e8f0;padding:12px">${i+1}</td><td style="border:1px solid #e2e8f0;padding:8px">${photo}</td><td style="border:1px solid #e2e8f0;padding:12px"><strong>${s.name}</strong>${badge}<br><span style="color:#64748b">${s.studentId||s.id}</span></td><td style="border:1px solid #e2e8f0;padding:12px">${s.company}</td><td style="border:1px solid #e2e8f0;padding:8px">${logo}</td><td style="border:1px solid #e2e8f0;padding:12px"><span style="background:#d1fae5;padding:6px 12px;border-radius:20px;font-weight:bold;color:#065f46">${s.salary} LPA</span></td></tr>`;
    });

    const rows = (await Promise.all(rowPromises)).join('');
    
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Preview</title><style>body{font-family:Calibri;margin:0;padding:20px;background:#667eea}.container{max-width:1100px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,0.3)}.header{background:#1e293b;color:white;padding:30px;text-align:center}.btn-bar{padding:25px;background:#f0fdf4;text-align:center}.btn{display:inline-block;padding:14px 35px;margin:0 10px;border-radius:10px;font-weight:600;text-decoration:none}.btn-word{background:#3b82f6;color:white}.btn-excel{background:#10b981;color:white}.btn-print{background:#f59e0b;color:white;border:none;cursor:pointer}table{width:100%;border-collapse:collapse}th{background:#1e293b;color:white;padding:14px}</style></head><body><div class="container"><div class="header"><h1>CSE Placement Report 2025</h1><p>Total: ${all.length} placements</p></div><div class="btn-bar"><a href="/download/word" class="btn btn-word">📄 Word</a><a href="/download/excel" class="btn btn-excel">📊 Excel</a><button class="btn btn-print" onclick="window.print()">🖨️ Print</button></div><div style="padding:30px"><table><tr><th>S.No</th><th>Photo</th><th>Name/ID</th><th>Company</th><th>Logo</th><th>Package</th></tr>${rows}</table></div></div></body></html>`);
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
});

// 404 handler for undefined routes (prevents ENOENT errors)
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', message: 'The requested route does not exist' });
});

app.listen(PORT, () => console.log(`\n🚀 Server: http://localhost:${PORT}\n`));
