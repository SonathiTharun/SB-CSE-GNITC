
try {
    console.log('Starting...');
    const mongoose = require('mongoose');
    console.log('Mongoose loaded.');
    require('dotenv').config();
    console.log('Dotenv loaded.');
    console.log('URI:', process.env.MONGODB_URI || 'default');
} catch (e) {
    console.error('Error:', e);
}
