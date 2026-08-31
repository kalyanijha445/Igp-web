require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Resend } = require('resend');
const { initDB, dbRun, dbAll, dbGet } = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'igp_sparklehood_secure_jwt_secret_2026_x89!';

// Initialize Resend API
const resendApiKey = process.env.RESEND_API_KEY || '';
const resend = new Resend(resendApiKey);
const RESEND_FROM = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
const ADMIN_NOTIFICATION_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || 'team@sparklehood.com';

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'resume-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only .pdf, .doc, and .docx files are allowed!'));
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files and uploads
app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadsDir));

// Initialize Database
initDB();

// Helper: Resend Email Sender
async function sendResendEmail({ to, subject, html, type = 'Outgoing' }) {
  try {
    const response = await resend.emails.send({
      from: `IGP India <${RESEND_FROM}>`,
      to,
      subject,
      html
    });

    const resendId = response && response.id ? response.id : 'sent-' + Date.now();

    // Log to DB
    await dbRun(
      'INSERT INTO email_logs (recipient, subject, body, resend_id, type) VALUES (?, ?, ?, ?, ?)',
      [Array.isArray(to) ? to.join(', ') : to, subject, html, resendId, type]
    );

    console.log(`[Resend API] Email sent to ${to} (ID: ${resendId})`);
    return { success: true, id: resendId };
  } catch (error) {
    console.error(`[Resend API Error] Failed to send email to ${to}:`, error.message);
    
    // Log failure
    await dbRun(
      'INSERT INTO email_logs (recipient, subject, body, resend_id, type) VALUES (?, ?, ?, ?, ?)',
      [Array.isArray(to) ? to.join(', ') : to, subject, html, 'FAILED: ' + error.message, type + ' (Failed)']
    );

    return { success: false, error: error.message };
  }
}

// Authentication Middleware
function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. Token missing.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

/* ==========================================================================
   PUBLIC API ENDPOINTS
   ========================================================================== */

// 1. Submit Consultation / Lead Form
app.post('/api/leads', async (req, res) => {
  try {
    const { name, email, phone, query } = req.body;
    if (!name || !email || !phone || !query) {
      return res.status(400).json({ error: 'All fields (Name, Email, Phone, Query) are required.' });
    }

    const result = await dbRun(
      'INSERT INTO leads (name, email, phone, query, source) VALUES (?, ?, ?, ?, ?)',
      [name, email, phone, query, 'Website Consultation']
    );

    // 1. Send Thank You email to Lead via Resend
    const leadEmailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #f8fafc; padding: 30px; borderRadius: 12px;">
        <h2 style="color: #00d2ff; margin-bottom: 8px;">India Growth Partner (IGP)</h2>
        <p style="color: #94a3b8; font-size: 14px;">EV Infrastructure & Engineering Solutions</p>
        <hr style="border-color: #334155; margin: 20px 0;" />
        <h3 style="color: #ffffff;">Hello ${name},</h3>
        <p style="line-height: 1.6;">Thank you for reaching out to IGP by Sparklehood. We have received your consultation query and our EV experts will contact you within 24 hours.</p>
        <div style="background: #1e293b; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <strong style="color: #00d2ff;">Your Request Summary:</strong>
          <p style="margin: 8px 0 0 0; color: #cbd5e1;">${query}</p>
        </div>
        <p style="color: #94a3b8; font-size: 13px;">Best regards,<br><strong>Team IGP India</strong><br><a href="https://sparklehood.com" style="color: #00d2ff;">www.sparklehood.com</a></p>
      </div>
    `;
    sendResendEmail({ to: email, subject: 'Consultation Request Received - IGP India', html: leadEmailHtml, type: 'Lead Confirmation' });

    // 2. Send Alert Notification to Admin Team
    const adminEmailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #1144e3;">🚀 New Consultation Lead Received!</h2>
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
          <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Name:</td><td style="padding: 8px; border: 1px solid #ddd;">${name}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Email:</td><td style="padding: 8px; border: 1px solid #ddd;">${email}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Phone:</td><td style="padding: 8px; border: 1px solid #ddd;">${phone}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Query:</td><td style="padding: 8px; border: 1px solid #ddd;">${query}</td></tr>
        </table>
        <p style="margin-top: 20px;"><a href="http://localhost:${PORT}/admin.html" style="background: #1144e3; color: #fff; padding: 10px 18px; text-decoration: none; border-radius: 6px;">Open CRM Admin Dashboard</a></p>
      </div>
    `;
    sendResendEmail({ to: ADMIN_NOTIFICATION_EMAIL, subject: `[NEW LEAD] ${name} - ${phone}`, html: adminEmailHtml, type: 'Admin Lead Alert' });

    res.status(201).json({
      success: true,
      message: 'Consultation request submitted successfully! Our team will contact you shortly.',
      leadId: result.id
    });
  } catch (error) {
    console.error('[API Error /api/leads]:', error);
    res.status(500).json({ error: 'Server error processing lead submission.' });
  }
});

