// server/domain-reward.js - Domain Incharge, Domain Manager & 4,000 Crn Rewards Engine
const crypto = require('crypto');
const { recordAuditLog } = require('./db');

/**
 * Process domain credit with strict 4,000 Crn domain-level budget pool,
 * 50–250 Crn per-transaction reward limit, and Domain Manager 1-to-1 domain scoping.
 */
function processDomainCredit(db, { managerId, domainName, participantQrOrId, amount = null, isWinner = false, idempotencyKey = null }) {
  if (!managerId) {
    return { success: false, error: 'MANAGER_AUTH_REQUIRED', message: 'Manager identification is required.', status: 401 };
  }
  if (!domainName) {
    return { success: false, error: 'DOMAIN_NAME_REQUIRED', message: 'Domain name is required.', status: 400 };
  }
  if (!participantQrOrId) {
    return { success: false, error: 'PARTICIPANT_IDENTIFIER_REQUIRED', message: 'Participant QR code or ID is required.', status: 400 };
  }

  // 1. Reward Amount Validation (Strictly 50 - 250 Crn)
  let rewardAmount = 50;
  if (amount !== null && amount !== undefined) {
    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || !Number.isInteger(parsedAmount)) {
      return {
        success: false,
        error: 'INVALID_REWARD_AMOUNT',
        message: 'Individual reward amount must be an integer between 50 and 250 Crn.',
        status: 400
      };
    }
    if (parsedAmount > 250) {
      return {
        success: false,
        error: 'REWARD_AMOUNT_EXCEEDS_MAXIMUM',
        message: 'Individual reward amount cannot exceed 250 Crn.',
        status: 400
      };
    }
    if (parsedAmount < 50) {
      return {
        success: false,
        error: 'REWARD_AMOUNT_BELOW_MINIMUM',
        message: 'Individual reward amount cannot be less than 50 Crn.',
        status: 400
      };
    }
    rewardAmount = parsedAmount;
  } else if (isWinner) {
    rewardAmount = 250;
  }

  // 2. Server-Side Domain Authorization
  // Super Admin can operate any domain; Domain Manager can ONLY operate their assigned domain
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(managerId);
  const isSuperAdmin = user && user.role === 'SUPER_ADMIN';

  if (!user) {
    return { success: false, error: 'MANAGER_NOT_FOUND', message: 'Staff credentials could not be verified.', status: 404 };
  }

  if (!isSuperAdmin && user.role !== 'DOMAIN_MANAGER') {
    return {
      success: false,
      error: 'ROLE_NOT_AUTHORIZED',
      message: `Role "${user.role}" is not authorized to issue domain rewards.`,
      status: 403
    };
  }

  const budget = db.prepare(`
    SELECT * FROM domain_reward_budgets 
    WHERE domain_name = ? OR domain_id = ?
  `).get(domainName, domainName);

  if (!budget) {
    return { success: false, error: 'DOMAIN_BUDGET_NOT_FOUND', message: `No budget record found for domain ${domainName}.`, status: 404 };
  }

  if (!isSuperAdmin) {
    const assignedDomain = user ? user.assigned_domain : null;
    const isAuthorized = (budget.manager_id === managerId) || (assignedDomain && (assignedDomain === domainName || assignedDomain === budget.domain_name));
    if (!isAuthorized) {
      return {
        success: false,
        error: 'DOMAIN_NOT_AUTHORIZED',
        message: `Domain Manager ${managerId} is not authorized to issue rewards for ${domainName}.`,
        status: 403
      };
    }
  }

  // 3. Domain Reward Budget Pool Check (4,000 Crn Finite Pool)
  if (budget.remaining_amount < rewardAmount) {
    return {
      success: false,
      error: 'DOMAIN_BUDGET_EXCEEDED',
      message: `Requested reward (${rewardAmount} Crn) exceeds remaining domain budget (${budget.remaining_amount} Crn).`,
      status: 400,
      remainingBudget: budget.remaining_amount
    };
  }

  // 4. Participant Lookup
  const participant = db.prepare(`
    SELECT * FROM participants 
    WHERE (qr_code = ? OR participant_id = ? OR id = ?) AND status = 'ACTIVE'
  `).get(participantQrOrId, participantQrOrId, participantQrOrId);

  if (!participant) {
    return { success: false, error: 'PARTICIPANT_NOT_FOUND', message: 'Active participant not found.', status: 404 };
  }

  // 5. Idempotency Check (Duplicate request protection)
  const effectiveIdempotencyKey = idempotencyKey || `TX-${participant.participant_id}-${domainName.replace(/\s+/g, '_')}-${rewardAmount}`;
  const existingTx = db.prepare('SELECT * FROM transactions WHERE idempotency_key = ?').get(effectiveIdempotencyKey);
  if (existingTx) {
    const wallet = db.prepare('SELECT balance FROM wallets WHERE participant_id = ?').get(participant.id);
    return {
      success: true,
      alreadyProcessed: true,
      message: 'Transaction already processed (idempotent duplicate request).',
      transaction: existingTx,
      balance: wallet ? wallet.balance : 0
    };
  }

  // 6. One-Reward-Per-Domain Rule (Cannot receive repeated domain rewards)
  const passport = db.prepare('SELECT * FROM passports WHERE participant_id = ?').get(participant.id);
  if (!passport) {
    return { success: false, error: 'PASSPORT_NOT_FOUND', message: 'Participant passport not found.', status: 404 };
  }

  const existingStamp = db.prepare('SELECT * FROM passport_stamps WHERE passport_id = ? AND domain_name = ?').get(passport.id, domainName);
  if (existingStamp) {
    return {
      success: false,
      error: 'DOMAIN_ALREADY_COMPLETED',
      message: `Domain ${domainName} has already been completed by this participant.`,
      status: 409
    };
  }

  // 7. Atomic Execution (Deduct Budget + Credit Wallet + Add Stamp + Record Immutable Transaction + Audit)
  const transactionType = rewardAmount >= 200 ? 'WINNER_CREDIT' : 'PARTICIPATION_CREDIT';
  const now = new Date().toISOString();
  const txId = 'CRTX-' + crypto.randomUUID().substring(0, 8).toUpperCase();
  const stampId = 'stamp-' + crypto.randomUUID();

  let participantBalanceBefore = 0;
  let participantBalanceAfter = 0;
  let domainBudgetBefore = budget.remaining_amount;
  let domainBudgetAfter = budget.remaining_amount - rewardAmount;

  db.exec('BEGIN TRANSACTION;');
  try {
    const wallet = db.prepare('SELECT * FROM wallets WHERE participant_id = ?').get(participant.id);
    if (!wallet) throw new Error('Wallet not found');

    participantBalanceBefore = wallet.balance;
    participantBalanceAfter = wallet.balance + rewardAmount;

    // 1. Deduct Domain Budget (Ensure never negative)
    db.prepare(`
      UPDATE domain_reward_budgets 
      SET issued_amount = issued_amount + ?, remaining_amount = remaining_amount - ?, updated_at = ?
      WHERE id = ?
    `).run(rewardAmount, rewardAmount, now, budget.id);

    // 2. Credit Participant Wallet
    db.prepare(`
      UPDATE wallets 
      SET balance = balance + ?, total_earned = total_earned + ?, updated_at = ? 
      WHERE id = ?
    `).run(rewardAmount, rewardAmount, now, wallet.id);

    // 3. Record Passport Stamp
    db.prepare(`
      INSERT INTO passport_stamps (id, passport_id, domain_name, claimed_at, is_winner)
      VALUES (?, ?, ?, ?, ?)
    `).run(stampId, passport.id, domainName, now, rewardAmount >= 200 ? 1 : 0);

    // 4. Record Immutable Wallet Transaction with Balances Before/After
    db.prepare(`
      INSERT INTO transactions (
        id, idempotency_key, amount, type, from_account_id, to_account_id,
        participant_id, manager_id, domain_name,
        participant_balance_before, participant_balance_after,
        domain_budget_before, domain_budget_after, status, reason, timestamp
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUCCESS', ?, ?)
    `).run(
      txId, effectiveIdempotencyKey, rewardAmount, transactionType, budget.domain_id, wallet.id,
      participant.id, managerId, domainName,
      participantBalanceBefore, participantBalanceAfter,
      domainBudgetBefore, domainBudgetAfter, `${domainName} Reward (${rewardAmount} Crn)`, now
    );

    // 5. Append-only Audit Log
    recordAuditLog(db, {
      actorId: managerId,
      actorRole: user ? user.role : 'DOMAIN_MANAGER',
      domainId: budget.domain_id,
      participantId: participant.id,
      transactionId: txId,
      amount: rewardAmount,
      action: 'REWARD_CREDITED',
      reason: `Reward issued for ${domainName}`,
      beforeVal: { participantBalance: participantBalanceBefore, domainBudget: domainBudgetBefore },
      afterVal: { participantBalance: participantBalanceAfter, domainBudget: domainBudgetAfter }
    });

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  const completedCount = db.prepare('SELECT COUNT(*) as c FROM passport_stamps WHERE passport_id = ?').get(passport.id).c;

  return {
    success: true,
    message: `✓ Reward of +${rewardAmount} Crn successfully credited for ${domainName}!`,
    rewardAmount,
    newBalance: participantBalanceAfter,
    participantName: participant.name,
    participantId: participant.participant_id,
    domainName,
    domainRemainingBudget: domainBudgetAfter,
    domainIssuedAmount: budget.issued_amount + rewardAmount,
    completedCount,
    totalRequired: 17,
    transactionId: txId,
    timestamp: now
  };
}

