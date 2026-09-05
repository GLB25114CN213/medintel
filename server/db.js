import path from "path";
import fs from "fs";

let db = null;

try {
  const sqlite3Module = await import("sqlite3");
  const sqlite3 = sqlite3Module.default || sqlite3Module;
  const dbPath = process.env.VERCEL ? ":memory:" : path.resolve("medintel.db");
  const sqlite = sqlite3.verbose();
  db = new sqlite.Database(dbPath, (err) => {
    if (err) {
      console.error("⚠️ SQLite Notice:", err.message);
    } else {
      console.log("✅ SQLite Database connected at:", dbPath);
    }
  });

  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cognito_sub TEXT UNIQUE,
        email TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS analyses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        filename TEXT,
        analysis_data TEXT NOT NULL,
        health_score INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // ── HDIMS EXTENSION TABLES ───────────────────────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS patients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE,
        cognito_sub TEXT UNIQUE,
        patient_id TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        abha_id TEXT,
        blood_group TEXT,
        emergency_contact TEXT,
        address TEXT,
        allergies TEXT,
        known_conditions TEXT,
        medications TEXT,
        dob TEXT,
        gender TEXT,
        aadhaar_verified INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS doctors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE,
        doctor_id TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
        specialty TEXT NOT NULL,
        hospital_name TEXT NOT NULL,
        license_number TEXT,
        email TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS hospitals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        city TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS visits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id TEXT NOT NULL,
        doctor_id TEXT NOT NULL,
        doctor_name TEXT NOT NULL,
        hospital_name TEXT NOT NULL,
        visit_date TEXT NOT NULL,
        chief_complaint TEXT,
        bp TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS referrals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id TEXT NOT NULL,
        referring_doctor TEXT NOT NULL,
        specialist_type TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT DEFAULT 'REFERRED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS follow_ups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id TEXT NOT NULL,
        doctor_name TEXT NOT NULL,
        condition TEXT NOT NULL,
        recommended_date TEXT NOT NULL,
        status TEXT DEFAULT 'DUE',
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS qr_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT UNIQUE NOT NULL,
        patient_id TEXT NOT NULL,
        patient_name TEXT NOT NULL,
        duration_minutes INTEGER DEFAULT 10,
        expires_at DATETIME NOT NULL,
        status TEXT DEFAULT 'PENDING',
        requested_by_doctor TEXT,
        requested_by_hospital TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS access_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id TEXT NOT NULL,
        doctor_name TEXT NOT NULL,
        hospital_name TEXT NOT NULL,
        purpose TEXT NOT NULL,
        accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        duration_minutes INTEGER DEFAULT 10,
        status TEXT DEFAULT 'ACTIVE'
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS health_timeline (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id TEXT NOT NULL,
        event_date TEXT NOT NULL,
        event_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    seedHDIMSData(db);
  });
} catch (e) {
  console.error("⚠️ SQLite Module Load Notice:", e.message);
}

