/**
 * Send Apology Emails to Verified Students
 * 
 * This script sends a one-time apology email to all verified students
 * who missed the verification confirmation email due to a bug.
 * 
 * Usage:
 *   node send-apology-emails.js --dry-run   # Preview recipients (no emails sent)
 *   node send-apology-emails.js             # Send emails
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { google } = require('googleapis');

// ==================== CONFIG ====================
const MONGODB_URI = process.env.MONGODB_URI;
const DRY_RUN = process.argv.includes('--dry-run');

// Gmail OAuth2 Setup
const OAuth2 = google.auth.OAuth2;
const oauth2Client = new OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground"
);

oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

// ==================== SCHEMAS ====================
const studentSchema = new mongoose.Schema({
    sno: Number,
    id: { type: String, required: true, unique: true },
    name: String,
    company: String,
    salary: Number,
    photo: String,
    verificationStatus: { type: String, default: 'pending' }
});
const Student = mongoose.model('Student', studentSchema);

const placementSchema = new mongoose.Schema({
    studentId: { type: String, required: true },
    name: String,
    company: String,
    salary: Number,
    photo: String,
    verificationStatus: { type: String, default: 'pending' }
});
const Placement = mongoose.model('Placement', placementSchema);

// ==================== EMAIL FUNCTIONS ====================
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

async function sendEmail(to, subject, html) {
    try {
        console.log(`📨 Sending email to ${to}...`);
        
        const raw = makeBody(to, process.env.GMAIL_SENDER || process.env.EMAIL_USER, subject, html);
        
        const response = await gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw }
        });

        console.log(`✅ Email sent to ${to} (ID: ${response.data.id})`);
        return true;
    } catch (e) {
        console.error(`❌ Failed to send to ${to}: ${e.message}`);
        return false;
    }
}

function generateApologyEmail(studentName, company, salary) {
    return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 30px; text-align: center; color: white;">
            <h1 style="margin:0; font-size: 28px;">🎉 CONGRATULATIONS! 🎉</h1>
            <p style="margin:10px 0 0; opacity: 0.9; font-size: 16px;">GNITC SPECIAL BATCH</p>
        </div>
        
        <!-- Body -->
        <div style="padding: 30px; background: white;">
            <!-- Apology Section -->
            <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin-bottom: 20px; border-radius: 0 8px 8px 0;">
                <p style="margin: 0; color: #92400e; font-size: 14px;">
                    🙏 <strong>We sincerely apologize</strong> for the delay in sending this confirmation. 
                    Due to a technical issue on our end, the verification email was not delivered when your placement was approved.
                </p>
            </div>
            
            <p style="color: #475569; line-height: 1.6; font-size: 16px;">Dear <strong>${studentName}</strong>,</p>
            
            <p style="color: #475569; line-height: 1.6;">
                This email serves as your <strong>official confirmation</strong> that your placement details have been 
                <span style="color: #059669; font-weight: bold;">REVIEWED and VERIFIED</span> by the administration.
            </p>
            
            <!-- Placement Details Card -->
            <div style="background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); border: 1px solid #cbd5e1; border-radius: 12px; padding: 20px; margin: 25px 0;">
                <h3 style="margin: 0 0 15px 0; color: #334155; font-size: 16px;">📋 YOUR VERIFIED PLACEMENT</h3>
                <p style="margin: 8px 0; color: #475569;"><strong>👤 Student:</strong> ${studentName}</p>
                <p style="margin: 8px 0; color: #475569;"><strong>🏢 Company:</strong> ${company || 'N/A'}</p>
                <p style="margin: 8px 0; color: #475569;"><strong>💰 Package:</strong> ${salary || 0} LPA</p>
                <p style="margin: 12px 0 0 0; color: #059669; font-weight: bold; font-size: 18px;">✅ STATUS: VERIFIED</p>
            </div>
            
            <!-- Inspirational Quote -->
            <div style="background: linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%); border-radius: 12px; padding: 25px; margin: 25px 0; text-align: center;">
                <p style="margin: 0; font-style: italic; color: #5b21b6; font-size: 16px; line-height: 1.8;">
                    "You have to dream before your dreams can come true.<br>
                    All of us do not have equal talent. But, all of us have<br>
                    an equal opportunity to develop our talents."
                </p>
                <p style="margin: 15px 0 0 0; color: #7c3aed; font-weight: bold;">— Dr. APJ Abdul Kalam</p>
            </div>
            
            <!-- Congratulations Message -->
            <div style="background: #ecfdf5; border-radius: 12px; padding: 20px; margin: 20px 0; text-align: center;">
                <p style="margin: 0; color: #065f46; font-size: 16px; line-height: 1.6;">
                    🌟 <strong>You dreamed, you worked hard, and now your dream has come true!</strong><br><br>
                    This placement is a testament to your dedication, perseverance, and the talent you have nurtured. 
                    This is just the beginning of your incredible journey ahead. <strong>Keep reaching for the stars!</strong>
                </p>
            </div>
            
            <!-- CTA Button -->
            <div style="text-align: center; margin: 30px 0;">
                <a href="https://gnitc-sb-placements.vercel.app/login" 
                   style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: white; padding: 14px 35px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; box-shadow: 0 4px 6px rgba(79, 70, 229, 0.3);">
                   🔐 Login to View Your Profile
                </a>
            </div>
            
            <p style="color: #64748b; font-size: 14px; margin-top: 25px;">
                Thank you for your patience and cooperation in maintaining accurate records.
            </p>
            
            <p style="color: #475569; margin-top: 20px;">
                Best Regards,<br>
                <strong>GNITC Special Batch Team</strong>
            </p>
        </div>
        
        <!-- Footer -->
        <div style="background: #f1f5f9; padding: 15px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                GNITC Special Batch Placement Portal | © 2025
            </p>
        </div>
    </div>`;
}

// ==================== MAIN ====================
async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('       APOLOGY EMAIL SENDER - GNITC Special Batch');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (No emails will be sent)' : '📨 SENDING EMAILS'}`);
    console.log('');

    try {
        // Connect to MongoDB
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB!\n');

        // Collect all verified students (unique by student ID)
        const verifiedStudentsMap = new Map();

        // 1. Get verified students from Student collection
        const verifiedStudents = await Student.find({ 
            verificationStatus: 'verified',
            photo: { $ne: '' } // Only students with photos (active accounts)
        });
        
        for (const s of verifiedStudents) {
            if (!verifiedStudentsMap.has(s.id.toLowerCase())) {
                verifiedStudentsMap.set(s.id.toLowerCase(), {
                    studentId: s.id,
                    name: s.name,
                    company: s.company,
                    salary: s.salary
                });
            }
        }
        console.log(`📊 Found ${verifiedStudents.length} verified students in Student collection`);

        // 2. Get verified placements from Placement collection
        const verifiedPlacements = await Placement.find({ verificationStatus: 'verified' });
        
        for (const p of verifiedPlacements) {
            const key = p.studentId.toLowerCase();
            if (!verifiedStudentsMap.has(key)) {
                verifiedStudentsMap.set(key, {
                    studentId: p.studentId,
                    name: p.name,
                    company: p.company,
                    salary: p.salary
                });
            } else {
                // If student already exists, maybe add this as additional placement info
                // For simplicity, we'll just use the first one found
            }
        }
        console.log(`📊 Found ${verifiedPlacements.length} verified placements in Placement collection`);

        const allRecipients = Array.from(verifiedStudentsMap.values());
        console.log(`\n📧 Total unique recipients: ${allRecipients.length}\n`);

        if (allRecipients.length === 0) {
            console.log('⚠️  No verified students found. Nothing to send.');
            await mongoose.disconnect();
            return;
        }

        // Preview recipients
        console.log('┌────────────────────────────────────────────────────────────────┐');
        console.log('│                     RECIPIENT LIST                              │');
        console.log('├──────────────┬────────────────────┬─────────────────────────────┤');
        console.log('│ Student ID   │ Name               │ Company                     │');
        console.log('├──────────────┼────────────────────┼─────────────────────────────┤');
        
        for (const r of allRecipients) {
            const id = (r.studentId || '').padEnd(12).slice(0, 12);
            const name = (r.name || 'Unknown').padEnd(18).slice(0, 18);
            const company = (r.company || 'N/A').padEnd(27).slice(0, 27);
            console.log(`│ ${id} │ ${name} │ ${company} │`);
        }
        console.log('└──────────────┴────────────────────┴─────────────────────────────┘\n');

        if (DRY_RUN) {
            console.log('═══════════════════════════════════════════════════════════════');
            console.log('  🔍 DRY RUN COMPLETE - No emails were sent');
            console.log('  Run without --dry-run flag to send emails');
            console.log('═══════════════════════════════════════════════════════════════');
            await mongoose.disconnect();
            return;
        }

        // Send emails
        console.log('📨 Starting email sending...\n');
        
        let successCount = 0;
        let failCount = 0;

        for (const recipient of allRecipients) {
            const emailTo = `${recipient.studentId.toLowerCase()}@gniindia.org`;
            const subject = '🙏 Apology & ✅ Your Official Verification Confirmation - GNITC Special Batch';
            const html = generateApologyEmail(recipient.name, recipient.company, recipient.salary);

            const success = await sendEmail(emailTo, subject, html);
            
            if (success) {
                successCount++;
            } else {
                failCount++;
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('                      📊 SUMMARY                               ');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`  ✅ Successfully sent: ${successCount}`);
        console.log(`  ❌ Failed: ${failCount}`);
        console.log(`  📧 Total: ${allRecipients.length}`);
        console.log('═══════════════════════════════════════════════════════════════');

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from MongoDB');
    }
}

// Run
main();
