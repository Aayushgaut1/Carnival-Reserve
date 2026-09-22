// tests/registration-platform.test.js - Automated Test Suite for Carnival Reserve Event Platform
const http = require('http');
const assert = require('assert');

function apiRequest(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: endpoint,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {})
      }
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
  console.log('RUNNING CARNIVAL RESERVE REGISTRATION PLATFORM TESTS');
  console.log('====================================================');

  const ts = Date.now();
  const testUser = {
    name: 'Aarav Sharma',
    email: `aarav_${ts}@srmist.edu.in`,
    phone: '98' + String(ts).slice(-8),
    college: 'SRM Institute of Science and Technology',
    regNo: 'RA' + String(ts).slice(-10),
    password: 'SecureFestPassword2026!',
    confirmPassword: 'SecureFestPassword2026!',
    termsAccepted: true
  };

  // Test 1: Frontend Server Verification
  console.log('\n[1] Testing Frontend Serving at / ...');
  const frontRes = await apiRequest('GET', '/');
  assert.strictEqual(frontRes.status, 200, 'Frontend should respond with 200 OK');
  assert(frontRes.raw.includes('CARNIVAL RESERVE'), 'Page should include Carnival Reserve branding');
  assert(frontRes.raw.includes('17 Domains'), 'Page should feature 17 Domains');
  assert(frontRes.raw.includes('My Registrations'), 'Page should feature My Registrations navigation');
  assert(!frontRes.raw.includes('Domain Desk'), 'Page should NOT have old Domain Desk complexity');
  assert(!frontRes.raw.includes('Super Admin'), 'Page should NOT have Super Admin operational bar');
  console.log('✓ PASS: Frontend served cleanly with streamlined Event Registration portal');

  // Test 2: User Registration
  console.log('\n[2] Testing User Account Registration...');
  const regRes = await apiRequest('POST', '/api/auth/register', testUser);
  assert.strictEqual(regRes.status, 201, 'Registration should return 201 Created');
  assert.strictEqual(regRes.body.success, true, 'Registration response should be success');
  assert(regRes.body.user.id.startsWith('CR-'), 'User ID should be generated (CR-XXXXXX)');
  assert.strictEqual(regRes.body.user.email, testUser.email.toLowerCase(), 'Email should match');
  console.log(`✓ PASS: User registered successfully (User ID: ${regRes.body.user.id})`);

  const userId = regRes.body.user.id;

  // Test 3: Duplicate Email Check
  console.log('\n[3] Testing Duplicate Account Rejection...');
  const dupUserRes = await apiRequest('POST', '/api/auth/register', testUser);
  assert.strictEqual(dupUserRes.status, 409, 'Duplicate registration should return 409 Conflict');
  assert.strictEqual(dupUserRes.body.error, 'EMAIL_ALREADY_REGISTERED', 'Should reject with EMAIL_ALREADY_REGISTERED');
  console.log('✓ PASS: Duplicate account creation safely rejected');

  // Test 4: Password Login
  console.log('\n[4] Testing User Login with Password...');
  const loginRes = await apiRequest('POST', '/api/auth/login', {
    identifier: testUser.email,
    password: testUser.password
  });
  assert.strictEqual(loginRes.status, 200, 'Login should return 200 OK');
  assert.strictEqual(loginRes.body.success, true, 'Login should succeed');
  assert.strictEqual(loginRes.body.user.id, userId, 'Logged in user ID should match');
  console.log(`✓ PASS: User logged in successfully as ${loginRes.body.user.name}`);

  // Test 5: Initial Registrations (Count 0)
  console.log('\n[5] Verifying Initial Domain Registrations (Count 0)...');
  const initialRegsRes = await apiRequest('GET', `/api/user/registrations?userId=${userId}`);
  assert.strictEqual(initialRegsRes.status, 200, 'Should return 200 OK');
  assert.strictEqual(initialRegsRes.body.registrations.length, 0, 'New user should have 0 domain registrations');
  console.log('✓ PASS: Initial registrations list is empty');

  // Test 6: Domain Registration 1 (Agritech)
  console.log('\n[6] Registering for Domain 1 (Agritech)...');
  const dom1Res = await apiRequest('POST', '/api/domains/register', {
    userId: userId,
    domainId: 'Agritech',
    domainName: 'Agritech',
    teamName: 'Green Innovators',
    teamMembers: 'Aarav Sharma, Priya Patel'
  });
  assert.strictEqual(dom1Res.status, 201, 'Domain registration should return 201 Created');
  assert.strictEqual(dom1Res.body.success, true, 'Domain registration should succeed');
  assert(dom1Res.body.registration.id.startsWith('REG-'), 'Ticket ID should start with REG-');
  assert.strictEqual(dom1Res.body.registration.domainName, 'Agritech', 'Domain name should match');
  assert.strictEqual(dom1Res.body.registration.status, 'CONFIRMED', 'Status should be CONFIRMED');
  const ticket1 = dom1Res.body.registration.id;
  console.log(`✓ PASS: Domain 1 registered successfully with Ticket ID: ${ticket1}`);

  // Test 7: Duplicate Domain Registration Rejection (Strict requirement)
  console.log('\n[7] Testing DUPLICATE Domain Registration Rejection for Agritech...');
  const dupDomRes = await apiRequest('POST', '/api/domains/register', {
    userId: userId,
    domainId: 'Agritech',
    domainName: 'Agritech',
    teamName: 'Another Team',
    teamMembers: 'Aarav Sharma'
  });
  assert.strictEqual(dupDomRes.status, 409, 'Duplicate domain registration must return 409 Conflict');
  assert.strictEqual(dupDomRes.body.error, 'ALREADY_REGISTERED', 'Error code must be ALREADY_REGISTERED');
  console.log('✓ PASS: Duplicate registration for the same domain strictly blocked by backend');

  // Test 8: Register for Second Domain (Webnexus)
  console.log('\n[8] Registering for Domain 2 (Webnexus - Solo)...');
  const dom2Res = await apiRequest('POST', '/api/domains/register', {
    userId: userId,
    domainId: 'Webnexus',
    domainName: 'Webnexus',
    teamName: '',
    teamMembers: ''
  });
  assert.strictEqual(dom2Res.status, 201, 'Second domain registration should return 201');
  assert.strictEqual(dom2Res.body.registration.domainName, 'Webnexus');
  const ticket2 = dom2Res.body.registration.id;
  console.log(`✓ PASS: Domain 2 registered successfully with Ticket ID: ${ticket2}`);

  // Test 9: Register for Third Domain (Robogyan)
  console.log('\n[9] Registering for Domain 3 (Robogyan - Team)...');
  const dom3Res = await apiRequest('POST', '/api/domains/register', {
    userId: userId,
    domainId: 'Robogyan',
    domainName: 'Robogyan',
    teamName: 'Mecha Titans',
    teamMembers: 'Aarav, Arjun, Dev'
  });
  assert.strictEqual(dom3Res.status, 201, 'Third domain registration should return 201');
  const ticket3 = dom3Res.body.registration.id;
  console.log(`✓ PASS: Domain 3 registered successfully with Ticket ID: ${ticket3}`);

  // Test 10: Fetching All User Registrations
  console.log('\n[10] Verifying Total User Registrations...');
  const finalRegsRes = await apiRequest('GET', `/api/user/registrations?userId=${userId}`);
  assert.strictEqual(finalRegsRes.status, 200);
  assert.strictEqual(finalRegsRes.body.registrations.length, 3, 'User should have exactly 3 registered domains');
  
  const registeredNames = finalRegsRes.body.registrations.map(r => r.domainName);
  assert(registeredNames.includes('Agritech'), 'Must include Agritech');
  assert(registeredNames.includes('Webnexus'), 'Must include Webnexus');
  assert(registeredNames.includes('Robogyan'), 'Must include Robogyan');
  console.log(`✓ PASS: Confirmed domains retrieved: ${registeredNames.join(', ')}`);

  // Test 11: Independent User Can Also Register for Same Domain
  console.log('\n[11] Verifying a DIFFERENT user can register for Agritech...');
  const ts2 = Date.now() + 100;
  const secondUser = {
    name: 'Diya Sen',
    email: `diya_${ts2}@srmist.edu.in`,
    phone: '97' + String(ts2).slice(-8),
    college: 'SRM Institute of Science and Technology',
    regNo: 'RA' + String(ts2).slice(-10),
    password: 'DiyaPassword2026!',
    confirmPassword: 'DiyaPassword2026!',
    termsAccepted: true
  };
  const regUser2 = await apiRequest('POST', '/api/auth/register', secondUser);
  assert.strictEqual(regUser2.status, 201);
  const user2Id = regUser2.body.user.id;

  const user2DomRes = await apiRequest('POST', '/api/domains/register', {
    userId: user2Id,
    domainId: 'Agritech',
    domainName: 'Agritech',
    teamName: 'Bio Agro Labs'
  });
  assert.strictEqual(user2DomRes.status, 201, 'Different user should be able to register for Agritech');
  console.log(`✓ PASS: Different user (${user2Id}) successfully registered for Agritech with Ticket: ${user2DomRes.body.registration.id}`);

  console.log('\n====================================================');
  console.log('ALL 11 TEST CASES PASSED SUCCESSFULLY!');
  console.log('CARNIVAL RESERVE SIMPLIFICATION COMPLETE AND VERIFIED');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