// 2. Submit Job Application (with Resume File)
app.post('/api/applications', upload.single('resume'), async (req, res) => {
  try {
    const { full_name, email, phone, linkedin_url, intro, job_title, department } = req.body;
    const file = req.file;

    if (!full_name || !email || !phone || !job_title || !department) {
      return res.status(400).json({ error: 'Required fields missing (Full Name, Email, Phone, Job Title, Department).' });
    }

    if (!file) {
      return res.status(400).json({ error: 'Resume file is required.' });
    }

    const result = await dbRun(
      `INSERT INTO applications 
       (full_name, email, phone, linkedin_url, intro, job_title, department, resume_path, resume_originalname) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        full_name,
        email,
        phone,
        linkedin_url || '',
        intro || '',
        job_title,
        department,
        file.filename,
        file.originalname
      ]
    );

    // Send confirmation email to applicant via Resend
    const candidateEmailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #f8fafc; padding: 30px; borderRadius: 12px;">
        <h2 style="color: #00d2ff;">India Growth Partner (IGP) Careers</h2>
        <p style="color: #94a3b8;">Application Received for: <strong>${job_title}</strong> (${department})</p>
        <hr style="border-color: #334155; margin: 20px 0;" />
        <p>Dear ${full_name},</p>
        <p>Thank you for applying for the position of <strong>${job_title}</strong> at IGP by Sparklehood.</p>
        <p>Our talent acquisition team is currently reviewing your resume and profile. If your qualifications match our active requirements, we will reach out to schedule an interview.</p>
        <p style="color: #94a3b8; font-size: 13px; margin-top: 25px;">Best regards,<br><strong>Talent Team | IGP India</strong></p>
      </div>
    `;
    sendResendEmail({ to: email, subject: `Application Received: ${job_title} - IGP India`, html: candidateEmailHtml, type: 'Application Confirmation' });

    res.status(201).json({
      success: true,
      message: 'Application submitted successfully!',
      applicationId: result.id
    });
  } catch (error) {
    console.error('[API Error /api/applications]:', error);
    res.status(500).json({ error: error.message || 'Server error processing application.' });
  }
});

// 3. Newsletter Subscription
app.post('/api/subscribe', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    try {
      await dbRun('INSERT INTO subscribers (email) VALUES (?)', [email]);
    } catch (e) {
      // Ignore unique constraint if already subscribed
    }

    // Welcome email via Resend
    const welcomeHtml = `
      <div style="font-family: Arial, sans-serif; padding: 25px; background: #0f172a; color: #fff; border-radius: 8px;">
        <h2 style="color: #00d2ff;">Welcome to IGP Insights!</h2>
        <p>You have successfully subscribed to India Growth Partner newsletter. You will receive updates on EV charging technology, fleet operations, and engineering developments across India.</p>
      </div>
    `;
    sendResendEmail({ to: email, subject: 'Welcome to IGP India Insights', html: welcomeHtml, type: 'Newsletter Welcome' });

    res.json({ success: true, message: 'Subscribed successfully!' });
  } catch (error) {
    console.error('[API Error /api/subscribe]:', error);
    res.status(500).json({ error: 'Server error processing subscription.' });
  }
});

/* ==========================================================================
   ADMIN AUTHENTICATION ENDPOINTS
   ========================================================================== */

// Admin Login
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const admin = await dbGet('SELECT * FROM admins WHERE email = ?', [email]);
    if (!admin) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isValidPass = await bcrypt.compare(password, admin.password_hash);
    if (!isValidPass) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: admin.id, email: admin.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      admin: { id: admin.id, email: admin.email }
    });
  } catch (error) {
    console.error('[API Error /api/admin/login]:', error);
    res.status(500).json({ error: 'Server error during authentication.' });
  }
});

// Verify Current Admin
app.get('/api/admin/me', authenticateAdmin, async (req, res) => {
  res.json({ success: true, admin: req.admin });
});

// Change Password
app.post('/api/admin/change-password', authenticateAdmin, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Old password and new password are required.' });
    }

    const admin = await dbGet('SELECT * FROM admins WHERE id = ?', [req.admin.id]);
    const isValid = await bcrypt.compare(oldPassword, admin.password_hash);
    if (!isValid) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await dbRun('UPDATE admins SET password_hash = ? WHERE id = ?', [newHash, req.admin.id]);

    res.json({ success: true, message: 'Password updated successfully!' });
  } catch (error) {
    res.status(500).json({ error: 'Server error updating password.' });
  }
});

/* ==========================================================================
   CRM ADMIN PROTECTED ENDPOINTS
   ========================================================================== */

// 1. Dashboard Overview Stats
app.get('/api/admin/stats', authenticateAdmin, async (req, res) => {
  try {
    const totalLeads = await dbGet('SELECT COUNT(*) as count FROM leads');
    const newLeads = await dbGet("SELECT COUNT(*) as count FROM leads WHERE status = 'New'");
    const totalApplications = await dbGet('SELECT COUNT(*) as count FROM applications');
    const totalSubscribers = await dbGet('SELECT COUNT(*) as count FROM subscribers');
    const totalEmails = await dbGet('SELECT COUNT(*) as count FROM email_logs');

    const recentLeads = await dbAll('SELECT * FROM leads ORDER BY created_at DESC LIMIT 5');
    const recentApplications = await dbAll('SELECT * FROM applications ORDER BY created_at DESC LIMIT 5');

    res.json({
      success: true,
      stats: {
        totalLeads: totalLeads.count,
        newLeads: newLeads.count,
        totalApplications: totalApplications.count,
        totalSubscribers: totalSubscribers.count,
        totalEmailsSent: totalEmails.count
      },
      recentLeads,
      recentApplications
    });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching stats.' });
  }
});