/**
 * Get domain reward budget status for a Domain Manager
 */
function getDomainBudget(db, managerIdOrDomainId) {
  const budget = db.prepare(`
    SELECT * FROM domain_reward_budgets 
    WHERE manager_id = ? OR domain_id = ? OR domain_name = ?
  `).get(managerIdOrDomainId, managerIdOrDomainId, managerIdOrDomainId);

  if (!budget) return null;

  const countRow = db.prepare(`
    SELECT COUNT(DISTINCT participant_id) as count 
    FROM transactions 
    WHERE (manager_id = ? OR domain_name = ?) AND type IN ('PARTICIPATION_CREDIT', 'WINNER_CREDIT')
  `).get(budget.manager_id, budget.domain_name);

  return {
    id: budget.id,
    domainId: budget.domain_id,
    domainName: budget.domain_name,
    managerId: budget.manager_id,
    allocatedAmount: budget.allocated_amount,
    issuedAmount: budget.issued_amount,
    remainingAmount: budget.remaining_amount,
    participantsRewarded: countRow ? countRow.count : 0,
    isLowBudget: budget.remaining_amount <= 500 && budget.remaining_amount > 0,
    isExhausted: budget.remaining_amount <= 0
  };
}

/**
 * Get recent transactions for a Domain Manager's domain
 */
