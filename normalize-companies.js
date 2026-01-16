require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/placement_db';

const placementSchema = new mongoose.Schema({
  studentId: { type: String, required: true },
  name: String,
  company: String,
  salary: Number,
  photo: String,
  logo: String,
  verificationStatus: { type: String, default: 'pending' }
});
const Placement = mongoose.model('Placement', placementSchema);

const studentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  company: String,
  logo: String,
  verificationStatus: { type: String, default: 'pending' }
});
const Student = mongoose.model('Student', studentSchema);

const companySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    logo: String
});
const Company = mongoose.model('Company', companySchema);

// Stronger cleaning function
function cleanCompanyName(name) {
    if (!name) return '';
    
    let cleaned = name.trim();
    
    // Case-insensitive replacements
    const removals = [
        /\s+Edtech\s+Pvt\s+Ltd\.?$/i,
        /\s+Edtech\s+Pvt\s+Ltd$/i,
        /\s+Pvt\s+Ltd\.?$/i,
        /\s+Pvt\.?\s+Ltd\.?$/i,
        /\s+Private\s+Limited$/i,
        /\s+Priavte\s+Limited$/i, // Common typo
        /\s+LLP\.?$/i,
        /\s+Inc\.?$/i,
        /\s+Technologies$/i, 
        /\s+Technology$/i,
        /\s+Tech$/i,
        /\s+Solutions$/i,
        /\s+Software$/i,
        /\s+NPN\s+Salesforce$/i,
        /\s+GenC$/i, // Common Cognizant suffix
        /\s+GenC\s+Elevate$/i,
        /\s+India$/i
    ];
    
    // Apply removals
    removals.forEach(regex => {
        cleaned = cleaned.replace(regex, '');
    });
    
    return cleaned.trim();
}

async function migrate() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // 1. Clean Placements
        const placements = await Placement.find({});
        for (const p of placements) {
            const original = p.company;
            const cleaned = cleanCompanyName(original);
            
            if (original !== cleaned) {
                console.log(`[Placement] Renaming '${original}' -> '${cleaned}'`);
                p.company = cleaned;
                
                // Try to find better logo if current one is weak/missing
                if (!p.logo || !p.logo.includes('cloudinary')) {
                     // Check Company collection for better logo
                     const comp = await Company.findOne({ name: { $regex: new RegExp(`^${cleaned}$`, 'i') } });
                     if (comp && comp.logo) {
                         p.logo = comp.logo;
                         console.log(`   + Updated logo from Company registry`);
                     }
                }
                
                await p.save();
            }
        }

        // 2. Clean Students (Originals)
        const students = await Student.find({});
        for (const s of students) {
             const original = s.company;
             const cleaned = cleanCompanyName(original);
             
             if (original && original !== cleaned) {
                 console.log(`[Student] Renaming '${original}' -> '${cleaned}'`);
                 s.company = cleaned;
                 
                 // Fix logo if needed
                 const comp = await Company.findOne({ name: { $regex: new RegExp(`^${cleaned}$`, 'i') } });
                 if (comp && comp.logo) {
                     s.logo = comp.logo;
                 }
                 
                 await s.save();
             }
        }
        
        // 3. Clean Company Registry itself
        const companies = await Company.find({});
        for (const c of companies) {
             const original = c.name;
             const cleaned = cleanCompanyName(original);
             
             if (original !== cleaned) {
                 // Check if cleaned version already exists
                 const existing = await Company.findOne({ name: { $regex: new RegExp(`^${cleaned}$`, 'i') }, _id: { $ne: c._id } });
                 if (existing) {
                     console.log(`[Company] Merging '${original}' into existing '${cleaned}'`);
                     // If original has better logo, take it?
                     if (!existing.logo && c.logo) {
                         existing.logo = c.logo;
                         await existing.save();
                     }
                     // Delete redundant
                     await Company.deleteOne({ _id: c._id });
                 } else {
                     console.log(`[Company] Renaming Registry '${original}' -> '${cleaned}'`);
                     c.name = cleaned;
                     await c.save();
                 }
             }
        }

        console.log('✨ Migration Complete');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

migrate();
