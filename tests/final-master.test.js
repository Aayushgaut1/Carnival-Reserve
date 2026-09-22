// tests/final-master.test.js - Comprehensive Verification of 3 Strict Roles & Isolation
const http = require('http');
const assert = require('assert');

function apiRequest(method, endpoint, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const headers = {
      'Content-Type': 'application/json',
      ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: endpoint,
      method: method,
      headers: headers
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: data ? JSON.parse(data) : null, raw: data });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: null, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('RUNNING CARNIVAL RESERVE FINAL MASTER SPEC TESTS');
  console.log('====================================================');

  const ts = Date.now();
  const participantData = {
    name: 'Kavya Nair',
    email: `kavya_${ts}@srmist.edu.in`,
    phone: '99' + String(ts).slice(-8),
    college: 'SRM Institute of Science and Technology',
    regNo: 'RA' + String(ts).slice(-10),
    password: 'KavyaPassword2026!',
    confirmPassword: 'KavyaPassword2026!',
    termsAccepted: true
  };

  // 1. Participant Registration
  console.log('\n[1] Testing Participant Registration & Token Generation...');
  const regRes = await apiRequest('POST', '/api/auth/register', participantData);
  assert.strictEqual(regRes.status, 201, 'Participant registration should return 201');
  assert(regRes.body.token, 'Registration must return a JWT token');
  assert.strictEqual(regRes.body.user.role, 'PARTICIPANT', 'User role must be PARTICIPANT');
  const participantToken = regRes.body.token;
  const participantId = regRes.body.user.id;
  console.log(`PASS: Participant registered: ${participantId}, Role: ${regRes.body.user.role}`);

  // 2. Participant /api/auth/me Verification
  console.log('\n[2] Testing GET /api/auth/me with Bearer token...');
  const meRes = await apiRequest('GET', '/api/auth/me', null, participantToken);
  assert.strictEqual(meRes.status, 200);
  assert.strictEqual(meRes.body.user.id, participantId);
  assert.strictEqual(meRes.body.user.role, 'PARTICIPANT');
  console.log('PASS: Token verified and user session resolved correctly');

  // 3. Domain Registration & Duplicate Prevention
  console.log('\n[3] Testing Participant Domain Registration (Electrizite)...');
  const domReg1 = await apiRequest('POST', '/api/domains/register', {
    domainId: 'Electrizite',
    domainName: 'Electrizite',
    teamName: 'Volt Sparks',
    teamMembers: 'Kavya Nair, Rohan Rao'
  }, participantToken);
  assert.strictEqual(domReg1.status, 201);
  assert.strictEqual(domReg1.body.registration.domainName, 'Electrizite');
  console.log(`PASS: Domain registration successful. Ticket: ${domReg1.body.registration.id}`);

  console.log('\n[4] Testing Duplicate Domain Registration Blocking (409 Conflict)...');
  const dupDomReg = await apiRequest('POST', '/api/domains/register', {
    domainId: 'Electrizite',
    domainName: 'Electrizite',
    teamName: 'Volt Sparks 2'
  }, participantToken);
  assert.strictEqual(dupDomReg.status, 409);
  assert.strictEqual(dupDomReg.body.error, 'ALREADY_REGISTERED');
  console.log('PASS: Duplicate domain registration blocked with 409 ALREADY_REGISTERED');

  // 4. GET /api/my-registrations
  console.log('\n[5] Testing GET /api/my-registrations for Participant...');
  const myRegs = await apiRequest('GET', '/api/my-registrations', null, participantToken);
  assert.strictEqual(myRegs.status, 200);
  assert.strictEqual(myRegs.body.registrations.length, 1);
  assert.strictEqual(myRegs.body.registrations[0].domainName, 'Electrizite');
  console.log('PASS: Participant sees only their own registrations');

  // 5. Participant Forbidden from Admin/Supervisor & POC endpoints
  console.log('\n[6] Testing Participant Access Restrictions (403 Forbidden)...');
  const partSupervisorAttempt = await apiRequest('GET', '/api/supervisor/overview', null, participantToken);
  assert.strictEqual(partSupervisorAttempt.status, 403, 'Participant must get 403 on /api/supervisor/overview');
  console.log('PASS: Participant blocked from Supervisor Overview (403 Forbidden)');

  const partPocAttempt = await apiRequest('GET', '/api/poc/registrations', null, participantToken);
  assert.strictEqual(partPocAttempt.status, 403, 'Participant must get 403 on /api/poc/registrations');
  console.log('PASS: Participant blocked from POC registrations (403 Forbidden)');

  // 6. Domain POC Login & Isolation Check
  console.log('\n[7] Testing DOMAIN_POC Login for Electrizite...');
  const pocLoginRes = await apiRequest('POST', '/api/auth/login', {
    identifier: 'poc.electrizite@aaruush.org',
    password: 'Poc2026!'
  });
  assert.strictEqual(pocLoginRes.status, 200);
  assert.strictEqual(pocLoginRes.body.user.role, 'DOMAIN_POC');
  assert.strictEqual(pocLoginRes.body.user.assignedDomainId, 'Electrizite');
  assert(pocLoginRes.body.token);
  const pocToken = pocLoginRes.body.token;
  console.log(`PASS: Domain POC logged in. Assigned Domain: ${pocLoginRes.body.user.assignedDomainId}`);

  console.log('\n[8] Testing DOMAIN_POC Fetching Assigned Domain Registrations...');
  const pocRegs = await apiRequest('GET', '/api/poc/registrations', null, pocToken);
  assert.strictEqual(pocRegs.status, 200);
  assert.strictEqual(pocRegs.body.assignedDomainId, 'Electrizite');
  assert(pocRegs.body.registrations.length >= 1, 'Should include Kavya Nair registration');
  const foundReg = pocRegs.body.registrations.find(r => r.participant_name === 'Kavya Nair');
  assert(foundReg, 'Kavya Nair must be in Electrizite registration list');
  console.log(`PASS: DOMAIN_POC received exactly assigned domain registrations (${pocRegs.body.totalRegistrations} registered)`);

  console.log('\n[9] Testing DOMAIN_POC Access Restriction to Supervisor Endpoint (403)...');
  const pocSupervisorAttempt = await apiRequest('GET', '/api/supervisor/overview', null, pocToken);
  assert.strictEqual(pocSupervisorAttempt.status, 403, 'DOMAIN_POC must get 403 on /api/supervisor/overview');
  console.log('PASS: DOMAIN_POC blocked from Supervisor Overview (403 Forbidden)');

  // 7. Main Supervisor Login & Oversight Check
  console.log('\n[10] Testing MAIN_SUPERVISOR Login...');
  const supLoginRes = await apiRequest('POST', '/api/auth/login', {
    identifier: 'supervisor@aaruush.org',
    password: 'Supervisor2026!'
  });
  assert.strictEqual(supLoginRes.status, 200);
  assert(supLoginRes.body.user.role === 'MAIN_POC' || supLoginRes.body.user.role === 'MAIN_SUPERVISOR', 'Role must be MAIN_POC or MAIN_SUPERVISOR');
  assert(supLoginRes.body.token);
  const supToken = supLoginRes.body.token;
  console.log(`PASS: Main POC logged in successfully (Role: ${supLoginRes.body.user.role})`);

  console.log('\n[11] Testing MAIN_POC / MAIN_SUPERVISOR Overview Stats...');
  const supOverview = await apiRequest('GET', '/api/supervisor/overview', null, supToken);
  assert.strictEqual(supOverview.status, 200);
  assert(typeof supOverview.body.totalRegistrations === 'number');
  assert(typeof supOverview.body.uniqueParticipants === 'number');
  assert.strictEqual(supOverview.body.domainSummary.length, 17, 'Domain summary must contain all 17 domains');
  const electriziteSummary = supOverview.body.domainSummary.find(d => d.name === 'Electrizite');
  assert(electriziteSummary, 'Electrizite must be present in supervisor overview');
  assert(electriziteSummary.registrationCount >= 1);
  console.log(`PASS: Supervisor overview returned stats for all 17 domains. Electrizite count: ${electriziteSummary.registrationCount}`);

  console.log('\n[12] Testing MAIN_POC / MAIN_SUPERVISOR Domain Details Query for Electrizite...');
  const supDomainRegs = await apiRequest('GET', '/api/supervisor/domain-registrations?domainId=Electrizite', null, supToken);
  assert.strictEqual(supDomainRegs.status, 200);
  assert.strictEqual(supDomainRegs.body.domainId, 'Electrizite');
  assert(supDomainRegs.body.registrations.length >= 1);
  console.log(`PASS: Supervisor successfully inspected Electrizite roster (${supDomainRegs.body.registrations.length} entries)`);

  // 13. DOMAIN_POC Awarding Points for Assigned Domain
  console.log('\n[13] Testing DOMAIN_POC Awarding Points for Electrizite...');
  const awardRes = await apiRequest('POST', '/api/poc/points/award', {
    participantId: participantId,
    domainId: 'Electrizite',
    amount: 100,
    reason: 'Circuit Design Arena Winner'
  }, pocToken);
  assert.strictEqual(awardRes.status, 200);
  assert.strictEqual(awardRes.body.success, true);
  assert.strictEqual(awardRes.body.transaction.amount, 100);
  assert.strictEqual(awardRes.body.transaction.status, 'SUCCESS');
  console.log(`PASS: Domain POC awarded 100 CRN to ${participantId}. Tx ID: ${awardRes.body.transaction.id}`);

  // 14. DOMAIN_POC Blocked from Awarding Points to Other Domains (403 Forbidden)
  console.log('\n[14] Testing DOMAIN_POC Domain Isolation on Point Awarding (403 Forbidden)...');
  const illegalAwardRes = await apiRequest('POST', '/api/poc/points/award', {
    participantId: participantId,
    domainId: 'Webnexus', // Trying to award for Webnexus while being Electrizite POC
    amount: 50,
    reason: 'Hacking challenge'
  }, pocToken);
  assert.strictEqual(illegalAwardRes.status, 403);
  assert.strictEqual(illegalAwardRes.body.error, 'FORBIDDEN');
  console.log('PASS: Domain POC strictly blocked from awarding points for non-assigned domain (403 Forbidden)');

  // 15. DOMAIN_POC Point History
  console.log('\n[15] Testing DOMAIN_POC Point History for Electrizite...');
  const pocHistoryRes = await apiRequest('GET', '/api/poc/points/history', null, pocToken);
  assert.strictEqual(pocHistoryRes.status, 200);
  assert(pocHistoryRes.body.transactions.length >= 1);
  const foundTx = pocHistoryRes.body.transactions.find(t => t.id === awardRes.body.transaction.id);
  assert(foundTx, 'Awarded transaction must appear in POC point history');
  console.log(`PASS: Domain POC retrieved point history (${pocHistoryRes.body.transactions.length} records)`);

  // 16. MAIN_POC Awarding Cross-Domain Points with Payment/Points Gateway Confirmation
  console.log('\n[16] Testing MAIN_POC Cross-Domain Points Award (Webnexus)...');
  const mainPocAwardRes = await apiRequest('POST', '/api/main-poc/points/award', {
    participantId: participantId,
    domainId: 'Webnexus',
    domainName: 'Webnexus',
    amount: 150,
    reason: 'Grand Fest Hackathon Runner Up',
    gatewayReference: 'GW-CRN-TEST-9988'
  }, supToken);
  assert.strictEqual(mainPocAwardRes.status, 200);
  assert.strictEqual(mainPocAwardRes.body.success, true);
  assert.strictEqual(mainPocAwardRes.body.transaction.gatewayReference, 'GW-CRN-TEST-9988');
  assert.strictEqual(mainPocAwardRes.body.transaction.status, 'SUCCESS');
  console.log(`PASS: Main POC awarded cross-domain points via gateway flow. Ref: ${mainPocAwardRes.body.transaction.gatewayReference}`);

  // 17. Participant Balance & Domain Activity Verification
  console.log('\n[17] Testing Participant Points Balance & Domain Activity Ledger...');
  const partPointsRes = await apiRequest('GET', '/api/participant/points', null, participantToken);
  assert.strictEqual(partPointsRes.status, 200);
  // Expected balance: 50 (welcome bonus) + 100 (Electrizite POC) + 150 (Main POC Webnexus) = 300
  assert.strictEqual(partPointsRes.body.balance, 300, `Expected balance 300, got ${partPointsRes.body.balance}`);
  assert.strictEqual(partPointsRes.body.transactions.length, 3, 'Expected 3 point transactions in ledger');
  console.log(`PASS: Participant has exact 300 CRN balance with all 3 domain activity records.`);

  console.log('\n====================================================');
  console.log('ALL 17 FINAL MASTER VERIFICATION TESTS PASSED!');
  console.log('Roles (PARTICIPANT, DOMAIN_POC, MAIN_POC), 17 domains,');
  console.log('strict isolation & Points/CRN management 100% verified.');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('\nTEST FAILED:', err);
  process.exit(1);
});
