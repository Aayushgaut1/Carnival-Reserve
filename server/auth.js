// server/auth.js - Authentication, OTP & Participant Service
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'carnival_reserve_super_secret_jwt_key_2026_fest';
const OTP_DEV_MODE = process.env.OTP_DEV_MODE !== 'false';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizePhone(phone) {
  // Remove spaces, parentheses, hyphens
  let p = String(phone || '').replace(/[\s\-\(\)]/g, '').trim();
  if (p.startsWith('0')) p = '+91' + p.substring(1);
  if (!p.startsWith('+') && p.length === 10) p = '+91' + p;
  return p;
}

function normalizeRegNo(regNo) {
  return String(regNo || '').trim().toUpperCase();
}

function hashOtp(otp, salt = JWT_SECRET) {
  return crypto.createHmac('sha256', salt).update(otp).digest('hex');
}

function generateParticipantId(db) {
  while (true) {
    const raw = crypto.randomBytes(4).toString('hex').toUpperCase();
    const pid = `CR-${raw}`;
    const row = db.prepare('SELECT id FROM participants WHERE participant_id = ?').get(pid);
    if (!row) return pid;
  }
}

function generateQrToken(participantId) {
  const salt = crypto.randomBytes(8).toString('hex');
  const hmac = crypto.createHmac('sha256', JWT_SECRET).update(participantId + salt).digest('hex').substring(0, 16);
  return `CR-QR-${participantId}-${hmac}`.toUpperCase();
}

function checkCooldown(db, identifier) {
  const lastOtp = db.prepare(`
    SELECT created_at, resend_cooldown_until FROM otp_records 
    WHERE identifier = ? ORDER BY created_at DESC LIMIT 1
  `).get(identifier);

  if (lastOtp && lastOtp.resend_cooldown_until) {
    const cooldownTime = new Date(lastOtp.resend_cooldown_until).getTime();
    const now = Date.now();
    if (now < cooldownTime) {
      const remainingSeconds = Math.ceil((cooldownTime - now) / 1000);
      return { allowed: false, remainingSeconds };
    }
  }
  return { allowed: true };
}

function createOtp(db, identifier, participantId = null) {
  const cooldown = checkCooldown(db, identifier);
  if (!cooldown.allowed) {
    return {
      error: 'OTP_COOLDOWN_ACTIVE',
      message: `Please wait ${cooldown.remainingSeconds} seconds before requesting a new OTP.`,
      remainingSeconds: cooldown.remainingSeconds
    };
  }

  // Invalidate previous OTPs
  db.prepare(`
    UPDATE otp_records SET expires_at = ?, verified = 0 
    WHERE identifier = ? AND verified = 0
  `).run(new Date(0).toISOString(), identifier);

  const otp = String(crypto.randomInt(100000, 1000000));
  const otpHash = hashOtp(otp);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString(); // 5 minutes
  const cooldownUntil = new Date(now.getTime() + 45 * 1000).toISOString(); // 45 seconds cooldown
  const recordId = 'otp-' + crypto.randomUUID();

  db.prepare(`
    INSERT INTO otp_records (id, identifier, otp_hash, attempts, expires_at, resend_cooldown_until, verified, participant_id, created_at)
    VALUES (?, ?, ?, 0, ?, ?, 0, ?, ?)
  `).run(recordId, identifier, otpHash, expiresAt, cooldownUntil, participantId, now.toISOString());

  if (OTP_DEV_MODE) {
    console.log(`[OTP_DEV_MODE SECURE SERVER LOG] OTP for ${identifier}: ${otp}`);
  }

  return { 
    success: true, 
    message: 'OTP sent successfully', 
    recordId, 
    expiresAt,
    ...(OTP_DEV_MODE ? { devOtp: otp } : {})
  };
}

function verifyOtpRecord(db, identifier, otpInput) {
  const now = new Date().toISOString();
  const record = db.prepare(`
    SELECT * FROM otp_records 
    WHERE identifier = ? AND verified = 0 
    ORDER BY created_at DESC LIMIT 1
  `).get(identifier);

  if (!record) {
    return { error: 'OTP_NOT_FOUND', message: 'No active OTP found. Please request a new OTP.', status: 400 };
  }

  if (now > record.expires_at) {
    return { error: 'OTP_EXPIRED', message: 'OTP has expired. Please request a new OTP.', status: 400 };
  }

  if (record.attempts >= 5) {
    return { error: 'OTP_ATTEMPTS_EXCEEDED', message: 'Too many failed attempts. Code locked. Request a new OTP.', status: 429 };
  }

  const expectedHash = record.otp_hash;
  const providedHash = hashOtp(String(otpInput || '').trim());

  if (expectedHash !== providedHash) {
    const newAttempts = record.attempts + 1;
    db.prepare('UPDATE otp_records SET attempts = ? WHERE id = ?').run(newAttempts, record.id);
    if (newAttempts >= 5) {
      return { error: 'OTP_ATTEMPTS_EXCEEDED', message: 'Too many failed attempts. Code locked. Request a new OTP.', status: 429 };
    }
    return {
      error: 'INVALID_OTP',
      message: `Invalid OTP. ${5 - newAttempts} attempts remaining.`,
      status: 400,
      attemptsRemaining: 5 - newAttempts
    };
  }

  // Successful verification
  db.prepare('UPDATE otp_records SET verified = 1 WHERE id = ?').run(record.id);
  return { success: true, record };
}

