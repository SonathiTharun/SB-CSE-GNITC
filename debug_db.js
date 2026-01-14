const mongoose = require('mongoose');
const uri = "mongodb+srv://tharun3274:Tharun@cluster0.el8dd.mongodb.net/admin";

mongoose.connect(uri).then(async () => {
    try {
        const admin = new mongoose.mongo.Admin(mongoose.connection.db);
        const result = await admin.listDatabases();
        console.log("--- START LIST ---");
        result.databases.forEach(db => {
             // Show name and size to help identify
             console.log(`DB_NAME: ${db.name} | SIZE: ${db.sizeOnDisk}`);
        });
        console.log("--- END LIST ---");
    } catch(e) { console.log(e); }
    process.exit();
}).catch(e => { console.log(e); process.exit(1); });