function getDomainTransactions(db, managerIdOrDomainName, limit = 15) {
  const rows = db.prepare(`
    SELECT t.id, t.amount, t.type, t.timestamp, t.participant_id, t.status,
      t.participant_balance_before, t.participant_balance_after,
      t.domain_budget_before, t.domain_budget_after,
      p.name as participant_name, p.participant_id as public_id
    FROM transactions t
    LEFT JOIN participants p ON t.participant_id = p.id
    WHERE (t.manager_id = ? OR t.from_account_id = ? OR t.domain_name = ?) AND t.type IN ('PARTICIPATION_CREDIT', 'WINNER_CREDIT')
    ORDER BY t.timestamp DESC
    LIMIT ?
  `).all(managerIdOrDomainName, managerIdOrDomainName, managerIdOrDomainName, limit);

  return rows.map(r => ({
    id: r.id,
    amount: r.amount,
    type: r.type,
    timestamp: r.timestamp,
    status: r.status || 'SUCCESS',
    participantName: r.participant_name || 'Participant',
    participantId: r.public_id || r.participant_id,
    participantBalanceBefore: r.participant_balance_before,
    participantBalanceAfter: r.participant_balance_after,
    domainBudgetBefore: r.domain_budget_before,
    domainBudgetAfter: r.domain_budget_after
  }));
}

/**
 * Super Admin: Get all 17 domain budgets
 */
function getAllDomainBudgets(db) {
  const rows = db.prepare(`
    SELECT b.*, u.name as manager_name,
      (SELECT COUNT(DISTINCT t.participant_id) FROM transactions t WHERE t.manager_id = b.manager_id OR t.domain_name = b.domain_name) as participants_rewarded,
      (SELECT COUNT(*) FROM transactions t WHERE t.manager_id = b.manager_id OR t.domain_name = b.domain_name) as total_txs
    FROM domain_reward_budgets b
    LEFT JOIN users u ON b.manager_id = u.id
    ORDER BY b.domain_id ASC
  `).all();

  const totalAllocated = rows.reduce((sum, r) => sum + r.allocated_amount, 0);
  const totalIssued = rows.reduce((sum, r) => sum + r.issued_amount, 0);
  const totalRemaining = rows.reduce((sum, r) => sum + r.remaining_amount, 0);

  return {
    domains: rows.map(r => ({
      domainId: r.domain_id,
      domainName: r.domain_name,
      managerId: r.manager_id,
      managerName: r.manager_name || r.manager_id,
      allocatedAmount: r.allocated_amount,
      issuedAmount: r.issued_amount,
      remainingAmount: r.remaining_amount,
      participantsRewarded: r.participants_rewarded || 0,
      totalTransactions: r.total_txs || 0,
      isLow: r.remaining_amount <= 500 && r.remaining_amount > 0,
      isExhausted: r.remaining_amount <= 0
    })),
    summary: {
      totalDomains: rows.length,
      totalAllocated,
      totalIssued,
      totalRemaining
    }
  };
}