function registerParticipant(db, data) {
  const { name, email, phone, college, regNo, termsAccepted } = data;

  if (!termsAccepted) {
    return { error: 'TERMS_NOT_ACCEPTED', message: 'Terms and Conditions must be accepted.', status: 400 };
  }

  if (!name || !name.trim()) {
    return { error: 'NAME_REQUIRED', message: 'Full name is required.', status: 400 };
  }

  const normEmail = normalizeEmail(email);
  const normPhone = normalizePhone(phone);
  const normRegNo = normalizeRegNo(regNo);

  if (!normEmail || !normEmail.includes('@')) {
    return { error: 'INVALID_EMAIL', message: 'Valid email address is required.', status: 400 };
  }
  if (!normPhone || normPhone.length < 10) {
    return { error: 'INVALID_PHONE', message: 'Valid mobile number is required.', status: 400 };
  }
  if (!normRegNo) {
    return { error: 'REGISTRATION_NUMBER_REQUIRED', message: 'Registration number is required.', status: 400 };
  }

  // Duplicate checks
  const existingEmail = db.prepare('SELECT id FROM participants WHERE email = ?').get(normEmail);
  if (existingEmail) {
    return { error: 'EMAIL_ALREADY_REGISTERED', message: 'This email is already registered.', status: 409 };
  }

  const existingPhone = db.prepare('SELECT id FROM participants WHERE phone = ?').get(normPhone);
  if (existingPhone) {
    return { error: 'PHONE_ALREADY_REGISTERED', message: 'This mobile number is already registered.', status: 409 };
  }

  const existingRegNo = db.prepare('SELECT id FROM participants WHERE reg_no = ?').get(normRegNo);
  if (existingRegNo) {
    return { error: 'REGISTRATION_NUMBER_ALREADY_REGISTERED', message: 'This registration number is already registered.', status: 409 };
  }

  const participantDbId = 'part-' + crypto.randomUUID();
  const participantId = generateParticipantId(db);
  const tempQr = 'TEMP-QR-' + participantId;
  const now = new Date().toISOString();

  // Create participant in PENDING status
  db.prepare(`
    INSERT INTO participants (id, participant_id, name, email, phone, college, reg_no, qr_code, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
  `).run(participantDbId, participantId, name.trim(), normEmail, normPhone, (college || 'SRMIST').trim(), normRegNo, tempQr, now, now);

  // Generate OTP for verification
  const otpRes = createOtp(db, normEmail, participantDbId);
  if (otpRes.error) {
    return { ...otpRes, status: 429 };
  }

  return {
    success: true,
    participantId,
    email: normEmail,
    phone: normPhone,
    message: 'Participant registered. Verification OTP sent.',
    status: 201,
    ...(otpRes.devOtp ? { devOtp: otpRes.devOtp } : {})
  };
}

