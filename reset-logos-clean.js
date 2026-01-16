
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/placement_db';

// Helper: Normalize
function normalizeCompanyName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/\s*(ltd|limited|pvt|private|inc|llp|technologies|tech|solutions)\s*/gi, '')
    .replace(/[^a-z0-9]/gi, '')
    .trim();
}

async function cleanReset() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const Company = mongoose.model('Company', new mongoose.Schema({
            name: String, logo: String
        }));

        console.log('🧹 Clearing ALL existing logo links in Database...');
        // Set all logos to empty string to start fresh
        await Company.updateMany({}, { $set: { logo: '' } });
        console.log('✅ Database Cleared.');

        const companies = await Company.find({});
        console.log(`Found ${companies.length} companies to process.`);

        const logoDir = path.join(__dirname, 'logos');
        // Filter for images only
        const localFiles = fs.readdirSync(logoDir).filter(f => /\.(jpg|jpeg|png|webp|jfif)$/i.test(f));
        
        console.log(`📂 Found ${localFiles.length} local logo files.`);
        
        let uploadedCount = 0;
        let missingCount = 0;

        for (const company of companies) {
            const normalizedParams = normalizeCompanyName(company.name);
            
            // Try exact match first
            let match = localFiles.find(f => path.parse(f).name === company.name);
            
            // Try Case-Insensitive match
            if (!match) {
                 match = localFiles.find(f => path.parse(f).name.toLowerCase() === company.name.toLowerCase());
            }

            // Try Fuzzy Normalized match
            if (!match) {
                 match = localFiles.find(f => normalizeCompanyName(path.parse(f).name) === normalizedParams);
            }

            if (match) {
                const filePath = path.join(logoDir, match);
                console.log(`🚀 Uploading for "${company.name}" (File: ${match})...`);
                
                try {
                    // Upload to Cloudinary
                    // Use standard Public ID format: company_NAME
                    const publicId = `company_${company.name.replace(/[^a-z0-9]/gi, '_')}`;
                    
                    const result = await cloudinary.uploader.upload(filePath, {
                        folder: 'company_logos',
                        public_id: publicId,
                        overwrite: true,
                        invalidate: true,
                        resource_type: 'image'
                    });
                    
                    // SAVE URL TO DB
                    company.logo = result.secure_url;
                    await company.save();
                    
                    console.log(`   ✅ Success: ${result.secure_url}`);
                    uploadedCount++;
                } catch (err) {
                    console.error(`   ❌ Upload Failed:`, err.message);
                }
            } else {
                console.log(`   ⚠️ NO LOCAL FILE FOUND for "${company.name}"`);
                missingCount++;
            }
        }
        
        console.log(`\n🎉 Reset Complete.`);
        console.log(`   - Uploaded/Linked: ${uploadedCount}`);
        console.log(`   - Missing Local Files: ${missingCount}`);

    } catch (e) {
        console.error('Fatal Error:', e);
    } finally {
        mongoose.disconnect();
    }
}

cleanReset();
