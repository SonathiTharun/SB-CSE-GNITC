require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const companySchema = new mongoose.Schema({
    name: String,
    logo: String
  });
  
  const Company = mongoose.model('Company', companySchema);
  
  console.log('\n=== CHECKING COMPANY LOGOS IN DATABASE ===\n');
  
  const companies = await Company.find({}).limit(15);
  
  if (companies.length === 0) {
    console.log('No companies in the database!');
  } else {
    companies.forEach(c => {
      const isCloudinary = c.logo?.startsWith('http');
      const status = !c.logo ? '✗ NO LOGO' : (isCloudinary ? '✓ CLOUDINARY' : '✗ LOCAL');
      console.log(`${c.name}: ${status} => ${c.logo?.substring(0, 50) || 'N/A'}...`);
    });
  }
  
  console.log('\n=== SUMMARY ===');
  const total = await Company.countDocuments();
  const withLogos = await Company.countDocuments({ logo: { $exists: true, $ne: '' } });
  const cloudinary = await Company.countDocuments({ logo: { $regex: /^https:\/\/res\.cloudinary/ } });
  console.log(`Total companies: ${total}`);
  console.log(`With logos: ${withLogos}`);
  console.log(`Cloudinary URLs: ${cloudinary}`);
  console.log(`Local/Missing logos: ${withLogos - cloudinary}`);
  
  process.exit();
}).catch(err => {
  console.error('DB Error:', err.message);
  process.exit(1);
});