/**
 * Central Domain Incharge: Comprehensive Oversight Dashboard
 * Calculates global budget dynamically from active domains count: activeDomains * 4000
 */
function getDomainInchargeDashboard(db) {
  // 1. Dynamic active domains count
  const activeDomainsRow = db.prepare('SELECT COUNT(*) as c FROM domain_treasuries WHERE active = 1').get();
  const activeDomainsCount = activeDomainsRow ? activeDomainsRow.c : 17;
  const totalAllocated = activeDomainsCount * 4000;

  const totals = db.prepare(`
    SELECT 
      COALESCE(SUM(issued_amount), 0) as totalIssued,
      COALESCE(SUM(remaining_amount), 0) as totalRemaining
    FROM domain_reward_budgets
  `).get();

  const totalParticipantsRewarded = db.prepare(`
    SELECT COUNT(DISTINCT participant_id) as c 
    FROM transactions 
    WHERE type IN ('PARTICIPATION_CREDIT', 'WINNER_CREDIT')
  `).get().c || 0;

  const totalTransactions = db.prepare(`
    SELECT COUNT(*) as c 
    FROM transactions 
    WHERE type IN ('PARTICIPATION_CREDIT', 'WINNER_CREDIT')
  `).get().c || 0;

  const activeManagersCount = db.prepare(`
    SELECT COUNT(DISTINCT manager_id) as c 
    FROM domain_reward_budgets 
    WHERE manager_id IS NOT NULL
  `).get().c || 0;

  const domainsExhausted = db.prepare(`
    SELECT COUNT(*) as c 
    FROM domain_reward_budgets 
    WHERE remaining_amount <= 0
  `).get().c || 0;

  const domainsLowBalance = db.prepare(`
    SELECT COUNT(*) as c 
    FROM domain_reward_budgets 
    WHERE remaining_amount <= 500 AND remaining_amount > 0
  `).get().c || 0;

  // 2. All 17 Domains list
  const domainRows = db.prepare(`
    SELECT b.*, u.name as manager_name, u.email as manager_email,
      (SELECT COUNT(DISTINCT t.participant_id) FROM transactions t WHERE t.domain_name = b.domain_name OR t.manager_id = b.manager_id) as participants_rewarded,
      (SELECT COUNT(*) FROM transactions t WHERE t.domain_name = b.domain_name OR t.manager_id = b.manager_id) as total_txs
    FROM domain_reward_budgets b
    LEFT JOIN users u ON b.manager_id = u.id
    ORDER BY b.domain_id ASC
  `).all();

  const domains = domainRows.map(r => {
    let status = 'ACTIVE';
    if (r.remaining_amount <= 0) status = 'EXHAUSTED';
    else if (r.remaining_amount <= 500) status = 'LOW_BALANCE';

    return {
      domainId: r.domain_id,
      domainName: r.domain_name,
      managerId: r.manager_id,
      managerName: r.manager_name || 'Assigned Manager',
      managerEmail: r.manager_email || '',
      allocatedAmount: r.allocated_amount,
      issuedAmount: r.issued_amount,
      remainingAmount: r.remaining_amount,
      percentSpent: Math.round((r.issued_amount / r.allocated_amount) * 100),
      status,
      participantsRewarded: r.participants_rewarded || 0,
      totalTransactions: r.total_txs || 0,
      isExhausted: r.remaining_amount <= 0,
      isLowBalance: r.remaining_amount <= 500 && r.remaining_amount > 0
    };
  });

  // 3. Misuse / Anomaly Monitoring Indicators (Neutral Wording)
  const misuseAlerts = [];

  for (const d of domains) {
    if (d.isExhausted) {
      misuseAlerts.push({
        type: 'BUDGET DEPLETION RATE',
        domainName: d.domainName,
        message: `${d.domainName} budget is completely exhausted (0 / 4,000 Crn remaining).`,
        severity: 'alert'
      });
    } else if (d.percentSpent >= 75) {
      misuseAlerts.push({
        type: 'BUDGET DEPLETION RATE',
        domainName: d.domainName,
        message: `${d.domainName} has expended ${d.percentSpent}% of its 4,000 Crn budget (${d.remainingAmount} Crn remaining).`,
        severity: 'warning'
      });
    }
  }

  const highVolume = db.prepare(`
    SELECT domain_name, COUNT(*) as tx_count
    FROM transactions
    WHERE type IN ('PARTICIPATION_CREDIT', 'WINNER_CREDIT')
    GROUP BY domain_name
    HAVING tx_count >= 10
  `).all();
  for (const hv of highVolume) {
    misuseAlerts.push({
      type: 'HIGH TRANSACTION VOLUME',
      domainName: hv.domain_name,
      message: `${hv.domain_name} recorded ${hv.tx_count} rewards issued. High transaction activity recorded.`,
      severity: 'info'
    });
  }

  const repeatedParticipants = db.prepare(`
    SELECT p.participant_id, p.name, COUNT(*) as visits
    FROM transactions t
    JOIN participants p ON t.participant_id = p.id
    WHERE t.type IN ('PARTICIPATION_CREDIT', 'WINNER_CREDIT')
    GROUP BY t.participant_id
    HAVING visits >= 5
  `).all();
  for (const rp of repeatedParticipants) {
    misuseAlerts.push({
      type: 'REPEATED PARTICIPANT ACTIVITY',
      participantId: rp.participant_id,
      message: `Participant ${rp.name} (${rp.participant_id}) has visited ${rp.visits} domains.`,
      severity: 'info'
    });
  }

  if (misuseAlerts.length === 0) {
    misuseAlerts.push({
      type: 'ACTIVITY REVIEW',
      domainName: 'All Domains',
      message: 'All 17 domain treasuries operating within normal parameters. No unusual transaction volume detected.',
      severity: 'normal'
    });
  }

  // 4. Global Recent Transactions across all domains with balance snapshots
  const recentTransactions = db.prepare(`
    SELECT t.id, t.amount, t.type, t.domain_name, t.timestamp, t.status,
      t.participant_balance_before, t.participant_balance_after,
      t.domain_budget_before, t.domain_budget_after, t.idempotency_key,
      p.name as participant_name, p.participant_id as public_id,
      u.name as manager_name
    FROM transactions t
    LEFT JOIN participants p ON t.participant_id = p.id
    LEFT JOIN users u ON t.manager_id = u.id
    WHERE t.type IN ('PARTICIPATION_CREDIT', 'WINNER_CREDIT', 'ADMIN_CORRECTION')
    ORDER BY t.timestamp DESC
    LIMIT 30
  `).all().map(r => ({
    transactionId: r.id,
    amount: r.amount,
    type: r.type,
    domainName: r.domain_name || 'Domain',
    managerName: r.manager_name || 'Domain Manager',
    participantName: r.participant_name || 'Participant',
    participantId: r.public_id || '',
    participantBalanceBefore: r.participant_balance_before != null ? r.participant_balance_before : '-',
    participantBalanceAfter: r.participant_balance_after != null ? r.participant_balance_after : '-',
    domainBudgetBefore: r.domain_budget_before != null ? r.domain_budget_before : '-',
    domainBudgetAfter: r.domain_budget_after != null ? r.domain_budget_after : '-',
    timestamp: r.timestamp,
    status: r.status || 'SUCCESS',
    idempotencyKey: r.idempotency_key
  }));

  const anomalyIndicators = [
    { key: 'ACTIVITY_REVIEW', label: 'Activity Review', count: misuseAlerts.filter(a => a.type === 'ACTIVITY REVIEW').length, status: 'NORMAL' },
    { key: 'HIGH_TRANSACTION_VOLUME', label: 'High Transaction Volume', count: misuseAlerts.filter(a => a.type === 'HIGH TRANSACTION VOLUME').length, status: 'MONITORED' },
    { key: 'REPEATED_PARTICIPANT_ACTIVITY', label: 'Repeated Participant Activity', count: misuseAlerts.filter(a => a.type === 'REPEATED PARTICIPANT ACTIVITY').length, status: 'MONITORED' },
    { key: 'BUDGET_DEPLETION_RATE', label: 'Budget Depletion Rate', count: misuseAlerts.filter(a => a.type === 'BUDGET DEPLETION RATE').length, status: 'ALERT' },
    { key: 'PENDING_REVIEW', label: 'Pending Review', count: 0, status: 'CLEARED' }
  ];

  return {
    summary: {
      totalDomains: activeDomainsCount,
      totalAllocated,
      totalIssued: totals.totalIssued,
      totalRemaining: totals.totalRemaining,
      totalParticipantsRewarded,
      totalTransactions,
      activeManagers: activeManagersCount,
      domainsExhausted,
      domainsLowBalance
    },
    domains,
    misuseAlerts,
    anomalyIndicators,
    recentTransactions
  };
}

