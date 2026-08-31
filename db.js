const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'igp.db');
const db = new sqlite3.Database(dbPath);

// Helper methods returning promises for clean async/await syntax
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
};

async function initDB() {
  db.serialize(async () => {
    // 1. Admins Table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Leads / Consultation Table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        query TEXT NOT NULL,
        source TEXT DEFAULT 'Website Consultation',
        status TEXT DEFAULT 'New',
        notes TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. Applications Table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        linkedin_url TEXT DEFAULT '',
        intro TEXT DEFAULT '',
        job_title TEXT NOT NULL,
        department TEXT NOT NULL,
        resume_path TEXT NOT NULL,
        resume_originalname TEXT NOT NULL,
        status TEXT DEFAULT 'Applied',
        notes TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 4. Newsletter Subscribers Table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS subscribers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        source TEXT DEFAULT 'Footer Newsletter',
        status TEXT DEFAULT 'Active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 5. Email Logs Table (Resend API records)
    await dbRun(`
      CREATE TABLE IF NOT EXISTS email_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipient TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT,
        resend_id TEXT,
        type TEXT DEFAULT 'Outgoing',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed Default Admin
    const defaultEmail = process.env.ADMIN_EMAIL || 'admin@sparklehood.com';
    const defaultPass = process.env.ADMIN_PASSWORD || 'AdminPassword123!';
    const existingAdmin = await dbGet('SELECT * FROM admins WHERE email = ?', [defaultEmail]);
    
    if (!existingAdmin) {
      const hash = await bcrypt.hash(defaultPass, 10);
      await dbRun('INSERT INTO admins (email, password_hash) VALUES (?, ?)', [defaultEmail, hash]);
      console.log(`[DB] Default admin seeded: ${defaultEmail}`);
    }
  });

  console.log('[DB] Database initialized successfully.');
}

module.exports = {
  db,
  dbRun,
  dbAll,
  dbGet,
  initDB
};