function completeRegistrationWithOtp(db, identifier, otp) {
  const normId = identifier.includes('@') ? normalizeEmail(identifier) : normalizePhone(identifier);
  const verifyRes = verifyOtpRecord(db, normId, otp);
  if (verifyRes.error) return verifyRes;

  const participant = db.prepare(`
    SELECT * FROM participants WHERE email = ? OR phone = ?
  `).get(normId, normId);

  if (!participant) {
    return { error: 'PARTICIPANT_NOT_FOUND', message: 'No registration record found for this identifier.', status: 404 };
  }

  if (participant.status === 'ACTIVE') {
    // Already active, just return account
    return getParticipantProfile(db, participant.id);
  }

  // Atomically activate participant, grant +50 Crn bonus, assign QR, create wallet & passport
  const now = new Date().toISOString();
  const finalQr = generateQrToken(participant.participant_id);
  const walletId = 'wal-' + crypto.randomUUID();
  const passportId = 'pass-' + crypto.randomUUID();
  const txId = 'tx-' + crypto.randomUUID();
  const idempotencyKey = 'REG-BONUS-' + participant.participant_id;

  db.exec('BEGIN TRANSACTION;');
  try {
    // 1. Activate participant and set official QR
    db.prepare(`
      UPDATE participants 
      SET status = 'ACTIVE', qr_code = ?, updated_at = ? 
      WHERE id = ?
    `).run(finalQr, now, participant.id);

    // 2. Create Wallet with exactly 50 Crn
    db.prepare(`
      INSERT INTO wallets (id, participant_id, balance, total_earned, total_spent, created_at, updated_at)
      VALUES (?, ?, 50, 50, 0, ?, ?)
    `).run(walletId, participant.id, now, now);

    // 3. Create Passport
    db.prepare(`
      INSERT INTO passports (id, participant_id, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(passportId, participant.id, now, now);

    // 4. Create Immutable Ledger Transaction (+50 Crn REGISTRATION_BONUS)
    db.prepare(`
      INSERT INTO transactions (id, idempotency_key, amount, type, to_account_id, participant_id, timestamp)
      VALUES (?, ?, 50, 'REGISTRATION_BONUS', ?, ?, ?)
    `).run(txId, idempotencyKey, walletId, participant.id, now);

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  return getParticipantProfile(db, participant.id);
}

function loginRequestOtp(db, identifier) {
  const normId = identifier.includes('@') ? normalizeEmail(identifier) : normalizePhone(identifier);
  const participant = db.prepare(`
    SELECT * FROM participants WHERE (email = ? OR phone = ?) AND status = 'ACTIVE'
  `).get(normId, normId);

  if (!participant) {
    return {
      error: 'PARTICIPANT_NOT_FOUND',
      message: 'No registered participant found. Please complete registration first.',
      status: 404
    };
  }

  const otpRes = createOtp(db, normId, participant.id);
  if (otpRes.error) return { ...otpRes, status: 429 };

  return {
    success: true,
    message: `Login OTP sent to ${normId}.`,
    identifier: normId,
    ...(otpRes.devOtp ? { devOtp: otpRes.devOtp } : {})
  };
}

function loginVerifyOtp(db, identifier, otp) {
  const normId = identifier.includes('@') ? normalizeEmail(identifier) : normalizePhone(identifier);
  const verifyRes = verifyOtpRecord(db, normId, otp);
  if (verifyRes.error) return verifyRes;

  const participant = db.prepare(`
    SELECT * FROM participants WHERE (email = ? OR phone = ?) AND status = 'ACTIVE'
  `).get(normId, normId);

  if (!participant) {
    return { error: 'PARTICIPANT_NOT_FOUND', message: 'Participant not found.', status: 404 };
  }

  // Returning participant restored! NO DUPLICATE BONUS! NO DUPLICATE PARTICIPANT!
  return getParticipantProfile(db, participant.id);
}

function getParticipantProfile(db, participantDbOrPublicId) {
  const participant = db.prepare(`
    SELECT * FROM participants WHERE id = ? OR participant_id = ?
  `).get(participantDbOrPublicId, participantDbOrPublicId);

  if (!participant) return { error: 'PARTICIPANT_NOT_FOUND', status: 404 };

  const wallet = db.prepare('SELECT * FROM wallets WHERE participant_id = ?').get(participant.id) || { balance: 0, total_earned: 0, total_spent: 0 };
  const passport = db.prepare('SELECT * FROM passports WHERE participant_id = ?').get(participant.id);
  
  let stamps = [];
  if (passport) {
    stamps = db.prepare('SELECT domain_name, claimed_at, is_winner FROM passport_stamps WHERE passport_id = ?').all(passport.id);
  }

  return {
    success: true,
    participant: {
      id: participant.participant_id,
      internalId: participant.id,
      name: participant.name,
      email: participant.email,
      phone: participant.phone,
      college: participant.college,
      regNo: participant.reg_no,
      qrCode: participant.qr_code,
      status: participant.status,
      balance: wallet.balance,
      totalEarned: wallet.total_earned,
      totalSpent: wallet.total_spent,
      completedDomainsCount: stamps.length,
      stamps: stamps.map(s => ({
        domainName: s.domain_name,
        claimedAt: s.claimed_at,
        isWinner: Boolean(s.is_winner)
      }))
    }
  };
}

function hashPassword(password, salt = JWT_SECRET) {
  return crypto.createHmac('sha256', salt).update(String(password || '')).digest('hex');
}

function generateToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role || 'PARTICIPANT',
    assignedDomainId: user.assignedDomainId || user.assigned_domain_id || user.assigned_domain || null,
    college: user.college || '',
    regNo: user.registrationNo || user.registration_no || user.reg_no || '',
    phone: user.phone || ''
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    return JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch (e) {
    return null;
  }
}

function registerUser(db, data) {
  const { name, email, phone, college, regNo, password, confirmPassword } = data;

  if (!name || !name.trim()) {
    return { error: 'NAME_REQUIRED', message: 'Full name is required.', status: 400 };
  }

  const normEmail = normalizeEmail(email);
  const normPhone = normalizePhone(phone);
  const normRegNo = normalizeRegNo(regNo);

  if (!normEmail || !normEmail.includes('@')) {
    return { error: 'INVALID_EMAIL', message: 'Valid email address is required.', status: 400 };
  }
  if (!normPhone || normPhone.length < 10) {
    return { error: 'INVALID_PHONE', message: 'Valid 10-digit mobile number is required.', status: 400 };
  }
  if (!normRegNo) {
    return { error: 'REG_NO_REQUIRED', message: 'College registration number is required.', status: 400 };
  }

  if (!password || password.length < 6) {
    return { error: 'PASSWORD_TOO_SHORT', message: 'Password must be at least 6 characters long.', status: 400 };
  }

  if (confirmPassword !== undefined && password !== confirmPassword) {
    return { error: 'PASSWORD_MISMATCH', message: 'Password and confirm password do not match.', status: 400 };
  }

  // Duplicate checks in participants and users
  const existingEmail = db.prepare('SELECT id FROM participants WHERE email = ?').get(normEmail) ||
                        db.prepare('SELECT id FROM users WHERE email = ?').get(normEmail);
  if (existingEmail) {
    return { error: 'EMAIL_ALREADY_REGISTERED', message: 'An account with this email already exists.', status: 409 };
  }

  const existingPhone = db.prepare('SELECT id FROM participants WHERE phone = ?').get(normPhone) ||
                        db.prepare('SELECT id FROM users WHERE phone = ?').get(normPhone);
  if (existingPhone) {
    return { error: 'PHONE_ALREADY_REGISTERED', message: 'An account with this mobile number already exists.', status: 409 };
  }

  const existingRegNo = db.prepare('SELECT id FROM participants WHERE reg_no = ?').get(normRegNo) ||
                        db.prepare('SELECT id FROM users WHERE registration_no = ?').get(normRegNo);
  if (existingRegNo) {
    return { error: 'REG_NO_ALREADY_REGISTERED', message: 'This college registration number is already registered.', status: 409 };
  }

  const participantDbId = 'usr-' + crypto.randomUUID();
  const participantId = generateParticipantId(db);
  const passHash = hashPassword(password);
  const now = new Date().toISOString();

  // Insert into participants
  db.prepare(`
    INSERT INTO participants (id, participant_id, name, email, phone, college, reg_no, qr_code, password_hash, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
  `).run(participantDbId, participantId, name.trim(), normEmail, normPhone, (college || 'SRMIST').trim(), normRegNo, 'QR-' + participantId, passHash, now, now);

  // Insert into users
  db.prepare(`
    INSERT OR REPLACE INTO users (id, email, name, phone, college, registration_no, password_hash, role, assigned_domain, assigned_domain_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'PARTICIPANT', NULL, NULL, ?, ?)
  `).run(participantId, normEmail, name.trim(), normPhone, (college || 'SRMIST').trim(), normRegNo, passHash, now, now);

  // Initialize wallet with 50 Crn welcome registration bonus
  try {
    db.prepare(`
      INSERT OR REPLACE INTO wallets (id, participant_id, balance, total_earned, total_spent, created_at, updated_at)
      VALUES (?, ?, 50, 50, 0, ?, ?)
    `).run('wal-' + crypto.randomUUID(), participantDbId, now, now);
    db.prepare(`
      INSERT INTO point_transactions (id, participant_id, domain_id, domain_name, awarded_by, awarded_by_role, amount, reason, gateway_reference, status, created_at)
      VALUES (?, ?, 'REGISTRATION', 'Registration Bonus', 'SYSTEM', 'SYSTEM', 50, 'Welcome Registration Bonus', 'GW-CRN-WELCOME', 'SUCCESS', ?)
    `).run('PTX-' + crypto.randomBytes(4).toString('hex').toUpperCase(), participantId, now);
  } catch (e) {}

  const userObj = {
    id: participantId,
    internalId: participantDbId,
    name: name.trim(),
    email: normEmail,
    phone: normPhone,
    college: (college || 'SRMIST').trim(),
    registrationNo: normRegNo,
    regNo: normRegNo,
    role: 'PARTICIPANT',
    assignedDomainId: null,
    crnBalance: 50,
    createdAt: now
  };

  const token = generateToken(userObj);

  return {
    success: true,
    message: 'Registration Successful',
    user: userObj,
    token,
    status: 201
  };
}

function loginUser(db, data) {
  const { identifier, password } = data;
  if (!identifier || !String(identifier).trim()) {
    return { error: 'IDENTIFIER_REQUIRED', message: 'Email, phone, or registration number is required.', status: 400 };
  }
  if (!password) {
    return { error: 'PASSWORD_REQUIRED', message: 'Password is required.', status: 400 };
  }

  const cleanId = String(identifier).trim();
  const normEmail = normalizeEmail(cleanId);
  const normPhone = normalizePhone(cleanId);
  const normRegNo = normalizeRegNo(cleanId);

  // Look for user in `users` table or `participants`
  let userRow = db.prepare(`
    SELECT * FROM users 
    WHERE email = ? OR phone = ? OR registration_no = ? OR id = ?
  `).get(normEmail, normPhone, normRegNo, cleanId);

  if (!userRow) {
    const partRow = db.prepare(`
      SELECT * FROM participants 
      WHERE email = ? OR phone = ? OR reg_no = ? OR participant_id = ?
    `).get(normEmail, normPhone, normRegNo, cleanId.toUpperCase());

    if (partRow) {
      userRow = {
        id: partRow.participant_id,
        email: partRow.email,
        name: partRow.name,
        phone: partRow.phone,
        college: partRow.college,
        registration_no: partRow.reg_no,
        password_hash: partRow.password_hash,
        role: 'PARTICIPANT',
        assigned_domain_id: null,
        created_at: partRow.created_at
      };
    }
  }

  if (!userRow) {
    return { error: 'USER_NOT_FOUND', message: 'No account found with these credentials.', status: 404 };
  }

  // Check password
  if (userRow.password_hash) {
    const inputHash = hashPassword(password);
    if (inputHash !== userRow.password_hash) {
      return { error: 'INVALID_CREDENTIALS', message: 'Invalid password. Please try again.', status: 401 };
    }
  }

  const rawRole = userRow.role || 'PARTICIPANT';
  // Allow seamless equivalence between MAIN_POC and MAIN_SUPERVISOR
  const role = rawRole;
  const assignedDomain = userRow.assigned_domain_id || userRow.assigned_domain || null;

  let crnBalance = 0;
  try {
    const wal = db.prepare('SELECT balance FROM wallets WHERE participant_id = ?').get(userRow.id);
    if (wal) {
      crnBalance = wal.balance || 0;
    }
  } catch (e) {}

  const userObj = {
    id: userRow.id,
    name: userRow.name,
    email: userRow.email,
    phone: userRow.phone || '',
    college: userRow.college || '',
    registrationNo: userRow.registration_no || userRow.reg_no || '',
    regNo: userRow.registration_no || userRow.reg_no || '',
    role,
    assignedDomainId: assignedDomain,
    crnBalance,
    createdAt: userRow.created_at
  };

  const token = generateToken(userObj);

  return {
    success: true,
    message: `Welcome back, ${userRow.name}!`,
    token,
    user: userObj,
    status: 200
  };
}

function registerForDomain(db, data) {
  const { userId, domainId, domainName, teamName, teamMembers } = data;

  if (!userId) {
    return { error: 'USER_REQUIRED', message: 'User must be signed in to register for a domain.', status: 401 };
  }
  if (!domainId || !domainName) {
    return { error: 'DOMAIN_REQUIRED', message: 'Domain details are required.', status: 400 };
  }

  // Find user in participants or users
  const participant = db.prepare('SELECT * FROM participants WHERE id = ? OR participant_id = ?').get(userId, userId) ||
                      db.prepare('SELECT * FROM users WHERE id = ? OR email = ?').get(userId, userId);
  if (!participant) {
    return { error: 'USER_NOT_FOUND', message: 'Participant record not found.', status: 404 };
  }

  const lookupId1 = participant.id;
  const lookupId2 = participant.participant_id || participant.id;

  // Strict duplicate check: CANNOT register for the same domain twice
  const existingReg = db.prepare(`
    SELECT * FROM domain_registrations 
    WHERE (user_id = ? OR user_id = ?) AND (domain_id = ? OR domain_name = ?)
  `).get(lookupId1, lookupId2, domainId, domainName);

  if (existingReg) {
    return {
      error: 'ALREADY_REGISTERED',
      message: `You are already registered for ${domainName}! Each participant can only register once per domain.`,
      status: 409,
      registrationId: existingReg.id
    };
  }

  const regId = 'REG-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO domain_registrations (id, user_id, domain_id, domain_name, team_name, team_members, status, registered_at)
      VALUES (?, ?, ?, ?, ?, ?, 'CONFIRMED', ?)
    `).run(regId, lookupId1, domainId, domainName, (teamName || '').trim(), (teamMembers || '').trim(), now);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return {
        error: 'ALREADY_REGISTERED',
        message: `You are already registered for ${domainName}!`,
        status: 409
      };
    }
    throw err;
  }

  return {
    success: true,
    message: `Successfully registered for ${domainName}!`,
    registration: {
      id: regId,
      domainId,
      domainName,
      teamName: (teamName || '').trim(),
      teamMembers: (teamMembers || '').trim(),
      status: 'CONFIRMED',
      registeredAt: now,
      userName: participant.name,
      userEmail: participant.email,
      userCollege: participant.college
    },
    status: 201
  };
}

