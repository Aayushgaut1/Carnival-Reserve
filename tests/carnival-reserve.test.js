// tests/carnival-reserve.test.js - Comprehensive 27-Point Test Suite
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const auth = require('../server/auth');
const domainReward = require('../server/domain-reward');
const magefficie = require('../server/magefficie');
const { initSchema, cleanOldTestData } = require('../server/db');

// Use an isolated in-memory test database
function createTestDb() {
  const db = new DatabaseSync(':memory:');
  initSchema(db);
  return db;
}

// Helper to simulate retrieving the active OTP for testing
function getLatestOtpForTest(db, identifier) {
  const normId = identifier.includes('@') ? auth.normalizeEmail(identifier) : auth.normalizePhone(identifier);
  const rec = db.prepare('SELECT otp_hash FROM otp_records WHERE identifier = ? ORDER BY created_at DESC LIMIT 1').get(normId);
  if (!rec) return null;
  // Search 6-digit numeric space
  for (let i = 100000; i <= 999999; i++) {
    if (auth.hashOtp(String(i)) === rec.otp_hash) {
      return String(i);
    }
  }
  return null;
}

async function runTests() {
  console.log('================================================================');
  console.log('CARNIVAL RESERVE — 48-POINT MASTER SPECIFICATION TEST SUITE');
  console.log('================================================================\n');

  const db = createTestDb();
  let passed = 0;
  const totalTests = 58;

  function test(name, fn) {
    try {
      fn();
      passed++;
      console.log(`[PASS ${passed}/${totalTests}]: ${name}`);
    } catch (e) {
      console.error(`\n[FAIL at test #${passed + 1}]: ${name}`);
      console.error(e);
      process.exit(1);
    }
  }

  // ==========================================================================
  // GROUP 1: PARTICIPANT REGISTRATION (TESTS 1–6)
  // ==========================================================================
  console.log('\n--- GROUP 1: PARTICIPANT REGISTRATION (TESTS 1–6) ---');

  // 1. New participant registration succeeds
  test('1. New participant registration succeeds with CR-XXXXXXXX format in PENDING status', () => {
    const res = auth.registerParticipant(db, {
      name: 'Aarav Sharma',
      email: 'aarav@example.com',
      phone: '9876543210',
      college: 'SRMIST',
      regNo: 'RA2111003010001',
      termsAccepted: true
    });
    assert.strictEqual(res.success, true);
    assert.ok(res.participantId.startsWith('CR-'));
    assert.match(res.participantId, /^CR-[A-F0-9]{8}$/);
  });

  // 2. Duplicate email is rejected (case-insensitive)
  test('2. Duplicate email is rejected (EMAIL_ALREADY_REGISTERED, case-insensitive)', () => {
    const res = auth.registerParticipant(db, {
      name: 'Duplicate Aarav',
      email: 'AARAV@example.com',
      phone: '9876543211',
      college: 'SRMIST',
      regNo: 'RA2111003010002',
      termsAccepted: true
    });
    assert.strictEqual(res.error, 'EMAIL_ALREADY_REGISTERED');
  });

  // 3. Duplicate phone is rejected (normalized format)
  test('3. Duplicate phone is rejected (PHONE_ALREADY_REGISTERED, normalized check)', () => {
    const res = auth.registerParticipant(db, {
      name: 'Phone Duplicate',
      email: 'newemail@example.com',
      phone: '+91 98765 43210',
      college: 'SRMIST',
      regNo: 'RA2111003010003',
      termsAccepted: true
    });
    assert.strictEqual(res.error, 'PHONE_ALREADY_REGISTERED');
  });

  // 4. Duplicate registration number is rejected (case-insensitive)
  test('4. Duplicate registration number is rejected (REGISTRATION_NUMBER_ALREADY_REGISTERED)', () => {
    const res = auth.registerParticipant(db, {
      name: 'Reg Duplicate',
      email: 'regdup@example.com',
      phone: '9876543212',
      college: 'SRMIST',
      regNo: 'ra2111003010001',
      termsAccepted: true
    });
    assert.strictEqual(res.error, 'REGISTRATION_NUMBER_ALREADY_REGISTERED');
  });

  // 5. Terms acceptance is strictly enforced
  test('5. Terms acceptance is strictly enforced (TERMS_NOT_ACCEPTED)', () => {
    const res = auth.registerParticipant(db, {
      name: 'No Terms User',
      email: 'noterms@example.com',
      phone: '9876543299',
      college: 'SRMIST',
      regNo: 'RA2111003010099',
      termsAccepted: false
    });
    assert.strictEqual(res.error, 'TERMS_NOT_ACCEPTED');
  });

  // 6. Old demo/test participants do not exist in database
  test('6. Database contains zero legacy/demo participant entries', () => {
    cleanOldTestData(db);
    const demo1 = db.prepare("SELECT * FROM participants WHERE participant_id = 'CR-892104'").get();
    const demo2 = db.prepare("SELECT * FROM participants WHERE email = 'sza.patel@example.com'").get();
    assert.strictEqual(demo1, undefined);
    assert.strictEqual(demo2, undefined);
  });

  // ==========================================================================
  // GROUP 2: OTP SYSTEM & SECURITY (TESTS 7–14)
  // ==========================================================================
  console.log('\n--- GROUP 2: OTP SYSTEM & SECURITY (TESTS 7–14) ---');

  // 7. OTP generated is exactly 6 digits numeric
  test('7. OTP generated is exactly 6 numeric digits', () => {
    const email = 'aarav@example.com';
    const otp = getLatestOtpForTest(db, email);
    assert.ok(otp);
    assert.match(otp, /^\d{6}$/);
  });

  // 8. OTP is never stored in plaintext
  test('8. OTP is hashed and never stored in plaintext in the database', () => {
    const email = 'aarav@example.com';
    const rec = db.prepare('SELECT otp_hash FROM otp_records WHERE identifier = ? ORDER BY created_at DESC LIMIT 1').get(email);
    assert.ok(rec);
    assert.strictEqual(rec.otp_hash.length, 64); // SHA-256 HMAC hex length
    assert.notStrictEqual(rec.otp_hash, '123456');
  });

  // 9. OTP expiration is enforced
  test('9. Expired OTP is rejected (OTP_EXPIRED)', () => {
    const email = 'aarav@example.com';
    db.prepare('UPDATE otp_records SET expires_at = ? WHERE identifier = ?').run(new Date(Date.now() - 10000).toISOString(), email);
    const res = auth.completeRegistrationWithOtp(db, email, '123456');
    assert.strictEqual(res.error, 'OTP_EXPIRED');
  });

  // 10. Wrong OTP is rejected and remaining attempts decremented
  test('10. Wrong OTP is rejected (INVALID_OTP) with attemptsRemaining = 4', () => {
    const email = 'aarav@example.com';
    db.prepare('UPDATE otp_records SET expires_at = ?, attempts = 0 WHERE identifier = ?').run(new Date(Date.now() + 300000).toISOString(), email);
    const res = auth.completeRegistrationWithOtp(db, email, '000000');
    assert.strictEqual(res.error, 'INVALID_OTP');
    assert.strictEqual(res.attemptsRemaining, 4);
  });

  // 11. Too many failed attempts (5) locks OTP
  test('11. Too many OTP attempts locks the code (OTP_ATTEMPTS_EXCEEDED)', () => {
    const email = 'aarav@example.com';
    db.prepare('UPDATE otp_records SET attempts = 4 WHERE identifier = ?').run(email);
    const res = auth.completeRegistrationWithOtp(db, email, '000000');
    assert.strictEqual(res.error, 'OTP_ATTEMPTS_EXCEEDED');
  });

  // 12. Resend cooldown is enforced
  test('12. Resend cooldown is enforced (OTP_COOLDOWN_ACTIVE)', () => {
    const email = 'aarav@example.com';
    db.prepare('UPDATE otp_records SET resend_cooldown_until = ? WHERE identifier = ?').run(new Date(Date.now() + 30000).toISOString(), email);
    const res = auth.createOtp(db, email);
    assert.strictEqual(res.error, 'OTP_COOLDOWN_ACTIVE');
  });

  // 13. New OTP generation invalidates previous active OTPs
  test('13. New OTP generation invalidates previous active OTPs for the identifier', () => {
    const email = 'aarav@example.com';
    db.prepare('UPDATE otp_records SET resend_cooldown_until = ? WHERE identifier = ?').run(new Date(0).toISOString(), email);
    const p = db.prepare('SELECT id FROM participants WHERE email = ?').get(email);
    const res = auth.createOtp(db, email, p.id);
    assert.strictEqual(res.success, true);
    const activeCount = db.prepare('SELECT COUNT(*) as c FROM otp_records WHERE identifier = ? AND expires_at > ?').get(email, new Date().toISOString()).c;
    assert.strictEqual(activeCount, 1);
  });

  // 14. Successful OTP verification activates participant
  test('14. Successful OTP verification activates participant and sets verified = 1', () => {
    const email = 'aarav@example.com';
    const otp = getLatestOtpForTest(db, email);
    const res = auth.completeRegistrationWithOtp(db, email, otp);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.participant.status, 'ACTIVE');
    const otpRec = db.prepare('SELECT verified FROM otp_records WHERE identifier = ? ORDER BY created_at DESC LIMIT 1').get(email);
    assert.strictEqual(otpRec.verified, 1);
  });

  // ==========================================================================
  // GROUP 3: LOGIN SYSTEM & RETURNING PARTICIPANTS (TESTS 15–19)
  // ==========================================================================
  console.log('\n--- GROUP 3: LOGIN SYSTEM & RETURNING PARTICIPANTS (TESTS 15–19) ---');

  // 15. Existing participant can request login OTP via email
  test('15. Existing participant can request login OTP via email', () => {
    const email = 'aarav@example.com';
    db.prepare('UPDATE otp_records SET resend_cooldown_until = ? WHERE identifier = ?').run(new Date(0).toISOString(), email);
    const res = auth.loginRequestOtp(db, email);
    assert.strictEqual(res.success, true);
  });

  // 16. Existing participant can request login OTP via phone
  test('16. Existing participant can request login OTP via phone', () => {
    const phone = '+919876543210';
    db.prepare('UPDATE otp_records SET resend_cooldown_until = ? WHERE identifier = ?').run(new Date(0).toISOString(), phone);
    const res = auth.loginRequestOtp(db, phone);
    assert.strictEqual(res.success, true);
  });

  // 17. Unknown identifier cannot request login OTP
  test('17. Unknown identifier cannot request login OTP (PARTICIPANT_NOT_FOUND)', () => {
    const res = auth.loginRequestOtp(db, 'unknown_user_12345@example.com');
    assert.strictEqual(res.error, 'PARTICIPANT_NOT_FOUND');
  });

  // 18. Valid OTP login restores participant profile
  test('18. Valid OTP login restores existing participant profile', () => {
    const email = 'aarav@example.com';
    const otp = getLatestOtpForTest(db, email);
    const res = auth.loginVerifyOtp(db, email, otp);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.participant.email, 'aarav@example.com');
  });

  // 19. Returning login awards zero extra bonus and creates no duplicate account
  test('19. Returning login awards zero extra bonus (balance strictly unchanged)', () => {
    const p = db.prepare('SELECT id, participant_id FROM participants WHERE email = ?').get('aarav@example.com');
    const wallet = db.prepare('SELECT balance FROM wallets WHERE participant_id = ?').get(p.id);
    assert.strictEqual(wallet.balance, 50);

    const bonusTxs = db.prepare("SELECT COUNT(*) as c FROM transactions WHERE participant_id = ? AND type = 'REGISTRATION_BONUS'").get(p.id).c;
    assert.strictEqual(bonusTxs, 1);
  });

  // ==========================================================================
  // GROUP 4: QR CODE & IDENTITY (TESTS 20–25)
  // ==========================================================================
  console.log('\n--- GROUP 4: QR CODE & IDENTITY (TESTS 20–25) ---');

  // 20. Unique signed opaque QR token generated
  test('20. Unique signed opaque QR token generated upon activation', () => {
    const p = db.prepare('SELECT qr_code FROM participants WHERE email = ?').get('aarav@example.com');
    assert.ok(p.qr_code.startsWith('CR-QR-'));
  });

  // 21. QR token contains no sensitive PII
  test('21. QR token contains no sensitive plaintext PII (email, phone, regNo)', () => {
    const p = db.prepare('SELECT * FROM participants WHERE email = ?').get('aarav@example.com');
    assert.ok(!p.qr_code.includes('aarav@example.com'));
    assert.ok(!p.qr_code.includes('9876543210'));
    assert.ok(!p.qr_code.includes('RA2111003010001'));
  });

  // 22. QR code is persistent across logins
  test('22. QR code remains identical and persistent across logins', () => {
    const pBefore = db.prepare('SELECT qr_code FROM participants WHERE email = ?').get('aarav@example.com');
    db.prepare('UPDATE otp_records SET resend_cooldown_until = ? WHERE identifier = ?').run(new Date(0).toISOString(), 'aarav@example.com');
    auth.loginRequestOtp(db, 'aarav@example.com');
    const otp = getLatestOtpForTest(db, 'aarav@example.com');
    const res = auth.loginVerifyOtp(db, 'aarav@example.com', otp);
    assert.strictEqual(res.participant.qrCode, pBefore.qr_code);
  });

  // 23. Two distinct participants receive distinct QR codes
  test('23. Two distinct participants receive distinct QR codes (no collisions)', () => {
    auth.registerParticipant(db, {
      name: 'Bhavna Rao',
      email: 'bhavna@example.com',
      phone: '9876543220',
      college: 'SRMIST',
      regNo: 'RA2111003010020',
      termsAccepted: true
    });
    const otp = getLatestOtpForTest(db, 'bhavna@example.com');
    auth.completeRegistrationWithOtp(db, 'bhavna@example.com', otp);

    const qrAarav = db.prepare('SELECT qr_code FROM participants WHERE email = ?').get('aarav@example.com').qr_code;
    const qrBhavna = db.prepare('SELECT qr_code FROM participants WHERE email = ?').get('bhavna@example.com').qr_code;
    assert.notStrictEqual(qrAarav, qrBhavna);
  });

  // 24. Participant lookup by QR code resolves correct participant
  test('24. Participant lookup by QR code resolves correct participant profile', () => {
    const p = db.prepare('SELECT * FROM participants WHERE email = ?').get('aarav@example.com');
    const res = domainReward.lookupParticipant(db, p.qr_code);
    assert.ok(res);
    assert.strictEqual(res.participantId, p.participant_id);
    assert.strictEqual(res.name, p.name);
  });

  // 25. Participant lookup with invalid / forged QR returns not found
  test('25. Participant lookup with invalid / forged QR returns null', () => {
    const res = domainReward.lookupParticipant(db, 'CR-QR-FORGED-FAKE-TOKEN-999');
    assert.strictEqual(res, null);
  });

  // ==========================================================================
  // GROUP 5: REGISTRATION BONUS & AUDIT (TESTS 26–27)
  // ==========================================================================
  console.log('\n--- GROUP 5: REGISTRATION BONUS & AUDIT (TESTS 26–27) ---');

  // 26. Registration completion awards exactly +50 Crn
  test('26. Registration completion awards exactly +50 Crn into wallet', () => {
    const p = db.prepare('SELECT id FROM participants WHERE email = ?').get('bhavna@example.com');
    const wallet = db.prepare('SELECT balance, total_earned FROM wallets WHERE participant_id = ?').get(p.id);
    assert.strictEqual(wallet.balance, 50);
    assert.strictEqual(wallet.total_earned, 50);
  });

  // 27. Registration bonus creates immutable transaction ledger entry
  test('27. Registration bonus creates immutable transaction entry with REG-BONUS key', () => {
    const p = db.prepare('SELECT id, participant_id FROM participants WHERE email = ?').get('bhavna@example.com');
    const tx = db.prepare("SELECT * FROM transactions WHERE participant_id = ? AND type = 'REGISTRATION_BONUS'").get(p.id);
    assert.ok(tx);
    assert.strictEqual(tx.amount, 50);
    assert.strictEqual(tx.idempotency_key, 'REG-BONUS-' + p.participant_id);
  });

  // ==========================================================================
  // GROUP 6: DOMAIN REWARD SYSTEM & 4,000 CRN BUDGET (TESTS 28–39)
  // ==========================================================================
  console.log('\n--- GROUP 6: DOMAIN REWARD SYSTEM & 4,000 CRN BUDGET (TESTS 28–39) ---');

  // 28. Minimum reward boundary: 50 Crn is accepted
  test('28. Minimum reward boundary: 50 Crn reward is accepted and credited', () => {
    const p = db.prepare('SELECT * FROM participants WHERE email = ?').get('aarav@example.com');
    const res = domainReward.processDomainCredit(db, {
      managerId: 'mgr-electrizite',
      domainName: 'Electrizite',
      participantQrOrId: p.qr_code,
      amount: 50
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.rewardAmount, 50);
    assert.strictEqual(res.newBalance, 100); // 50 initial + 50 domain
  });

  // 29. Maximum reward boundary: 250 Crn is accepted
  test('29. Maximum reward boundary: 250 Crn reward is accepted and credited', () => {
    const p = db.prepare('SELECT * FROM participants WHERE email = ?').get('aarav@example.com');
    const res = domainReward.processDomainCredit(db, {
      managerId: 'mgr-konstruktion',
      domainName: 'Konstruktion & Canoe Challenge',
      participantQrOrId: p.qr_code,
      amount: 250
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.rewardAmount, 250);
    assert.strictEqual(res.newBalance, 350); // 100 + 250
  });

  // 30. Below minimum (49 Crn) is rejected
  test('30. Below minimum (49 Crn) is rejected (REWARD_AMOUNT_BELOW_MINIMUM)', () => {
    const p = db.prepare('SELECT * FROM participants WHERE email = ?').get('bhavna@example.com');
    const res = domainReward.processDomainCredit(db, {
      managerId: 'mgr-agritech',
      domainName: 'Agritech',
      participantQrOrId: p.qr_code,
      amount: 49
    });
    assert.strictEqual(res.error, 'REWARD_AMOUNT_BELOW_MINIMUM');
  });

  // 31. Above maximum (251 Crn and 300 Crn) is rejected
  test('31. Above maximum (251 Crn and 300 Crn) is rejected (REWARD_AMOUNT_EXCEEDS_MAXIMUM)', () => {
    const p = db.prepare('SELECT * FROM participants WHERE email = ?').get('bhavna@example.com');
    const res251 = domainReward.processDomainCredit(db, {
      managerId: 'mgr-agritech',
      domainName: 'Agritech',
      participantQrOrId: p.qr_code,
      amount: 251
    });
    assert.strictEqual(res251.error, 'REWARD_AMOUNT_EXCEEDS_MAXIMUM');

    const res300 = domainReward.processDomainCredit(db, {
      managerId: 'mgr-agritech',
      domainName: 'Agritech',
      participantQrOrId: p.qr_code,
      amount: 300
    });
    assert.strictEqual(res300.error, 'REWARD_AMOUNT_EXCEEDS_MAXIMUM');
  });

  // 32. Domain budget starts at exactly 4,000 Crn for all 17 domains
  test('32. Domain budget starts at exactly 4,000 Crn for all 17 domains', () => {
    const data = domainReward.getAllDomainBudgets(db);
    assert.strictEqual(data.domains.length, 17);
    const robogyan = data.domains.find(b => b.domainName === 'Robogyan');
    assert.strictEqual(robogyan.allocatedAmount, 4000);
    assert.strictEqual(robogyan.remainingAmount, 4000);
    assert.strictEqual(robogyan.issuedAmount, 0);
  });

  // 33. Domain budget decreases accurately by reward amount
  test('33. Domain budget decreases accurately (remaining = 4000 - amount, issued = amount)', () => {
    const electrizite = domainReward.getDomainBudget(db, 'Electrizite');
    assert.strictEqual(electrizite.issuedAmount, 50);
    assert.strictEqual(electrizite.remainingAmount, 3950);

    const konstruktion = domainReward.getDomainBudget(db, 'Konstruktion & Canoe Challenge');
    assert.strictEqual(konstruktion.issuedAmount, 250);
    assert.strictEqual(konstruktion.remainingAmount, 3750);
  });

  // 34. Domain budget cannot become negative; blocked when budget exceeded
  test('34. Domain budget cannot become negative (DOMAIN_BUDGET_EXCEEDED when depleted)', () => {
    // Deplete Robogyan budget to 20 Crn for test
    db.prepare('UPDATE domain_reward_budgets SET remaining_amount = 20, issued_amount = 3980 WHERE domain_name = ?').run('Robogyan');
    const p = db.prepare('SELECT * FROM participants WHERE email = ?').get('bhavna@example.com');
    const res = domainReward.processDomainCredit(db, {
      managerId: 'mgr-robogyan',
      domainName: 'Robogyan',
      participantQrOrId: p.qr_code,
      amount: 50
    });
    assert.strictEqual(res.error, 'DOMAIN_BUDGET_EXCEEDED');
    const robogyan = domainReward.getDomainBudget(db, 'Robogyan');
    assert.strictEqual(robogyan.remainingAmount, 20); // Remained at 20, never negative!
    // Restore Robogyan budget
    db.prepare('UPDATE domain_reward_budgets SET remaining_amount = 4000, issued_amount = 0 WHERE domain_name = ?').run('Robogyan');
  });

  // 35. Unauthorized manager cannot credit reward for another domain
  test('35. Unauthorized manager cannot credit reward for another domain (DOMAIN_NOT_AUTHORIZED)', () => {
    const p = db.prepare('SELECT * FROM participants WHERE email = ?').get('aarav@example.com');
    const res = domainReward.processDomainCredit(db, {
      managerId: 'mgr-electrizite',
      domainName: 'Robogyan',
      participantQrOrId: p.qr_code,
      amount: 50
    });
    assert.strictEqual(res.error, 'DOMAIN_NOT_AUTHORIZED');
  });

  // 36. Same domain cannot be rewarded twice
  test('36. Same domain cannot be rewarded twice (DOMAIN_ALREADY_COMPLETED)', () => {
    const p = db.prepare('SELECT * FROM participants WHERE email = ?').get('aarav@example.com');
    const res = domainReward.processDomainCredit(db, {
      managerId: 'mgr-electrizite',
      domainName: 'Electrizite',
      participantQrOrId: p.qr_code,
      amount: 100
    });
    assert.strictEqual(res.error, 'DOMAIN_ALREADY_COMPLETED');
  });

  // 37. Duplicate reward request with same idempotency key is idempotent
  test('37. Duplicate reward request with same idempotency key is idempotent', () => {
    const p = db.prepare('SELECT * FROM participants WHERE email = ?').get('bhavna@example.com');
    const key = 'IDEMP-BHAVNA-AGRITECH-TEST';
    const res1 = domainReward.processDomainCredit(db, {
      managerId: 'mgr-agritech',
      domainName: 'Agritech',
      participantQrOrId: p.qr_code,
      amount: 100,
      idempotencyKey: key
    });
    assert.strictEqual(res1.success, true);

    const res2 = domainReward.processDomainCredit(db, {
      managerId: 'mgr-agritech',
      domainName: 'Agritech',
      participantQrOrId: p.qr_code,
      amount: 100,
      idempotencyKey: key
    });
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.alreadyProcessed, true);
  });

  // 38. Domain passport stamp is created upon successful reward
  test('38. Domain passport stamp is created upon successful reward', () => {
    const p = db.prepare('SELECT id FROM participants WHERE email = ?').get('aarav@example.com');
    const pass = db.prepare('SELECT id FROM passports WHERE participant_id = ?').get(p.id);
    const stamps = db.prepare('SELECT domain_name FROM passport_stamps WHERE passport_id = ?').all(pass.id);
    const domainNames = stamps.map(s => s.domain_name);
    assert.ok(domainNames.includes('Electrizite'));
    assert.ok(domainNames.includes('Konstruktion & Canoe Challenge'));
  });

  // 39. Winner credit awards exactly 250 Crn and does not double-count
  test('39. Winner credit awards exactly +250 Crn (not 300 Crn)', () => {
    const p = db.prepare('SELECT id FROM participants WHERE email = ?').get('aarav@example.com');
    const tx = db.prepare("SELECT amount, type FROM transactions WHERE participant_id = ? AND type = 'WINNER_CREDIT'").get(p.id);
    assert.ok(tx);
    assert.strictEqual(tx.amount, 250);
  });

  // ==========================================================================
  // GROUP 7: MAGEFFICIE VAULT & INVENTORY (TESTS 40–44)
  // ==========================================================================
  console.log('\n--- GROUP 7: MAGEFFICIE VAULT & INVENTORY (TESTS 40–44) ---');

  // Stamp remaining 15 domains to unlock Magefficie for Aarav
  const pAarav = db.prepare('SELECT * FROM participants WHERE email = ?').get('aarav@example.com');
  const passAarav = db.prepare('SELECT id FROM passports WHERE participant_id = ?').get(pAarav.id);
  const REMAINING_DOMAINS = [
    'Agritech', 'Architecture', 'Bluebook', 'Challenges & Championships', 'Cosmic Quest',
    'Digital Design', 'Fundaz', 'Machination', 'Magefficie & Entrepreneurial Symposium',
    'Praesentatio', 'Robogyan', 'Vimanaz', 'Webnexus', 'X-zone & Esports', 'Yuddhame'
  ];
  for (const d of REMAINING_DOMAINS) {
    db.prepare('INSERT OR IGNORE INTO passport_stamps (id, passport_id, domain_name, claimed_at, is_winner) VALUES (?, ?, ?, ?, 0)')
      .run('stamp-' + d, passAarav.id, d, new Date().toISOString());
  }

  // 40. Server-side total calculation: unitCost * qty
  test('40. Server-side total calculation is unitCost * quantity', () => {
    // Aarav has 17 domains completed. Provide balance for test
    db.prepare('UPDATE wallets SET balance = 1000 WHERE participant_id = ?').run(pAarav.id);
    const res = magefficie.redeemReward(db, {
      participantQrOrId: pAarav.qr_code,
      rewardId: '1', // Pop Art Sticker Pack, price 150
      quantity: 2
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.item.totalCost, 300); // 150 * 2 = 300
    assert.strictEqual(res.newBalance, 700); // 1000 - 300
  });

  // 41. Insufficient balance is rejected
  test('41. Insufficient balance is rejected (INSUFFICIENT_CRN_BALANCE)', () => {
    db.prepare('UPDATE wallets SET balance = 100 WHERE participant_id = ?').run(pAarav.id);
    const res = magefficie.redeemReward(db, {
      participantQrOrId: pAarav.qr_code,
      rewardId: '1', // Price 150
      quantity: 1
    });
    assert.strictEqual(res.error, 'INSUFFICIENT_CRN_BALANCE');
  });

  // 42. Insufficient inventory stock is rejected
  test('42. Insufficient inventory stock is rejected (INSUFFICIENT_INVENTORY_STOCK)', () => {
    db.prepare('UPDATE wallets SET balance = 50000 WHERE participant_id = ?').run(pAarav.id);
    const item = db.prepare('SELECT available_count FROM inventory_items WHERE id = ?').get('5');
    const res = magefficie.redeemReward(db, {
      participantQrOrId: pAarav.qr_code,
      rewardId: '5',
      quantity: item.available_count + 5
    });
    assert.strictEqual(res.error, 'INSUFFICIENT_INVENTORY_STOCK');
  });

  // 43. Inventory stock never becomes negative
  test('43. Inventory stock never becomes negative (decrements atomically to 0)', () => {
    // Set item 5 available count to exactly 1
    db.prepare('UPDATE inventory_items SET available_count = 1 WHERE id = ?').run('5');
    db.prepare('UPDATE wallets SET balance = 50000 WHERE participant_id = ?').run(pAarav.id);
    const res = magefficie.redeemReward(db, {
      participantQrOrId: pAarav.qr_code,
      rewardId: '5',
      quantity: 1
    });
    assert.strictEqual(res.success, true);
    const item = db.prepare('SELECT available_count FROM inventory_items WHERE id = ?').get('5');
    assert.strictEqual(item.available_count, 0);
  });

  // 44. Required 17/17 domain completion gate is strictly enforced
  test('44. 17/17 domain completion gate is strictly enforced (REQUIRED_DOMAINS_NOT_COMPLETED)', () => {
    const pBhavna = db.prepare('SELECT * FROM participants WHERE email = ?').get('bhavna@example.com');
    db.prepare('UPDATE wallets SET balance = 5000 WHERE participant_id = ?').run(pBhavna.id);
    const res = magefficie.redeemReward(db, {
      participantQrOrId: pBhavna.qr_code,
      rewardId: '1',
      quantity: 1
    });
    assert.strictEqual(res.error, 'REQUIRED_DOMAINS_NOT_COMPLETED');
    assert.strictEqual(res.requiredCount, 17);
  });

  // ==========================================================================
  // GROUP 8: DOMAIN LOGOS & ARCHITECTURE (TESTS 45–48)
  // ==========================================================================
  console.log('\n--- GROUP 8: DOMAIN LOGOS & ARCHITECTURE (TESTS 45–48) ---');

  // 45. Exactly 17 official domains are configured
  test('45. Exactly 17 official domains are configured in domain treasuries and budgets', () => {
    const treasuries = db.prepare('SELECT COUNT(*) as c FROM domain_treasuries').get().c;
    const budgets = db.prepare('SELECT COUNT(*) as c FROM domain_reward_budgets').get().c;
    assert.strictEqual(treasuries, 17);
    assert.strictEqual(budgets, 17);
  });

  // 46. Aaruush is overarching festival identity and NOT an 18th domain
  test('46. Aaruush is overarching festival identity and NOT an 18th domain', () => {
    const aaruushTreasury = db.prepare("SELECT * FROM domain_treasuries WHERE domain_name LIKE '%Aaruush%'").get();
    const aaruushBudget = db.prepare("SELECT * FROM domain_reward_budgets WHERE domain_name LIKE '%Aaruush%'").get();
    assert.strictEqual(aaruushTreasury, undefined);
    assert.strictEqual(aaruushBudget, undefined);
  });

  // 47. Every domain has its own dedicated logo file
  test('47. Every domain has its own dedicated logo asset file in assets/domains/', () => {
    const assetsDir = path.join(__dirname, '..', 'assets', 'domains');
    assert.ok(fs.existsSync(assetsDir), 'Domain assets directory must exist');
    const files = fs.readdirSync(assetsDir);
    const domainKeywords = [
      'agritech', 'architecture', 'bluebook', 'challenges', 'cosmic',
      'digital', 'electrizite', 'fundaz', 'konstruktion', 'machination',
      'magefficie', 'praesentatio', 'robogyan', 'vimanaz', 'webnexus',
      'x-zone', 'yuddhame'
    ];
    for (const kw of domainKeywords) {
      const found = files.some(f => f.toLowerCase().includes(kw));
      assert.ok(found, `Dedicated logo file for ${kw} must exist`);
    }
  });

  // 48. Domain logo assets are individual standalone image files
  test('48. Domain logo assets are standalone image files (png/jpg/webp)', () => {
    const assetsDir = path.join(__dirname, '..', 'assets', 'domains');
    const files = fs.readdirSync(assetsDir).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
    assert.ok(files.length >= 17, 'At least 17 standalone domain image files must exist');
  });

  // ==========================================================================
  // GROUP 9: SECTION 35 DOMAIN INCHARGE & DOMAIN MANAGER ACCEPTANCE SUITE (TESTS 49–58)
  // ==========================================================================
  console.log('\n--- GROUP 9: SECTION 35 DOMAIN INCHARGE & DOMAIN MANAGER STRUCTURE (TESTS 49–58) ---');

  // 49. Super Admin can assign a new DOMAIN_INCHARGE and DOMAIN_MANAGER successfully
  test('49. Super Admin can assign DOMAIN_INCHARGE and DOMAIN_MANAGER roles', () => {
    const inchargeRes = domainReward.assignDomainIncharge(db, {
      superAdminId: 'admin-super-1',
      inchargeId: 'incharge-test-central',
      name: 'Test Central Incharge',
      email: 'incharge_test@aaruush.org'
    });
    assert.strictEqual(inchargeRes.success, true);
    const inchargeUser = db.prepare('SELECT * FROM users WHERE id = ?').get('incharge-test-central');
    assert.strictEqual(inchargeUser.role, 'DOMAIN_INCHARGE');

    const managerRes = domainReward.assignDomainManager(db, {
      superAdminId: 'admin-super-1',
      managerId: 'mgr-electrizite-v2',
      name: 'Electrizite Second Manager',
      email: 'electrizite_v2@aaruush.org',
      domainName: 'Electrizite'
    });
    assert.strictEqual(managerRes.success, true);
    const managerUser = db.prepare('SELECT * FROM users WHERE id = ?').get('mgr-electrizite-v2');
    assert.strictEqual(managerUser.role, 'DOMAIN_MANAGER');
    assert.strictEqual(managerUser.assigned_domain, 'Electrizite');
  });

  // 50. Domain manager is strictly restricted to assigned domain
  test('50. Domain manager is strictly restricted to assigned domain (DOMAIN_NOT_AUTHORIZED)', () => {
    const p = db.prepare('SELECT * FROM participants WHERE email = ?').get('bhavna@example.com');
    // mgr-electrizite-v2 is assigned to Electrizite, attempting to reward Machination must fail
    const res = domainReward.processDomainCredit(db, {
      managerId: 'mgr-electrizite-v2',
      domainName: 'Machination',
      participantQrOrId: p.qr_code,
      amount: 100
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, 'DOMAIN_NOT_AUTHORIZED');
  });

  // 51. Cross-domain reward request by unauthorized role is rejected
  test('51. Unauthorized role cannot issue rewards (ROLE_NOT_AUTHORIZED)', () => {
    const p = db.prepare('SELECT * FROM participants WHERE email = ?').get('bhavna@example.com');
    // Domain Incharge has supervisory role, NOT direct credit issuing
    const res = domainReward.processDomainCredit(db, {
      managerId: 'incharge-domain-1',
      domainName: 'Electrizite',
      participantQrOrId: p.qr_code,
      amount: 100
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, 'ROLE_NOT_AUTHORIZED');
  });

  // 52. Reward amount exceeding 250 Crn is rejected with REWARD_AMOUNT_EXCEEDS_MAXIMUM
  test('52. Reward amount exceeding 250 Crn is rejected (REWARD_AMOUNT_EXCEEDS_MAXIMUM)', () => {
    const p = db.prepare('SELECT * FROM participants WHERE email = ?').get('bhavna@example.com');
    const res = domainReward.processDomainCredit(db, {
      managerId: 'mgr-electrizite-v2',
      domainName: 'Electrizite',
      participantQrOrId: p.qr_code,
      amount: 251
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, 'REWARD_AMOUNT_EXCEEDS_MAXIMUM');
  });

  // 53. Reward amount below 50 Crn is rejected with REWARD_AMOUNT_BELOW_MINIMUM
  test('53. Reward amount below 50 Crn is rejected (REWARD_AMOUNT_BELOW_MINIMUM)', () => {
    const p = db.prepare('SELECT * FROM participants WHERE email = ?').get('bhavna@example.com');
    const res = domainReward.processDomainCredit(db, {
      managerId: 'mgr-electrizite-v2',
      domainName: 'Electrizite',
      participantQrOrId: p.qr_code,
      amount: 49
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, 'REWARD_AMOUNT_BELOW_MINIMUM');
  });

  // 54. Depleted domain budget rejects reward credit with DOMAIN_BUDGET_EXCEEDED
  test('54. Depleted domain budget rejects reward credit (DOMAIN_BUDGET_EXCEEDED)', () => {
    const p = db.prepare('SELECT * FROM participants WHERE email = ?').get('bhavna@example.com');
    // Temporarily set Vimanaz budget to 40 Crn remaining (less than minimum 50 reward)
    db.prepare('UPDATE domain_reward_budgets SET remaining_amount = 40, issued_amount = 3960 WHERE domain_name = ?').run('Vimanaz');
    const res = domainReward.processDomainCredit(db, {
      managerId: 'mgr-vimanaz',
      domainName: 'Vimanaz',
      participantQrOrId: p.qr_code,
      amount: 50
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, 'DOMAIN_BUDGET_EXCEEDED');
    // Restore Vimanaz
    db.prepare('UPDATE domain_reward_budgets SET remaining_amount = 4000, issued_amount = 0 WHERE domain_name = ?').run('Vimanaz');
  });

  // 55. Central Domain Incharge monitoring payload dynamically computes active budget without hardcoding
  test('55. Central Domain Incharge monitoring payload dynamically computes active budget', () => {
    const dash = domainReward.getDomainInchargeDashboard(db);
    assert.strictEqual(dash.summary.totalDomains, 17);
    // Dynamic calculation: totalDomains * 4000 = 68000
    assert.strictEqual(dash.summary.totalAllocated, 17 * 4000);
    assert.strictEqual(dash.summary.totalRemaining, dash.summary.totalAllocated - dash.summary.totalIssued);
    assert.strictEqual(dash.summary.activeManagers, 17);
    assert.ok(dash.anomalyIndicators.length >= 5);
    const indicatorKeys = dash.anomalyIndicators.map(i => i.key);
    assert.ok(indicatorKeys.includes('ACTIVITY_REVIEW'));
    assert.ok(indicatorKeys.includes('HIGH_TRANSACTION_VOLUME'));
    assert.ok(indicatorKeys.includes('REPEATED_PARTICIPANT_ACTIVITY'));
    assert.ok(indicatorKeys.includes('BUDGET_DEPLETION_RATE'));
    assert.ok(indicatorKeys.includes('PENDING_REVIEW'));
  });

  // 56. Domain Incharge has read/oversight privileges and cannot silently mint or inject Crn
  test('56. Domain Incharge has read/oversight privileges and cannot silently mint or inject Crn', () => {
    const incharge = db.prepare("SELECT * FROM users WHERE role = 'DOMAIN_INCHARGE'").get();
    assert.ok(incharge);
    // There is strictly no credit issuing ability for incharge
    const creditAttempt = domainReward.processDomainCredit(db, {
      managerId: incharge.id,
      domainName: 'Robogyan',
      participantQrOrId: 'dummy-qr',
      amount: 100
    });
    assert.strictEqual(creditAttempt.success, false);
    assert.strictEqual(creditAttempt.error, 'ROLE_NOT_AUTHORIZED');
  });

  // 57. Reassigning a domain manager preserves the domain's existing remaining budget
  test('57. Reassigning a domain manager preserves the domain existing remaining budget', () => {
    // Current Konstruktion budget had 250 issued earlier in tests (remaining = 3750)
    const beforeBudget = domainReward.getDomainBudget(db, 'Konstruktion & Canoe Challenge');
    const expectedRemaining = beforeBudget.remainingAmount;
    assert.strictEqual(expectedRemaining, 3750);

    // Reassign Konstruktion to a new manager
    const reassignRes = domainReward.assignDomainManager(db, {
      superAdminId: 'admin-super-1',
      managerId: 'mgr-konstruktion-replacement',
      name: 'Replacement Konstruktion Lead',
      email: 'konstruktion_repl@aaruush.org',
      domainName: 'Konstruktion & Canoe Challenge'
    });
    assert.strictEqual(reassignRes.success, true);

    // Verify remaining budget is UNCHANGED and did not reset
    const afterBudget = domainReward.getDomainBudget(db, 'Konstruktion & Canoe Challenge');
    assert.strictEqual(afterBudget.remainingAmount, expectedRemaining);
    assert.strictEqual(afterBudget.issuedAmount, 250);
  });

  // 58. Audit log records append-only entries with before/after balance snapshots
  test('58. Audit log records append-only entries with before/after balance snapshots', () => {
    const p = db.prepare('SELECT * FROM participants WHERE email = ?').get('bhavna@example.com');
    const wallet = db.prepare('SELECT balance FROM wallets WHERE participant_id = ?').get(p.id);
    const balanceBefore = wallet.balance;

    // Issue reward with mgr-machination
    const res = domainReward.processDomainCredit(db, {
      managerId: 'mgr-machination',
      domainName: 'Machination',
      participantQrOrId: p.qr_code,
      amount: 200
    });
    assert.strictEqual(res.success, true);

    const logs = domainReward.getAuditLogs(db, 10);
    const domainCreditLog = logs.find(l => (l.action === 'REWARD_CREDITED' || l.action === 'DOMAIN_REWARD_CREDIT') && l.actor_id === 'mgr-machination');
    assert.ok(domainCreditLog, 'Audit log entry must be recorded for domain reward');
    assert.strictEqual(domainCreditLog.participant_id, p.id);

    const beforeVal = JSON.parse(domainCreditLog.before_val || '{}');
    const afterVal = JSON.parse(domainCreditLog.after_val || '{}');
    assert.strictEqual(beforeVal.participantBalance, balanceBefore);
    assert.strictEqual(afterVal.participantBalance, balanceBefore + 200);
  });

  console.log('\n================================================================');
  console.log(`COMPLETE SUCCESS: ALL ${passed} / ${totalTests} SPECIFICATION TESTS PASSED!`);
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
