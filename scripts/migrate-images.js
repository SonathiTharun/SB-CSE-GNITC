const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Models (Simplified for migration)
const studentSchema = new mongoose.Schema({
  id: String,
  name: String,
  photo: String
}, { strict: false });
const Student = mongoose.model('Student', studentSchema);

const companySchema = new mongoose.Schema({
  name: String,
  logo: String
}, { strict: false });
const Company = mongoose.model('Company', companySchema);

const placementSchema = new mongoose.Schema({
  studentId: String,
  logo: String
}, { strict: false });
const Placement = mongoose.model('Placement', placementSchema);

// Helper: Upload to Cloudinary
async function uploadFile(filePath, folder, publicId) {
    try {
        if (!fs.existsSync(filePath)) {
            return null;
        }
        const result = await cloudinary.uploader.upload(filePath, {
            folder: folder,
            public_id: publicId,
            overwrite: true,
            resource_type: 'image'
        });
        return result.secure_url;
    } catch (e) {
        console.error(`❌ Upload failed for ${filePath}:`, e.message);
        return null;
    }
}

async function migrate() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI missing');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected!');

        // 1. Migrate Student Photos
        console.log('\n--- Migrating Student Photos ---');
        const students = await Student.find({ photo: { $ne: '' } });
        console.log(`Found ${students.length} students with photos.`);
        
        for (const s of students) {
            if (s.photo && !s.photo.startsWith('http')) {
                // Photos are in root (../ relative to scripts/)
                const localPath = path.join(__dirname, '..', s.photo);
                console.log(`Uploading photo for ${s.name} (${s.id})...`);
                const url = await uploadFile(localPath, 'student_photos', s.id);
                
                if (url) {
                    await Student.updateOne({ _id: s._id }, { photo: url });
                    console.log(`✅ Updated ${s.name}: ${url}`);
                } else {
                    console.log(`⚠️ File not found or upload failed: ${localPath}`);
                }
            } else {
                console.log(`⏩ Skipping ${s.name} (already URL or empty)`);
            }
        }

        // 2. Migrate Company Logos
        console.log('\n--- Migrating Company Logos ---');
        const companies = await Company.find({ logo: { $ne: '' } });
        console.log(`Found ${companies.length} companies with logos.`);

        for (const c of companies) {
            if (c.logo && !c.logo.startsWith('http')) {
                // Logos are in logos/ folder
                const localPath = path.join(__dirname, '..', 'logos', c.logo);
                console.log(`Uploading logo for ${c.name}...`);
                const url = await uploadFile(localPath, 'company_logos', `company-${c.name.replace(/\s+/g, '_')}`);
                
                if (url) {
                    await Company.updateOne({ _id: c._id }, { logo: url });
                    console.log(`✅ Updated ${c.name}: ${url}`);
                    
                    const pRes = await Placement.updateMany({ logo: c.logo }, { logo: url });
                    if (pRes.modifiedCount) console.log(`   Reflected in ${pRes.modifiedCount} placements`);
                } else {
                    console.log(`⚠️ File not found: ${localPath}`);
                }
            } else {
                console.log(`⏩ Skipping ${c.name} (already URL)`);
            }
        }

        // 3. Migrate lingering Placement logos
        console.log('\n--- Checking Placement Logos ---');
        const placements = await Placement.find({ logo: { $ne: '', $regex: /^[^h]/ } }); 
        for (const p of placements) {
            if (p.logo && !p.logo.startsWith('http')) {
                 const localPath = path.join(__dirname, '..', 'logos', p.logo);
                 if (fs.existsSync(localPath)) {
                     console.log(`Uploading orphan logo for Placement ${p._id}...`);
                     const url = await uploadFile(localPath, 'company_logos', `placement-${p._id}`);
                     if (url) {
                         await Placement.updateOne({ _id: p._id }, { logo: url });
                         console.log(`✅ Updated placement logo`);
                     }
                 }
            }
        }

        console.log('\n✨ Migration Complete!');
        process.exit(0);
    } catch (e) {
        console.error('Migration failed:', e);
        process.exit(1);
    }
}

migrate();