function getUserRegistrations(db, userId) {
  if (!userId) return { success: true, registrations: [] };

  const participant = db.prepare('SELECT id, participant_id FROM participants WHERE id = ? OR participant_id = ?').get(userId, userId) ||
                      db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!participant) return { success: true, registrations: [] };

  const pid1 = participant.id;
  const pid2 = participant.participant_id || participant.id;

  const rows = db.prepare(`
    SELECT * FROM domain_registrations 
    WHERE user_id = ? OR user_id = ?
    ORDER BY registered_at DESC
  `).all(pid1, pid2);

  return {
    success: true,
    registrations: rows.map(r => ({
      id: r.id,
      domainId: r.domain_id,
      domainName: r.domain_name,
      teamName: r.team_name,
      teamMembers: r.team_members,
      status: r.status,
      registeredAt: r.registered_at
    }))
  };
}

// Domain POC Service - Strictly Isolated by assignedDomain
function getPocRegistrations(db, assignedDomain) {
  if (!assignedDomain) {
    return { success: false, error: 'NO_ASSIGNED_DOMAIN', message: 'No domain assigned to this POC.', status: 400 };
  }

  const rows = db.prepare(`
    SELECT 
      dr.id as registrationId,
      dr.domain_id as domainId,
      dr.domain_name as domainName,
      dr.team_name as teamName,
      dr.team_members as teamMembers,
      dr.status,
      dr.registered_at as registeredAt,
      COALESCE(p.name, u.name, 'Participant') as participantName,
      COALESCE(p.name, u.name, 'Participant') as participant_name,
      COALESCE(p.email, u.email, '') as participantEmail,
      COALESCE(p.email, u.email, '') as participant_email,
      COALESCE(p.phone, u.phone, '') as participantPhone,
      COALESCE(p.phone, u.phone, '') as participant_phone,
      COALESCE(p.college, u.college, '') as participantCollege,
      COALESCE(p.college, u.college, '') as participant_college,
      COALESCE(p.reg_no, u.registration_no, '') as participantRegNo,
      COALESCE(p.reg_no, u.registration_no, '') as participant_reg_no
    FROM domain_registrations dr
    LEFT JOIN participants p ON (dr.user_id = p.id OR dr.user_id = p.participant_id)
    LEFT JOIN users u ON (dr.user_id = u.id)
    WHERE dr.domain_id = ? OR dr.domain_name = ?
    ORDER BY dr.registered_at DESC
  `).all(assignedDomain, assignedDomain);

  return {
    success: true,
    assignedDomain,
    assignedDomainId: assignedDomain,
    totalRegistrations: rows.length,
    registrations: rows
  };
}

