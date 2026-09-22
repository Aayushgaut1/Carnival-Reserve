// server/db.js - Database Layer for Carnival Reserve
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'packages', 'database', 'carnival_reserve.db');
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let dbInstance = null;

function getDb() {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(DB_PATH);
    initSchema(dbInstance);
  }
  return dbInstance;
}

function initSchema(db) {
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  // Migration: Ensure new columns exist on existing SQLite tables
  const tableCols = (tbl) => {
    try {
      return db.prepare(`PRAGMA table_info(${tbl})`).all().map(c => c.name);
    } catch {
      return [];
    }
  };

  const txCols = tableCols('transactions');
  if (txCols.length > 0) {
    if (!txCols.includes('domain_name')) db.exec('ALTER TABLE transactions ADD COLUMN domain_name TEXT;');
    if (!txCols.includes('participant_balance_before')) db.exec('ALTER TABLE transactions ADD COLUMN participant_balance_before INTEGER;');
    if (!txCols.includes('participant_balance_after')) db.exec('ALTER TABLE transactions ADD COLUMN participant_balance_after INTEGER;');
    if (!txCols.includes('domain_budget_before')) db.exec('ALTER TABLE transactions ADD COLUMN domain_budget_before INTEGER;');
    if (!txCols.includes('domain_budget_after')) db.exec('ALTER TABLE transactions ADD COLUMN domain_budget_after INTEGER;');
    if (!txCols.includes('status')) db.exec("ALTER TABLE transactions ADD COLUMN status TEXT DEFAULT 'SUCCESS';");
  }

  try {
    const ptFk = db.prepare("PRAGMA foreign_key_list(point_transactions)").all();
    if (ptFk.length > 0) {
      db.exec('DROP TABLE point_transactions;');
    }
  } catch (e) {}

  const userCols = tableCols('users');
  if (userCols.length > 0) {
    if (!userCols.includes('assigned_domain')) db.exec('ALTER TABLE users ADD COLUMN assigned_domain TEXT;');
    if (!userCols.includes('assigned_domain_id')) db.exec('ALTER TABLE users ADD COLUMN assigned_domain_id TEXT;');
    if (!userCols.includes('phone')) db.exec('ALTER TABLE users ADD COLUMN phone TEXT;');
    if (!userCols.includes('college')) db.exec('ALTER TABLE users ADD COLUMN college TEXT;');
    if (!userCols.includes('registration_no')) db.exec('ALTER TABLE users ADD COLUMN registration_no TEXT;');
    if (!userCols.includes('password_hash')) db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT;');
    if (!userCols.includes('created_at')) db.exec('ALTER TABLE users ADD COLUMN created_at TEXT;');
    if (!userCols.includes('updated_at')) db.exec('ALTER TABLE users ADD COLUMN updated_at TEXT;');
  }

  const partCols = tableCols('participants');
  if (partCols.length > 0) {
    if (!partCols.includes('password_hash')) db.exec('ALTER TABLE participants ADD COLUMN password_hash TEXT;');
  }

  // Participants Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      participant_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      college TEXT NOT NULL,
      reg_no TEXT UNIQUE NOT NULL,
      qr_code TEXT UNIQUE,
      password_hash TEXT,
      status TEXT DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_participant_email ON participants(email);
    CREATE INDEX IF NOT EXISTS idx_participant_phone ON participants(phone);
    CREATE INDEX IF NOT EXISTS idx_participant_reg_no ON participants(reg_no);
    CREATE INDEX IF NOT EXISTS idx_participant_pid ON participants(participant_id);
  `);

  // Domain Registrations Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS domain_registrations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      domain_id TEXT NOT NULL,
      domain_name TEXT NOT NULL,
      team_name TEXT,
      team_members TEXT,
      status TEXT DEFAULT 'CONFIRMED',
      registered_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES participants(id) ON DELETE CASCADE,
      UNIQUE(user_id, domain_id)
    );
    CREATE INDEX IF NOT EXISTS idx_reg_user ON domain_registrations(user_id);
    CREATE INDEX IF NOT EXISTS idx_reg_domain ON domain_registrations(domain_id);
  `);

  // OTP Records Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS otp_records (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      otp_hash TEXT NOT NULL,
      attempts INTEGER DEFAULT 0,
      expires_at TEXT NOT NULL,
      resend_cooldown_until TEXT,
      verified INTEGER DEFAULT 0,
      participant_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_otp_identifier ON otp_records(identifier);
  `);

  // Wallets Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallets (
      id TEXT PRIMARY KEY,
      participant_id TEXT UNIQUE NOT NULL,
      balance INTEGER DEFAULT 0,
      total_earned INTEGER DEFAULT 0,
      total_spent INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
    );
  `);

  // Passports & Stamps Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS passports (
      id TEXT PRIMARY KEY,
      participant_id TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS passport_stamps (
      id TEXT PRIMARY KEY,
      passport_id TEXT NOT NULL,
      domain_name TEXT NOT NULL,
      claimed_at TEXT NOT NULL,
      is_winner INTEGER DEFAULT 0,
      FOREIGN KEY (passport_id) REFERENCES passports(id) ON DELETE CASCADE,
      UNIQUE(passport_id, domain_name)
    );
    CREATE INDEX IF NOT EXISTS idx_stamp_passport ON passport_stamps(passport_id);
  `);

  // Transaction Ledger (Immutable)
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      idempotency_key TEXT UNIQUE NOT NULL,
      amount INTEGER NOT NULL,
      type TEXT NOT NULL,
      from_account_id TEXT,
      to_account_id TEXT,
      participant_id TEXT,
      manager_id TEXT,
      domain_name TEXT,
      participant_balance_before INTEGER,
      participant_balance_after INTEGER,
      domain_budget_before INTEGER,
      domain_budget_after INTEGER,
      status TEXT DEFAULT 'SUCCESS',
      proof_photo_url TEXT,
      reversal_of_id TEXT UNIQUE,
      reason TEXT,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tx_participant ON transactions(participant_id);
    CREATE INDEX IF NOT EXISTS idx_tx_idempotency ON transactions(idempotency_key);
    CREATE INDEX IF NOT EXISTS idx_tx_manager ON transactions(manager_id);
    CREATE INDEX IF NOT EXISTS idx_tx_domain ON transactions(domain_name);

    CREATE TABLE IF NOT EXISTS point_transactions (
      id TEXT PRIMARY KEY,
      participant_id TEXT NOT NULL,
      domain_id TEXT NOT NULL,
      domain_name TEXT NOT NULL,
      awarded_by TEXT NOT NULL,
      awarded_by_role TEXT NOT NULL,
      amount INTEGER NOT NULL,
      reason TEXT,
      gateway_reference TEXT,
      status TEXT DEFAULT 'SUCCESS',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pt_participant ON point_transactions(participant_id);
    CREATE INDEX IF NOT EXISTS idx_pt_domain ON point_transactions(domain_id);
    CREATE INDEX IF NOT EXISTS idx_pt_awarded_by ON point_transactions(awarded_by);
    CREATE INDEX IF NOT EXISTS idx_pt_created_at ON point_transactions(created_at);
  `);

  // Append-Only Audit Logs
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      domain_id TEXT,
      participant_id TEXT,
      transaction_id TEXT,
      amount INTEGER,
      action TEXT NOT NULL,
      reason TEXT,
      before_val TEXT,
      after_val TEXT,
      timestamp TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
    CREATE INDEX IF NOT EXISTS idx_audit_domain ON audit_logs(domain_id);
    CREATE INDEX IF NOT EXISTS idx_audit_tx ON audit_logs(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
  `);

  // Domain Treasuries & Authorized Managers (17 domains)
  db.exec(`
    CREATE TABLE IF NOT EXISTS domain_treasuries (
      id TEXT PRIMARY KEY,
      domain_name TEXT UNIQUE NOT NULL,
      account_ref TEXT UNIQUE NOT NULL,
      manager_id TEXT UNIQUE NOT NULL,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS domain_reward_budgets (
      id TEXT PRIMARY KEY,
      domain_id TEXT UNIQUE NOT NULL,
      domain_name TEXT UNIQUE NOT NULL,
      manager_id TEXT UNIQUE NOT NULL,
      allocated_amount INTEGER DEFAULT 4000,
      issued_amount INTEGER DEFAULT 0,
      remaining_amount INTEGER DEFAULT 4000,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_drb_domain ON domain_reward_budgets(domain_id);
    CREATE INDEX IF NOT EXISTS idx_drb_manager ON domain_reward_budgets(manager_id);
  `);

  // Inventory Items
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tier INTEGER NOT NULL,
      price INTEGER NOT NULL,
      opening_count INTEGER NOT NULL,
      sold_count INTEGER DEFAULT 0,
      available_count INTEGER NOT NULL,
      image_url TEXT
    );
  `);

  // Magefficie Redemptions
  db.exec(`
    CREATE TABLE IF NOT EXISTS magefficie_redemptions (
      id TEXT PRIMARY KEY,
      participant_id TEXT NOT NULL,
      manager_id TEXT NOT NULL,
      reward_id TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      unit_cost INTEGER NOT NULL,
      total_cost INTEGER NOT NULL,
      stock_before INTEGER NOT NULL,
      stock_after INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
    );
  `);

  // Users (Domain Managers, Domain Incharge, Super Admins, Magefficie Manager)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      assigned_domain TEXT,
      assigned_domain_id TEXT,
      phone TEXT,
      college TEXT,
      registration_no TEXT,
      password_hash TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_users_assigned_domain ON users(assigned_domain);
  `);

  seedDefaultDomainTreasuries(db);
  seedDefaultDomainBudgets(db);
  seedDefaultInventory(db);
  seedStaffRoles(db);
}

function seedStaffRoles(db) {
  const crypto = require('crypto');
  const JWT_SECRET = 'carnival_reserve_super_secret_jwt_key_2026_fest';
  const hashPass = (p) => crypto.createHmac('sha256', JWT_SECRET).update(p).digest('hex');
  const now = new Date().toISOString();

  const insertUser = db.prepare(`
    INSERT OR REPLACE INTO users (id, email, name, role, assigned_domain, assigned_domain_id, password_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // 1. MAIN POC / SUPERVISOR
  insertUser.run(
    'usr-supervisor',
    'supervisor@aaruush.org',
    'Main POC (Lead Supervisor)',
    'MAIN_POC',
    null,
    null,
    hashPass('Supervisor2026!'),
    now,
    now
  );

  insertUser.run(
    'usr-mainpoc',
    'mainpoc@aaruush.org',
    'Main POC Central',
    'MAIN_POC',
    null,
    null,
    hashPass('Supervisor2026!'),
    now,
    now
  );

  insertUser.run(
    'usr-admin-alias',
    'supervisor-admin@aaruush.org',
    'Main Supervisor Admin',
    'MAIN_POC',
    null,
    null,
    hashPass('Supervisor2026!'),
    now,
    now
  );

  // 2. DOMAIN POCS (17 DOMAINS)
  const DOMAIN_POCS = [
    { name: 'Agritech', slug: 'agritech' },
    { name: 'Architecture', slug: 'architecture' },
    { name: 'Bluebook', slug: 'bluebook' },
    { name: 'Challenges & Championships', slug: 'challenges' },
    { name: 'Cosmic Quest', slug: 'cosmic-quest' },
    { name: 'Digital Design', slug: 'digital-design' },
    { name: 'Electrizite', slug: 'electrizite' },
    { name: 'Fundaz', slug: 'fundaz' },
    { name: 'Konstruktion & Canoe Challenge', slug: 'konstruktion' },
    { name: 'Machination', slug: 'machination' },
    { name: 'Magefficie & Entrepreneurial Symposium', slug: 'magefficie' },
    { name: 'Praesentatio', slug: 'praesentatio' },
    { name: 'Robogyan', slug: 'robogyan' },
    { name: 'Vimanaz', slug: 'vimanaz' },
    { name: 'Webnexus', slug: 'webnexus' },
    { name: 'X-zone & Esports', slug: 'x-zone' },
    { name: 'Yuddhame', slug: 'yuddhame' }
  ];

  for (const d of DOMAIN_POCS) {
    const pocId = 'poc-' + d.slug;
    const pocEmail = 'poc.' + d.slug + '@aaruush.org';
    insertUser.run(
      pocId,
      pocEmail,
      d.name + ' POC',
      'DOMAIN_POC',
      d.name,
      d.name,
      hashPass('Poc2026!'),
      now,
      now
    );
  }
}

function seedDefaultDomainTreasuries(db) {
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM domain_treasuries');
  const row = countStmt.get();
  if (row.count > 0) return;

  const OFFICIAL_DOMAINS = [
    { name: 'Agritech', ref: 'ACC-01', managerId: 'mgr-agritech' },
    { name: 'Architecture', ref: 'ACC-02', managerId: 'mgr-architecture' },
    { name: 'Bluebook', ref: 'ACC-03', managerId: 'mgr-bluebook' },
    { name: 'Challenges & Championships', ref: 'ACC-04', managerId: 'mgr-challenges' },
    { name: 'Cosmic Quest', ref: 'ACC-05', managerId: 'mgr-cosmic-quest' },
    { name: 'Digital Design', ref: 'ACC-06', managerId: 'mgr-digital-design' },
    { name: 'Electrizite', ref: 'ACC-07', managerId: 'mgr-electrizite' },
    { name: 'Fundaz', ref: 'ACC-08', managerId: 'mgr-fundaz' },
    { name: 'Konstruktion & Canoe Challenge', ref: 'ACC-09', managerId: 'mgr-konstruktion' },
    { name: 'Machination', ref: 'ACC-10', managerId: 'mgr-machination' },
    { name: 'Magefficie & Entrepreneurial Symposium', ref: 'ACC-11', managerId: 'mgr-magefficie' },
    { name: 'Praesentatio', ref: 'ACC-12', managerId: 'mgr-praesentatio' },
    { name: 'Robogyan', ref: 'ACC-13', managerId: 'mgr-robogyan' },
    { name: 'Vimanaz', ref: 'ACC-14', managerId: 'mgr-vimanaz' },
    { name: 'Webnexus', ref: 'ACC-15', managerId: 'mgr-webnexus' },
    { name: 'X-zone & Esports', ref: 'ACC-16', managerId: 'mgr-x-zone' },
    { name: 'Yuddhame', ref: 'ACC-17', managerId: 'mgr-yuddhame' }
  ];

  const insertTreasury = db.prepare(`
    INSERT INTO domain_treasuries (id, domain_name, account_ref, manager_id, active)
    VALUES (?, ?, ?, ?, 1)
  `);

  const insertUser = db.prepare(`
    INSERT OR REPLACE INTO users (id, email, name, role, assigned_domain)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const d of OFFICIAL_DOMAINS) {
    insertUser.run(d.managerId, d.managerId + '@aaruush.org', d.name + ' Manager', 'DOMAIN_MANAGER', d.name);
    insertTreasury.run('treasury-' + d.ref.toLowerCase(), d.name, d.ref, d.managerId);
  }

  // Central Domain Incharge
  insertUser.run('incharge-domain-1', 'incharge@aaruush.org', 'Lead Domain Incharge', 'DOMAIN_INCHARGE', null);

  // Magefficie Manager
  insertUser.run('mgr-vault', 'magefficie-vault@aaruush.org', 'Magefficie Vault Cashier', 'MAGEFFICIE_MANAGER', null);

  // Super Admins
  insertUser.run('admin-super-1', 'admin@aaruush.org', 'Lead Super Admin', 'SUPER_ADMIN', null);
  insertUser.run('admin-super-2', 'operations@aaruush.org', 'Operations Super Admin', 'SUPER_ADMIN', null);
}

function seedDefaultDomainBudgets(db) {
  const OFFICIAL_DOMAINS = [
    { name: 'Agritech', ref: 'ACC-01', managerId: 'mgr-agritech' },
    { name: 'Architecture', ref: 'ACC-02', managerId: 'mgr-architecture' },
    { name: 'Bluebook', ref: 'ACC-03', managerId: 'mgr-bluebook' },
    { name: 'Challenges & Championships', ref: 'ACC-04', managerId: 'mgr-challenges' },
    { name: 'Cosmic Quest', ref: 'ACC-05', managerId: 'mgr-cosmic-quest' },
    { name: 'Digital Design', ref: 'ACC-06', managerId: 'mgr-digital-design' },
    { name: 'Electrizite', ref: 'ACC-07', managerId: 'mgr-electrizite' },
    { name: 'Fundaz', ref: 'ACC-08', managerId: 'mgr-fundaz' },
    { name: 'Konstruktion & Canoe Challenge', ref: 'ACC-09', managerId: 'mgr-konstruktion' },
    { name: 'Machination', ref: 'ACC-10', managerId: 'mgr-machination' },
    { name: 'Magefficie & Entrepreneurial Symposium', ref: 'ACC-11', managerId: 'mgr-magefficie' },
    { name: 'Praesentatio', ref: 'ACC-12', managerId: 'mgr-praesentatio' },
    { name: 'Robogyan', ref: 'ACC-13', managerId: 'mgr-robogyan' },
    { name: 'Vimanaz', ref: 'ACC-14', managerId: 'mgr-vimanaz' },
    { name: 'Webnexus', ref: 'ACC-15', managerId: 'mgr-webnexus' },
    { name: 'X-zone & Esports', ref: 'ACC-16', managerId: 'mgr-x-zone' },
    { name: 'Yuddhame', ref: 'ACC-17', managerId: 'mgr-yuddhame' }
  ];

  const now = new Date().toISOString();
  const insertBudget = db.prepare(`
    INSERT OR IGNORE INTO domain_reward_budgets (id, domain_id, domain_name, manager_id, allocated_amount, issued_amount, remaining_amount, created_at, updated_at)
    VALUES (?, ?, ?, ?, 4000, 0, 4000, ?, ?)
  `);

  for (const d of OFFICIAL_DOMAINS) {
    insertBudget.run('budget-' + d.ref.toLowerCase(), d.ref, d.name, d.managerId, now, now);
  }
}

function recordAuditLog(db, { actorId, actorRole, domainId = null, participantId = null, transactionId = null, amount = null, action, reason = null, beforeVal = null, afterVal = null }) {
  const crypto = require('crypto');
  const auditId = 'aud-' + crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO audit_logs (id, actor_id, actor_role, domain_id, participant_id, transaction_id, amount, action, reason, before_val, after_val, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    auditId,
    actorId,
    actorRole,
    domainId,
    participantId,
    transactionId,
    amount,
    action,
    reason,
    typeof beforeVal === 'object' && beforeVal !== null ? JSON.stringify(beforeVal) : (beforeVal ? String(beforeVal) : null),
    typeof afterVal === 'object' && afterVal !== null ? JSON.stringify(afterVal) : (afterVal ? String(afterVal) : null),
    now
  );
  return auditId;
}

function seedDefaultInventory(db) {
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM inventory_items');
  const row = countStmt.get();
  if (row.count > 0) return;

  const INITIAL_REWARDS = [
    { id: '1', name: 'Pop Art Sticker Pack', tier: 1, price: 150, count: 120 },
    { id: '2', name: 'Festival Crunch Snack Combo', tier: 1, price: 250, count: 85 },
    { id: '3', name: 'Embroidered Log Notebook', tier: 2, price: 650, count: 45 },
    { id: '4', name: 'Champion Snapback Cap', tier: 3, price: 1200, count: 20 },
    { id: '5', name: 'Concert VIP Festival Hoodie', tier: 3, price: 2500, count: 8 }
  ];

  const insertItem = db.prepare(`
    INSERT INTO inventory_items (id, name, tier, price, opening_count, sold_count, available_count)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `);

  for (const r of INITIAL_REWARDS) {
    insertItem.run(r.id, r.name, r.tier, r.price, r.count, r.count);
  }
}

function cleanOldTestData(db) {
  const testIds = ['CR-892104'];
  const testEmails = ['sza.patel@example.com', 'test@example.com'];
  
  db.exec('BEGIN TRANSACTION;');
  try {
    for (const pid of testIds) {
      const p = db.prepare('SELECT id FROM participants WHERE participant_id = ?').get(pid);
      if (p) {
        db.prepare('DELETE FROM participants WHERE id = ?').run(p.id);
      }
    }
    for (const em of testEmails) {
      const p = db.prepare('SELECT id FROM participants WHERE email = ?').get(em);
      if (p) {
        db.prepare('DELETE FROM participants WHERE id = ?').run(p.id);
      }
    }
    db.exec('COMMIT;');
    return { cleaned: true };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

module.exports = {
  getDb,
  initSchema,
  cleanOldTestData,
  recordAuditLog
};
