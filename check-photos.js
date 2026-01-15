require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const studentSchema = new mongoose.Schema({
    id: String,
    photo: String,
    name: String
  });
  
  const Student = mongoose.model('Student', studentSchema);
  
  console.log('\n=== CHECKING STUDENT PHOTOS IN DATABASE ===\n');
  
  const students = await Student.find({ photo: { $exists: true, $ne: '' } }).limit(10);
  
  if (students.length === 0) {
    console.log('No students have photos in the database!');
  } else {
    students.forEach(s => {
      const isCloudinary = s.photo?.startsWith('http');
      console.log(`${s.id}: ${isCloudinary ? '✓ CLOUDINARY' : '✗ LOCAL'} => ${s.photo?.substring(0, 60)}...`);
    });
  }
  
  console.log('\n=== SUMMARY ===');
  const total = await Student.countDocuments({ photo: { $exists: true, $ne: '' } });
  const cloudinary = await Student.countDocuments({ photo: { $regex: /^https:\/\/res\.cloudinary/ } });
  console.log(`Total with photos: ${total}`);
  console.log(`Cloudinary URLs: ${cloudinary}`);
  console.log(`Local paths (need migration): ${total - cloudinary}`);
  
  process.exit();
}).catch(err => {
  console.error('DB Error:', err.message);
  process.exit(1);
});