// Main Supervisor Service - Cross-Domain Oversight
function getSupervisorOverview(db) {
  const OFFICIAL_DOMAINS = [
    { name: 'Agritech', category: 'Sustainability & Agriculture' },
    { name: 'Architecture', category: 'Design & Skyline Structuring' },
    { name: 'Bluebook', category: 'Literary & Editorial Strategy' },
    { name: 'Challenges & Championships', category: 'Tournaments & Skill Arenas' },
    { name: 'Cosmic Quest', category: 'Astronomy & Aerospace' },
    { name: 'Digital Design', category: 'Creative Tech & UI/UX' },
    { name: 'Electrizite', category: 'Energy & Electrical Innovations' },
    { name: 'Fundaz', category: 'Intellectual Fundamentals & Quiz' },
    { name: 'Konstruktion & Canoe Challenge', category: 'Civil & Material Defiance' },
    { name: 'Machination', category: 'Robomechanical & Precision CAD' },
    { name: 'Magefficie & Entrepreneurial Symposium', category: 'Entrepreneurship & Pitch Symposium' },
    { name: 'Praesentatio', category: 'Keynote & Research Speaking' },
    { name: 'Robogyan', category: 'Robotics & Autonomous AI' },
    { name: 'Vimanaz', category: 'Aeronautics & Drone Navigation' },
    { name: 'Webnexus', category: 'Full-Stack & Connected Grid' },
    { name: 'X-zone & Esports', category: 'Competitive Esports & VR' },
    { name: 'Yuddhame', category: 'Tactical Combat & Strategy' }
  ];

  let totalParticipants = 0;
  try {
    const pRow = db.prepare(`
      SELECT COUNT(DISTINCT email) as count FROM (
        SELECT email FROM participants WHERE status = 'ACTIVE'
        UNION
        SELECT email FROM users WHERE role = 'PARTICIPANT'
      )
    `).get();
    totalParticipants = pRow ? pRow.count : 0;
  } catch (e) {}

  let totalRegistrations = 0;
  try {
    totalRegistrations = db.prepare('SELECT COUNT(*) as count FROM domain_registrations').get().count;
  } catch (e) {}

  const domainCounts = OFFICIAL_DOMAINS.map(d => {
    let count = 0;
    try {
      count = db.prepare('SELECT COUNT(*) as count FROM domain_registrations WHERE domain_id = ? OR domain_name = ?').get(d.name, d.name).count;
    } catch (e) {}

    let pocInfo = null;
    try {
      pocInfo = db.prepare(`
        SELECT name, email FROM users 
        WHERE role = 'DOMAIN_POC' AND (assigned_domain_id = ? OR assigned_domain = ?)
      `).get(d.name, d.name);
    } catch (e) {}

    return {
      name: d.name,
      domainId: d.name,
      domainName: d.name,
      category: d.category,
      count,
      registrationCount: count,
      pocName: pocInfo ? pocInfo.name : `${d.name} POC`,
      pocEmail: pocInfo ? pocInfo.email : `poc.${d.name.toLowerCase().replace(/[^a-z0-9]/g, '')}@aaruush.org`
    };
  });

  return {
    success: true,
    totalParticipants,
    totalRegistrations,
    uniqueParticipants: totalParticipants,
    domainCounts,
    domainSummary: domainCounts
  };
}