/**
 * Filtered Transactions Query for Domain Incharge & Super Admin
 */
function getFilteredTransactions(db, { domainName, managerId, participantId, amount, status, type, limit = 50 }) {
  let query = `
    SELECT t.id, t.amount, t.type, t.domain_name, t.timestamp, t.status,
      t.participant_balance_before, t.participant_balance_after,
      t.domain_budget_before, t.domain_budget_after, t.idempotency_key,
      p.name as participant_name, p.participant_id as public_id,
      u.name as manager_name
    FROM transactions t
    LEFT JOIN participants p ON t.participant_id = p.id
    LEFT JOIN users u ON t.manager_id = u.id
    WHERE 1=1
  `;
  const params = [];
  if (domainName) {
    query += ' AND (t.domain_name = ? OR t.domain_name LIKE ?)';
    params.push(domainName, `%${domainName}%`);
  }
  if (managerId) {
    query += ' AND (t.manager_id = ? OR u.name LIKE ?)';
    params.push(managerId, `%${managerId}%`);
  }
  if (participantId) {
    query += ' AND (p.participant_id = ? OR p.participant_id LIKE ? OR p.name LIKE ?)';
    params.push(participantId, `%${participantId}%`, `%${participantId}%`);
  }
  if (amount) {
    query += ' AND t.amount = ?';
    params.push(Number(amount));
  }
  if (status) {
    query += ' AND t.status = ?';
    params.push(status);
  }
  if (type) {
    query += ' AND t.type = ?';
    params.push(type);
  }
  query += ' ORDER BY t.timestamp DESC LIMIT ?';
  params.push(Number(limit) || 50);

  const rows = db.prepare(query).all(...params);
  return rows.map(r => ({
    transactionId: r.id,
    amount: r.amount,
    type: r.type,
    domainName: r.domain_name,
    managerName: r.manager_name || 'Manager',
    participantName: r.participant_name || 'Participant',
    participantId: r.public_id || '',
    participantBalanceBefore: r.participant_balance_before,
    participantBalanceAfter: r.participant_balance_after,
    domainBudgetBefore: r.domain_budget_before,
    domainBudgetAfter: r.domain_budget_after,
    timestamp: r.timestamp,
    status: r.status,
    idempotencyKey: r.idempotency_key
  }));
}

