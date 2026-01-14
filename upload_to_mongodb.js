const mongoose = require('mongoose');
const fs = require('fs');

const MONGODB_URI = 'mongodb+srv://tharun3274:Tharun@cluster0.el8dd.mongodb.net/placement_db';

// Student Schema
const studentSchema = new mongoose.Schema({
  sno: Number,
  id: String,
  name: String,
  company: String,
  salary: Number,
  photo: String,
  logo: String
});

const Student = mongoose.model('Student', studentSchema);

async function uploadData() {
  try {
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB!');
    
    // Read data.json
    const data = JSON.parse(fs.readFileSync('./data.json', 'utf8'));
    console.log(`📊 Found ${data.students.length} students in data.json`);
    
    // Clear existing data
    await Student.deleteMany({});
    console.log('🗑️ Cleared existing data');
    
    // Insert new data
    const result = await Student.insertMany(data.students);
    console.log(`✅ Successfully uploaded ${result.length} students to MongoDB!`);
    
    // Show sample
    const sample = await Student.findOne({ photo: { $ne: '' } });
    if (sample) {
      console.log('\n📝 Sample student with photo:');
      console.log(`   Name: ${sample.name}`);
      console.log(`   ID: ${sample.id}`);
      console.log(`   Company: ${sample.company}`);
      console.log(`   Photo: ${sample.photo}`);
    }
    
    mongoose.disconnect();
    console.log('\n🎉 Done! Data is now in MongoDB.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

uploadData();