function getSupervisorDomainRegistrations(db, domainId) {
  const rows = db.prepare(`
    SELECT 
      dr.id as registrationId,
      dr.domain_id as domainId,
      dr.domain_name as domainName,
      dr.team_name as teamName,
      dr.team_members as teamMembers,
      dr.status,
      dr.registered_at as registeredAt,
      COALESCE(p.name, u.name, 'Participant') as participantName,
      COALESCE(p.name, u.name, 'Participant') as participant_name,
      COALESCE(p.email, u.email, '') as participantEmail,
      COALESCE(p.email, u.email, '') as participant_email,
      COALESCE(p.phone, u.phone, '') as participantPhone,
      COALESCE(p.phone, u.phone, '') as participant_phone,
      COALESCE(p.college, u.college, '') as participantCollege,
      COALESCE(p.college, u.college, '') as participant_college,
      COALESCE(p.reg_no, u.registration_no, '') as participantRegNo,
      COALESCE(p.reg_no, u.registration_no, '') as participant_reg_no
    FROM domain_registrations dr
    LEFT JOIN participants p ON (dr.user_id = p.id OR dr.user_id = p.participant_id)
    LEFT JOIN users u ON (dr.user_id = u.id)
    WHERE dr.domain_id = ? OR dr.domain_name = ?
    ORDER BY dr.registered_at DESC
  `).all(domainId, domainId);

  return {
    success: true,
    domainId,
    totalRegistrations: rows.length,
    registrations: rows
  };
}