/**
 * Deep Transaction Inspection
 */
function getTransactionDetails(db, txId) {
  const tx = db.prepare(`
    SELECT t.*, p.name as participant_name, p.participant_id as public_id, p.email as participant_email,
      u.name as manager_name, u.email as manager_email,
      ps.id as stamp_id
    FROM transactions t
    LEFT JOIN participants p ON t.participant_id = p.id
    LEFT JOIN users u ON t.manager_id = u.id
    LEFT JOIN passports pass ON pass.participant_id = p.id
    LEFT JOIN passport_stamps ps ON ps.passport_id = pass.id AND ps.domain_name = t.domain_name
    WHERE t.id = ? OR t.idempotency_key = ?
  `).get(txId, txId);

  if (!tx) return null;

  const auditRows = db.prepare(`
    SELECT * FROM audit_logs WHERE transaction_id = ? ORDER BY timestamp ASC
  `).all(tx.id);

  return {
    transaction: {
      id: tx.id,
      idempotencyKey: tx.idempotency_key,
      amount: tx.amount,
      type: tx.type,
      domainName: tx.domain_name,
      status: tx.status,
      timestamp: tx.timestamp,
      participantBalanceBefore: tx.participant_balance_before,
      participantBalanceAfter: tx.participant_balance_after,
      domainBudgetBefore: tx.domain_budget_before,
      domainBudgetAfter: tx.domain_budget_after,
      reason: tx.reason,
      hasPassportStamp: !!tx.stamp_id
    },
    participant: {
      id: tx.public_id,
      name: tx.participant_name,
      email: tx.participant_email
    },
    manager: {
      id: tx.manager_id,
      name: tx.manager_name,
      email: tx.manager_email
    },
    auditTrail: auditRows
  };
}

/**
 * Super Admin: Assign or Replace Domain Manager
 * The new manager continues using the same domain budget. The budget does NOT reset.
 */
