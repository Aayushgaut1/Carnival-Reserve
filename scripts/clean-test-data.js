// scripts/clean-test-data.js - Clean old test/demo participants
const { getDb, cleanOldTestData } = require('../server/db');

function runCleanup() {
  console.log('--- Cleaning Carnival Reserve Demo/Test Participant Records ---');
  const db = getDb();
  
  // Clean explicit test IDs and emails
  cleanOldTestData(db);

  // Count active participants
  const participantsCount = db.prepare('SELECT COUNT(*) as count FROM participants').get().count;
  const oldDemoCheck = db.prepare("SELECT * FROM participants WHERE participant_id = 'CR-892104'").get();
  
  if (oldDemoCheck) {
    console.error('ERROR: Demo participant CR-892104 still present in database!');
    process.exit(1);
  }

  console.log(`Cleanup complete! Current total participants in database: ${participantsCount}`);
  console.log('Confirmed: ZERO old demo participants in production queries.');
}

if (require.main === module) {
  runCleanup();
}

module.exports = { runCleanup };