// =========================================================================
// POINTS & CRN MANAGEMENT SERVICE
// =========================================================================
function awardPoints(db, { participantId, domainId, domainName, amount, reason = '', awardedBy, awardedByRole, gatewayReference = null }) {
  if (!participantId) {
    return { error: 'PARTICIPANT_REQUIRED', message: 'Participant ID or identifier is required.', status: 400 };
  }
  const parsedAmount = parseInt(amount, 10);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return { error: 'INVALID_AMOUNT', message: 'Point amount must be a positive number.', status: 400 };
  }
  if (!domainId && !domainName) {
    return { error: 'DOMAIN_REQUIRED', message: 'Domain identification is required.', status: 400 };
  }

  // Find participant
  const participant = db.prepare(`
    SELECT * FROM participants 
    WHERE id = ? OR participant_id = ? OR email = ? OR phone = ? OR reg_no = ?
  `).get(participantId, participantId, participantId, participantId, participantId) ||
  db.prepare(`
    SELECT * FROM users 
    WHERE id = ? OR email = ?
  `).get(participantId, participantId);

  if (!participant) {
    return { error: 'PARTICIPANT_NOT_FOUND', message: `Participant not found for identifier: ${participantId}`, status: 404 };
  }

  const pId = participant.participant_id || participant.id;
  const pDbId = participant.id;
  const dName = domainName || domainId;
  const dId = domainId || domainName;
  const now = new Date().toISOString();
  const txId = 'PTX-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const gwRef = gatewayReference || ('GW-CRN-' + crypto.randomBytes(4).toString('hex').toUpperCase());

  db.exec('BEGIN TRANSACTION;');
  try {
    // Ensure wallet exists
    let wallet = db.prepare('SELECT * FROM wallets WHERE participant_id = ? OR participant_id = ?').get(pDbId, pId);
    if (!wallet) {
      db.prepare(`
        INSERT INTO wallets (id, participant_id, balance, total_earned, total_spent, created_at, updated_at)
        VALUES (?, ?, 0, 0, 0, ?, ?)
      `).run('wal-' + crypto.randomUUID(), pDbId, now, now);
      wallet = { balance: 0, total_earned: 0 };
    }

    const newBalance = (wallet.balance || 0) + parsedAmount;
    const newTotalEarned = (wallet.total_earned || 0) + parsedAmount;

    db.prepare(`
      UPDATE wallets SET balance = ?, total_earned = ?, updated_at = ?
      WHERE participant_id = ? OR participant_id = ?
    `).run(newBalance, newTotalEarned, now, pDbId, pId);

    // Insert into point_transactions
    db.prepare(`
      INSERT INTO point_transactions (id, participant_id, domain_id, domain_name, awarded_by, awarded_by_role, amount, reason, gateway_reference, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUCCESS', ?)
    `).run(txId, pId, dId, dName, awardedBy, awardedByRole, parsedAmount, reason || 'Domain participation points', gwRef, now);

    // Also record in legacy transactions table for full ledger compatibility
    try {
      db.prepare(`
        INSERT INTO transactions (id, idempotency_key, amount, type, from_account_id, to_account_id, participant_id, manager_id, domain_name, participant_balance_before, participant_balance_after, status, reason, timestamp)
        VALUES (?, ?, ?, 'DOMAIN_AWARD', ?, ?, ?, ?, ?, ?, ?, 'SUCCESS', ?, ?)
      `).run(
        'tx-' + crypto.randomUUID(),
        'idemp-' + txId,
        parsedAmount,
        dId,
        pId,
        pDbId,
        awardedBy,
        dName,
        wallet.balance || 0,
        newBalance,
        reason || 'Domain points awarded',
        now
      );
    } catch (e) {}

    db.exec('COMMIT;');

    return {
      success: true,
      message: `Successfully awarded ${parsedAmount} CRN to ${participant.name || pId}`,
      transaction: {
        id: txId,
        participantId: pId,
        participantName: participant.name,
        domainId: dId,
        domainName: dName,
        amount: parsedAmount,
        reason,
        gatewayReference: gwRef,
        status: 'SUCCESS',
        createdAt: now
      },
      newBalance,
      status: 200
    };
  } catch (err) {
    db.exec('ROLLBACK;');
    console.error('Points Award Error:', err);
    return { error: 'TRANSACTION_FAILED', message: err.message, status: 500 };
  }
}