// 2. Leads CRM Endpoints
app.get('/api/admin/leads', authenticateAdmin, async (req, res) => {
  try {
    const { status, search } = req.query;
    let sql = 'SELECT * FROM leads WHERE 1=1';
    const params = [];

    if (status && status !== 'All') {
      sql += ' AND status = ?';
      params.push(status);
    }

    if (search) {
      sql += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ? OR query LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    sql += ' ORDER BY created_at DESC';
    const leads = await dbAll(sql, params);
    res.json({ success: true, leads });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching leads.' });
  }
});

app.patch('/api/admin/leads/:id', authenticateAdmin, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const { id } = req.params;

    const existing = await dbGet('SELECT * FROM leads WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Lead not found.' });

    const newStatus = status !== undefined ? status : existing.status;
    const newNotes = notes !== undefined ? notes : existing.notes;

    await dbRun('UPDATE leads SET status = ?, notes = ? WHERE id = ?', [newStatus, newNotes, id]);
    res.json({ success: true, message: 'Lead updated successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Error updating lead.' });
  }
});

app.delete('/api/admin/leads/:id', authenticateAdmin, async (req, res) => {
  try {
    await dbRun('DELETE FROM leads WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Lead deleted.' });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting lead.' });
  }
});

// 3. Applications CRM Endpoints
app.get('/api/admin/applications', authenticateAdmin, async (req, res) => {
  try {
    const { status, search } = req.query;
    let sql = 'SELECT * FROM applications WHERE 1=1';
    const params = [];

    if (status && status !== 'All') {
      sql += ' AND status = ?';
      params.push(status);
    }

    if (search) {
      sql += ' AND (full_name LIKE ? OR email LIKE ? OR phone LIKE ? OR job_title LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    sql += ' ORDER BY created_at DESC';
    const applications = await dbAll(sql, params);
    res.json({ success: true, applications });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching applications.' });
  }
});

app.patch('/api/admin/applications/:id', authenticateAdmin, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const { id } = req.params;

    const existing = await dbGet('SELECT * FROM applications WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Application not found.' });

    const newStatus = status !== undefined ? status : existing.status;
    const newNotes = notes !== undefined ? notes : existing.notes;

    await dbRun('UPDATE applications SET status = ?, notes = ? WHERE id = ?', [newStatus, newNotes, id]);
    res.json({ success: true, message: 'Application updated.' });
  } catch (error) {
    res.status(500).json({ error: 'Error updating application.' });
  }
});

app.delete('/api/admin/applications/:id', authenticateAdmin, async (req, res) => {
  try {
    const appRecord = await dbGet('SELECT resume_path FROM applications WHERE id = ?', [req.params.id]);
    if (appRecord && appRecord.resume_path) {
      const filePath = path.join(uploadsDir, appRecord.resume_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    await dbRun('DELETE FROM applications WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Application deleted.' });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting application.' });
  }
});

// 4. Newsletter Subscribers Endpoints
app.get('/api/admin/subscribers', authenticateAdmin, async (req, res) => {
  try {
    const subscribers = await dbAll('SELECT * FROM subscribers ORDER BY created_at DESC');
    res.json({ success: true, subscribers });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching subscribers.' });
  }
});

app.delete('/api/admin/subscribers/:id', authenticateAdmin, async (req, res) => {
  try {
    await dbRun('DELETE FROM subscribers WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Subscriber removed.' });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting subscriber.' });
  }
});

// 5. Resend Email Dispatcher & Logs Endpoint
app.get('/api/admin/email-logs', authenticateAdmin, async (req, res) => {
  try {
    const logs = await dbAll('SELECT * FROM email_logs ORDER BY created_at DESC LIMIT 100');
    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching email logs.' });
  }
});

app.post('/api/admin/send-email', authenticateAdmin, async (req, res) => {
  try {
    const { to, subject, html } = req.body;
    if (!to || !subject || !html) {
      return res.status(400).json({ error: 'Recipient email (to), subject, and message content (html) are required.' });
    }

    const result = await sendResendEmail({ to, subject, html, type: 'Manual CRM Dispatch' });
    if (result.success) {
      res.json({ success: true, message: 'Email sent successfully via Resend API!', id: result.id });
    } else {
      res.status(500).json({ error: `Resend error: ${result.error}` });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error sending email.' });
  }
});

// Fallback Route - Serve admin.html or index.html
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  🚀 IGP Website Backend & CRM Admin Running!`);
  console.log(`  - Local URL: http://localhost:${PORT}`);
  console.log(`  - Admin CRM Portal: http://localhost:${PORT}/admin.html`);
  console.log(`  - Mail Service: Resend API Enabled`);
  console.log(`====================================================`);
});
