
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

async function repair() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const Company = mongoose.model('Company', new mongoose.Schema({
            name: String, logo: String
        }));

        const companies = await Company.find({});
        console.log(`Found ${companies.length} companies to check.`);

        const logoDir = path.join(__dirname, 'logos');
        const localFiles = fs.readdirSync(logoDir);
        
        let updatedCount = 0;

        for (const company of companies) {
            // Check if current logo is valid URL
            let needsUpload = false;
            
            if (!company.logo || !company.logo.startsWith('http')) {
                needsUpload = true; // No URL or local path
            } else {
                 // It has a URL, but is it the BROKEN one? user logs showed many broken ones.
                 // We can't easily check HTTP status for all without being slow, 
                 // BUT the user specifically said "if logos are not there... upload it".
                 // Let's assume if we match a local file, we should refresh the Cloudinary URL 
                 // to be 100% sure, OR we can try to rely on the "cleaning up" log logic.
                 // Safer approach: If we find a local match, upload it and update DB to ensure freshness.
                 // This ensures we fix the broken links.
                 needsUpload = true; 
            }

            if (needsUpload) {
                // Find matching local file
                const normalizedParams = normalizeCompanyName(company.name);
                
                // Try exact match first, then normalized
                let match = localFiles.find(f => path.parse(f).name === company.name); // Exact name match
                if (!match) {
                     match = localFiles.find(f => normalizeCompanyName(path.parse(f).name) === normalizedParams);
                }
                
                if (match) {
                    console.log(`Uploading logo for ${company.name} (Found: ${match})...`);
                    try {
                        const filePath = path.join(logoDir, match);
                        const result = await cloudinary.uploader.upload(filePath, {
                            folder: 'company_logos',
                            public_id: `company-${company.name.replace(/[^a-z0-9]/gi, '_')}`,
                            overwrite: true
                        });
                        
                        company.logo = result.secure_url;
                        await company.save();
                        console.log(`   ✅ Updated DB for ${company.name}: ${result.secure_url}`);
                        updatedCount++;
                    } catch (err) {
                        console.error(`   ❌ Upload Failed for ${company.name}:`, err.message);
                    }
                } else {
                    console.log(`   ⚠️ No local logo found for ${company.name}`);
                }
            }
        }
        
        console.log(`\n🎉 Repair Complete. Updated ${updatedCount} companies.`);

    } catch (e) {
        console.error('Fatal Error:', e);
    } finally {
        mongoose.disconnect();
    }
}

repair();