function getPocPointHistory(db, domainId) {
  const rows = db.prepare(`
    SELECT pt.*, COALESCE(p.name, u.name, pt.participant_id) as participant_name
    FROM point_transactions pt
    LEFT JOIN participants p ON (pt.participant_id = p.participant_id OR pt.participant_id = p.id)
    LEFT JOIN users u ON (pt.participant_id = u.id)
    WHERE pt.domain_id = ? OR pt.domain_name = ?
    ORDER BY pt.created_at DESC
    LIMIT 100
  `).all(domainId, domainId);
  return { success: true, domainId, transactions: rows };
}

function getAllPointHistory(db) {
  const rows = db.prepare(`
    SELECT pt.*, COALESCE(p.name, u.name, pt.participant_id) as participant_name
    FROM point_transactions pt
    LEFT JOIN participants p ON (pt.participant_id = p.participant_id OR pt.participant_id = p.id)
    LEFT JOIN users u ON (pt.participant_id = u.id)
    ORDER BY pt.created_at DESC
    LIMIT 200
  `).all();
  return { success: true, transactions: rows };
}

function getParticipantPoints(db, participantId) {
  const participant = db.prepare(`
    SELECT * FROM participants 
    WHERE id = ? OR participant_id = ? OR email = ?
  `).get(participantId, participantId, participantId) ||
  db.prepare(`
    SELECT * FROM users 
    WHERE id = ? OR email = ?
  `).get(participantId, participantId);

  if (!participant) {
    return { success: true, balance: 0, totalEarned: 0, transactions: [] };
  }

  const pDbId = participant.id;
  const pId = participant.participant_id || participant.id;

  const wallet = db.prepare('SELECT * FROM wallets WHERE participant_id = ? OR participant_id = ?').get(pDbId, pId);
  const balance = wallet ? (wallet.balance || 0) : 0;
  const totalEarned = wallet ? (wallet.total_earned || 0) : 0;

  const txs = db.prepare(`
    SELECT * FROM point_transactions 
    WHERE participant_id = ? OR participant_id = ?
    ORDER BY created_at DESC
  `).all(pId, pDbId);

  return {
    success: true,
    participantId: pId,
    name: participant.name,
    balance,
    totalEarned,
    transactions: txs
  };
}

module.exports = {
  normalizeEmail,
  normalizePhone,
  normalizeRegNo,
  hashOtp,
  hashPassword,
  generateToken,
  verifyToken,
  generateParticipantId,
  generateQrToken,
  createOtp,
  verifyOtpRecord,
  registerParticipant,
  completeRegistrationWithOtp,
  loginRequestOtp,
  loginVerifyOtp,
  getParticipantProfile,
  registerUser,
  loginUser,
  registerForDomain,
  getUserRegistrations,
  getPocRegistrations,
  getSupervisorOverview,
  getSupervisorDomainRegistrations,
  awardPoints,
  getPocPointHistory,
  getAllPointHistory,
  getParticipantPoints
};