function seedHDIMSData(database) {
  database.get("SELECT COUNT(*) as count FROM patients", [], (err, row) => {
    if (err || (row && row.count > 0)) return;

    console.log("🌱 Auto-seeding HDIMS Demo Patients, Doctors, Hospitals, Reports & Timeline...");

    // Seed Hospitals
    database.run("INSERT INTO hospitals (id, name, city) VALUES (1, 'City General Hospital', 'New Delhi')");
    database.run("INSERT INTO hospitals (id, name, city) VALUES (2, 'Apex Medical Institute', 'Mumbai')");

    // Seed Doctors
    database.run("INSERT INTO doctors (id, doctor_id, full_name, specialty, hospital_name, license_number, email) VALUES (1, 'MI-DOC-8801', 'Dr. Ankit Sharma', 'Cardiologist', 'City General Hospital', 'MCI-8801-DL', 'ankit.sharma@cityhospital.org')");
    database.run("INSERT INTO doctors (id, doctor_id, full_name, specialty, hospital_name, license_number, email) VALUES (2, 'MI-DOC-8802', 'Dr. Priya Mehta', 'Endocrinologist', 'Apex Medical Institute', 'MCI-8802-MH', 'priya.mehta@apexminstitute.org')");
    database.run("INSERT INTO doctors (id, doctor_id, full_name, specialty, hospital_name, license_number, email) VALUES (3, 'MI-DOC-8803', 'Dr. Rajesh Verma', 'General Physician', 'City General Hospital', 'MCI-8803-DL', 'rajesh.verma@cityhospital.org')");

    // Seed Patients
    database.run("INSERT INTO patients (id, patient_id, full_name, email, phone, abha_id, blood_group, emergency_contact, address, allergies, known_conditions, medications, dob, gender, aadhaar_verified) VALUES (1, 'MI-PAT-100245', 'Aarav Patel', 'aarav.patel@example.com', '+91 98765 43210', '91-4820-1129-8402', 'O+', '+91 98765 43210', 'Greater Noida, Uttar Pradesh', 'Penicillin, Dust Mites', 'Stage 1 Hypertension, Borderline Hyperlipidemia', 'Amlodipine 5mg (Daily)', '1990-05-14', 'Male', 1)");
    database.run("INSERT INTO patients (id, patient_id, full_name, email, phone, abha_id, blood_group, emergency_contact, address, allergies, known_conditions, medications, dob, gender, aadhaar_verified) VALUES (2, 'MI-PAT-100246', 'Sunita Rao', 'sunita.rao@example.com', '+91 98123 45678', '91-8840-2219-9031', 'B+', '+91 98123 45678', 'Mumbai, Maharashtra', 'Sulfa Drugs', 'Type 2 Diabetes', 'Metformin 500mg', '1985-11-22', 'Female', 1)");
    database.run("INSERT INTO patients (id, patient_id, full_name, email, phone, abha_id, blood_group, emergency_contact, address, allergies, known_conditions, medications, dob, gender, aadhaar_verified) VALUES (3, 'MI-PAT-100247', 'Rohan Verma', 'rohan.verma@example.com', '+91 97654 32109', '91-1029-4482-3301', 'A+', '+91 97654 32109', 'Bengaluru, Karnataka', 'Peanuts', 'Asthma', 'Inhaler PRN', '1995-03-08', 'Male', 1)");
    database.run("INSERT INTO patients (id, patient_id, full_name, email, phone, abha_id, blood_group, emergency_contact, address, allergies, known_conditions, medications, dob, gender, aadhaar_verified) VALUES (4, 'MI-PAT-100248', 'Kavita Singh', 'kavita.singh@example.com', '+91 96543 21098', '91-7730-1092-4412', 'AB+', '+91 96543 21098', 'New Delhi', 'None', 'None', 'None', '1992-08-30', 'Female', 0)");
    database.run("INSERT INTO patients (id, patient_id, full_name, email, phone, abha_id, blood_group, emergency_contact, address, allergies, known_conditions, medications, dob, gender, aadhaar_verified) VALUES (5, 'MI-PAT-100249', 'Vikram Malhotra', 'vikram.m@example.com', '+91 95432 10987', '91-3320-9981-1204', 'O-', '+91 95432 10987', 'Hyderabad, Telangana', 'Latex', 'Migraine', 'Sumatriptan 50mg', '1978-12-19', 'Male', 1)");

    // Seed Visits
    database.run("INSERT INTO visits (patient_id, doctor_id, doctor_name, hospital_name, visit_date, chief_complaint, bp, notes) VALUES ('MI-PAT-100245', 'MI-DOC-8803', 'Dr. Rajesh Verma', 'City General Hospital', '2026-08-12', 'Routine Health Checkup & Mild Fatigue', '135/88 mmHg', 'Patient reports occasional fatigue. Ordered CBC, Lipid Panel & Blood Glucose.')");
    database.run("INSERT INTO visits (patient_id, doctor_id, doctor_name, hospital_name, visit_date, chief_complaint, bp, notes) VALUES ('MI-PAT-100245', 'MI-DOC-8801', 'Dr. Ankit Sharma', 'City General Hospital', '2026-08-18', 'Cardiovascular Evaluation for Elevated BP', '142/90 mmHg', 'Mild Stage 1 Hypertension noted. Started Low-Sodium Diet & Lifestyle Plan.')");

    // Seed Referrals
    database.run("INSERT INTO referrals (patient_id, referring_doctor, specialist_type, reason, status) VALUES ('MI-PAT-100245', 'Dr. Rajesh Verma', 'Cardiologist', 'Elevated blood pressure and borderline lipid panel', 'APPOINTMENT BOOKED')");
    database.run("INSERT INTO referrals (patient_id, referring_doctor, specialist_type, reason, status) VALUES ('MI-PAT-100245', 'Dr. Ankit Sharma', 'Endocrinologist', 'Evaluate HbA1c 6.2% borderline glycemia', 'REFERRED')");

    // Seed Follow-ups
    database.run("INSERT INTO follow_ups (patient_id, doctor_name, condition, recommended_date, status, notes) VALUES ('MI-PAT-100245', 'Dr. Ankit Sharma', 'Repeat Lipid Panel & BP Check', '2026-09-15', 'DUE', 'Follow-up blood pressure check and fasting lipid profile.')");
    database.run("INSERT INTO follow_ups (patient_id, doctor_name, condition, recommended_date, status, notes) VALUES ('MI-PAT-100245', 'Dr. Priya Mehta', 'Fasting Blood Sugar & HbA1c Monitoring', '2026-10-01', 'UPCOMING', 'Quarterly diabetic risk screening.')");

    // Seed Access Logs
    database.run("INSERT INTO access_logs (patient_id, doctor_name, hospital_name, purpose, accessed_at, duration_minutes, status) VALUES ('MI-PAT-100245', 'Dr. Ankit Sharma', 'City General Hospital', 'Cardiology Consultation', '2026-08-18 14:30:00', 15, 'EXPIRED')");
    database.run("INSERT INTO access_logs (patient_id, doctor_name, hospital_name, purpose, accessed_at, duration_minutes, status) VALUES ('MI-PAT-100245', 'Dr. Rajesh Verma', 'City General Hospital', 'General Health Assessment', '2026-08-12 10:15:00', 30, 'EXPIRED')");

    // Seed Timeline Events
    database.run("INSERT INTO health_timeline (patient_id, event_date, event_type, title, description, status) VALUES ('MI-PAT-100245', '12 Aug 2026', 'Doctor Visit', 'General Physician Consultation', 'BP 135/88 mmHg. Advised comprehensive blood investigations.', 'COMPLETED')");
    database.run("INSERT INTO health_timeline (patient_id, event_date, event_type, title, description, status) VALUES ('MI-PAT-100245', '15 Aug 2026', 'Blood Report', 'Lipid Profile & Glucose Panel', 'Total Cholesterol 228 mg/dL (HIGH), HbA1c 6.2% (BORDERLINE)', 'ABNORMAL')");
    database.run("INSERT INTO health_timeline (patient_id, event_date, event_type, title, description, status) VALUES ('MI-PAT-100245', '18 Aug 2026', 'Doctor Visit', 'Cardiology Specialist Consultation', 'Stage 1 Hypertension evaluation with Dr. Ankit Sharma.', 'COMPLETED')");
    database.run("INSERT INTO health_timeline (patient_id, event_date, event_type, title, description, status) VALUES ('MI-PAT-100245', '20 Aug 2026', 'Medication', 'Lifestyle & Dietary Plan Prescribed', 'Low-sodium Mediterranean diet, 30 min daily cardio exercise.', 'ACTIVE')");
    database.run("INSERT INTO health_timeline (patient_id, event_date, event_type, title, description, status) VALUES ('MI-PAT-100245', '25 Aug 2026', 'Referral', 'Endocrinology Referral Created', 'Referred to Dr. Priya Mehta for metabolic screening.', 'REFERRED')");
    database.run("INSERT INTO health_timeline (patient_id, event_date, event_type, title, description, status) VALUES ('MI-PAT-100245', '15 Sep 2026', 'Follow-up Alert', 'Repeat Lipid Panel & BP Follow-up Due', 'No follow-up is recorded in available MedIntel data.', 'DUE')");

    console.log("✅ HDIMS Seed Data Initialized Successfully.");
  });
}

export const runQuery = (sql, params = []) => {
  return new Promise((resolve) => {
    if (!db) return resolve({ id: 1, changes: 1 });
    db.run(sql, params, function (err) {
      if (err) resolve({ id: 1, changes: 0 });
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

export const getQuery = (sql, params = []) => {
  return new Promise((resolve) => {
    if (!db) return resolve(null);
    db.get(sql, params, (err, row) => {
      if (err) resolve(null);
      else resolve(row);
    });
  });
};

export const allQuery = (sql, params = []) => {
  return new Promise((resolve) => {
    if (!db) return resolve([]);
    db.all(sql, params, (err, rows) => {
      if (err) resolve([]);
      else resolve(rows);
    });
  });
};

export default db;