function assignDomainManager(db, params) {
  const adminId = params.adminId || params.superAdminId;
  const newManagerId = params.newManagerId || params.managerId;
  const newManagerName = params.newManagerName || params.name;
  const newManagerEmail = params.newManagerEmail || params.email;
  const domainName = params.domainName;
  const reason = params.reason;

  const admin = db.prepare('SELECT * FROM users WHERE id = ?').get(adminId);
  if (!admin || admin.role !== 'SUPER_ADMIN') {
    return { error: 'UNAUTHORIZED_ADMIN', message: 'Only Super Admin can assign Domain Managers.', status: 403 };
  }

  const budget = db.prepare('SELECT * FROM domain_reward_budgets WHERE domain_name = ?').get(domainName);
  if (!budget) {
    return { error: 'DOMAIN_NOT_FOUND', message: `Domain ${domainName} not found.`, status: 404 };
  }

  const oldManagerId = budget.manager_id;
  const now = new Date().toISOString();

  db.exec('BEGIN TRANSACTION;');
  try {
    // 1. Upsert user
    db.prepare(`
      INSERT OR REPLACE INTO users (id, email, name, role, assigned_domain)
      VALUES (?, ?, ?, 'DOMAIN_MANAGER', ?)
    `).run(newManagerId, newManagerEmail || `${newManagerId}@aaruush.org`, newManagerName || `${domainName} Manager`, domainName);

    // 2. Update Domain Budget manager assignment (Preserves budget!)
    db.prepare(`
      UPDATE domain_reward_budgets SET manager_id = ?, updated_at = ? WHERE domain_name = ?
    `).run(newManagerId, now, domainName);

    // 3. Update Domain Treasury
    db.prepare(`
      UPDATE domain_treasuries SET manager_id = ? WHERE domain_name = ?
    `).run(newManagerId, domainName);

    // 4. Record Audit Log
    recordAuditLog(db, {
      actorId: adminId,
      actorRole: 'SUPER_ADMIN',
      domainId: budget.domain_id,
      action: 'MANAGER_ASSIGNED',
      reason: reason || `Domain Manager reassignment for ${domainName}`,
      beforeVal: { managerId: oldManagerId },
      afterVal: { managerId: newManagerId }
    });

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  return {
    success: true,
    message: `Domain Manager for ${domainName} successfully assigned to ${newManagerName || newManagerId}.`,
    domainName,
    newManagerId
  };
}

/**
 * Super Admin: Assign Domain Incharge
 */
function assignDomainIncharge(db, params) {
  const adminId = params.adminId || params.superAdminId;
  const inchargeId = params.inchargeId;
  const inchargeName = params.inchargeName || params.name;
  const inchargeEmail = params.inchargeEmail || params.email;
  const reason = params.reason;

  const admin = db.prepare('SELECT * FROM users WHERE id = ?').get(adminId);
  if (!admin || admin.role !== 'SUPER_ADMIN') {
    return { error: 'UNAUTHORIZED_ADMIN', message: 'Only Super Admin can assign Domain Incharge.', status: 403 };
  }

  const oldIncharge = db.prepare("SELECT * FROM users WHERE role = 'DOMAIN_INCHARGE'").get();

  db.exec('BEGIN TRANSACTION;');
  try {
    // Upsert new incharge
    db.prepare(`
      INSERT OR REPLACE INTO users (id, email, name, role, assigned_domain)
      VALUES (?, ?, ?, 'DOMAIN_INCHARGE', NULL)
    `).run(inchargeId, inchargeEmail || `${inchargeId}@aaruush.org`, inchargeName || 'Lead Domain Incharge');

    recordAuditLog(db, {
      actorId: adminId,
      actorRole: 'SUPER_ADMIN',
      action: 'INCHARGE_ASSIGNED',
      reason: reason || 'Domain Incharge appointment',
      beforeVal: oldIncharge ? { id: oldIncharge.id, name: oldIncharge.name } : null,
      afterVal: { id: inchargeId, name: inchargeName }
    });

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  return {
    success: true,
    message: `Domain Incharge successfully assigned to ${inchargeName || inchargeId}.`,
    inchargeId
  };
}

/**
 * Super Admin: Authorized Balance Correction (Append-Only Audited)
 */
function adminCorrection(db, params) {
  const adminId = params.adminId || params.superAdminId;
  const domainName = params.domainName;
  const participantId = params.participantId || params.targetId;
  const amount = params.amount || params.adjustmentAmount;
  const reason = params.reason;

  const admin = db.prepare('SELECT * FROM users WHERE id = ?').get(adminId);
  if (!admin || admin.role !== 'SUPER_ADMIN') {
    return { error: 'UNAUTHORIZED_ADMIN', message: 'Only Super Admin can perform corrections.', status: 403 };
  }
  if (!reason || !reason.trim()) {
    return { error: 'REASON_REQUIRED', message: 'Explicit reason is mandatory for administrative corrections.', status: 400 };
  }

  const participant = db.prepare(`
    SELECT p.*, w.id as wallet_id, w.balance 
    FROM participants p 
    JOIN wallets w ON p.id = w.participant_id
    WHERE p.id = ? OR p.participant_id = ?
  `).get(participantId, participantId);

  if (!participant) {
    return { error: 'PARTICIPANT_NOT_FOUND', message: 'Participant not found.', status: 404 };
  }

  const correctionAmount = Number(amount);
  if (isNaN(correctionAmount) || correctionAmount === 0) {
    return { error: 'INVALID_AMOUNT', message: 'Correction amount must be a non-zero integer.', status: 400 };
  }

  const newBalance = participant.balance + correctionAmount;
  if (newBalance < 0) {
    return { error: 'INSUFFICIENT_BALANCE', message: 'Correction would cause negative participant balance.', status: 400 };
  }

  const txId = 'CORR-' + crypto.randomUUID().substring(0, 8).toUpperCase();
  const now = new Date().toISOString();

  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare('UPDATE wallets SET balance = balance + ?, updated_at = ? WHERE id = ?').run(correctionAmount, now, participant.wallet_id);
    db.prepare(`
      INSERT INTO transactions (
        id, idempotency_key, amount, type, participant_id, manager_id, domain_name,
        participant_balance_before, participant_balance_after, status, reason, timestamp
      )
      VALUES (?, ?, ?, 'ADMIN_CORRECTION', ?, ?, ?, ?, ?, 'SUCCESS', ?, ?)
    `).run(
      txId, 'IDEMP-' + txId, correctionAmount, participant.id, adminId, domainName || 'ADMIN',
      participant.balance, newBalance, reason, now
    );

    recordAuditLog(db, {
      actorId: adminId,
      actorRole: 'SUPER_ADMIN',
      domainId: domainName,
      participantId: participant.id,
      transactionId: txId,
      amount: correctionAmount,
      action: 'BALANCE_CORRECTED',
      reason,
      beforeVal: { balance: participant.balance },
      afterVal: { balance: newBalance }
    });

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  return {
    success: true,
    message: `Administrative correction applied: ${correctionAmount > 0 ? '+' : ''}${correctionAmount} Crn.`,
    newBalance,
    transactionId: txId
  };
}

/**
 * Super Admin: Get Audit Logs
 */
function getAuditLogs(db, opts = {}) {
  const options = typeof opts === 'number' ? { limit: opts } : (opts || {});
  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];
  if (options.actorId) {
    query += ' AND actor_id = ?';
    params.push(options.actorId);
  }
  if (options.action) {
    query += ' AND action = ?';
    params.push(options.action);
  }
  query += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(Number(options.limit) || 50);

  return db.prepare(query).all(...params);
}

/**
 * Safe Participant Lookup by QR code or Participant ID
 */
function lookupParticipant(db, query) {
  if (!query || !query.trim()) return null;
  const clean = query.trim();

  const participant = db.prepare(`
    SELECT p.id, p.participant_id, p.name, p.status, w.balance, pass.id as passport_id
    FROM participants p
    LEFT JOIN wallets w ON p.id = w.participant_id
    LEFT JOIN passports pass ON p.id = pass.participant_id
    WHERE (p.qr_code = ? OR p.participant_id = ? OR p.participant_id = ?) AND p.status = 'ACTIVE'
  `).get(clean, clean, clean.toUpperCase());

  if (!participant) return null;

  const stamps = db.prepare(`
    SELECT domain_name, claimed_at, is_winner 
    FROM passport_stamps 
    WHERE passport_id = ?
  `).all(participant.passport_id);

  return {
    participantId: participant.participant_id,
    name: participant.name,
    balance: participant.balance || 0,
    status: participant.status,
    completedDomains: stamps.map(s => s.domain_name),
    completedCount: stamps.length
  };
}

module.exports = {
  processDomainCredit,
  getDomainBudget,
  getDomainTransactions,
  getAllDomainBudgets,
  getDomainInchargeDashboard,
  getFilteredTransactions,
  getTransactionDetails,
  assignDomainManager,
  assignDomainIncharge,
  adminCorrection,
  getAuditLogs,
  lookupParticipant
};
