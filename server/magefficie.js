// server/magefficie.js - Magefficie Redemption & Inventory Engine
const crypto = require('crypto');

function getInventory(db) {
  return db.prepare(`
    SELECT id, name, tier, price, available_count as stock, sold_count as sold, image_url 
    FROM inventory_items 
    ORDER BY tier ASC, price ASC
  `).all();
}

function redeemReward(db, { participantQrOrId, rewardId, quantity = 1, managerId = 'mgr-vault' }) {
  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty < 1) {
    return { error: 'INVALID_QUANTITY', message: 'Quantity must be at least 1.', status: 400 };
  }

  // 1. Participant lookup
  const participant = db.prepare(`
    SELECT * FROM participants 
    WHERE (qr_code = ? OR participant_id = ? OR id = ?) AND status = 'ACTIVE'
  `).get(participantQrOrId, participantQrOrId, participantQrOrId);

  if (!participant) {
    return { error: 'PARTICIPANT_NOT_FOUND', message: 'Active participant not found.', status: 404 };
  }

  // 2. Check 17 required domain completion
  const passport = db.prepare('SELECT id FROM passports WHERE participant_id = ?').get(participant.id);
  const completedCount = passport 
    ? db.prepare('SELECT COUNT(*) as count FROM passport_stamps WHERE passport_id = ?').get(passport.id).count 
    : 0;

  const REQUIRED_DOMAINS = 17;
  if (completedCount < REQUIRED_DOMAINS) {
    return {
      error: 'REQUIRED_DOMAINS_NOT_COMPLETED',
      message: `You have completed ${completedCount} of ${REQUIRED_DOMAINS} domains. All ${REQUIRED_DOMAINS} domains must be completed to unlock Magefficie redemption.`,
      completedCount,
      requiredCount: REQUIRED_DOMAINS,
      status: 403
    };
  }

  // 3. Item lookup
  const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(String(rewardId));
  if (!item) {
    return { error: 'ITEM_NOT_FOUND', message: 'Reward item not found.', status: 404 };
  }

  // 4. Server-side total calculation: totalCost = unitCost * quantity
  const unitCost = item.price;
  const totalCost = unitCost * qty;

  // 5. Check wallet balance
  const wallet = db.prepare('SELECT * FROM wallets WHERE participant_id = ?').get(participant.id);
  if (!wallet || wallet.balance < totalCost) {
    return {
      error: 'INSUFFICIENT_CRN_BALANCE',
      message: `Insufficient Crn. Needed: ${totalCost} Crn, Current Balance: ${wallet ? wallet.balance : 0} Crn.`,
      currentBalance: wallet ? wallet.balance : 0,
      totalCost,
      status: 400
    };
  }

  // 6. Check stock availability
  if (item.available_count < qty) {
    return {
      error: 'INSUFFICIENT_INVENTORY_STOCK',
      message: `Insufficient stock for ${item.name}. Available: ${item.available_count}, Requested: ${qty}.`,
      availableCount: item.available_count,
      requestedCount: qty,
      status: 400
    };
  }

  // 7. Atomic transaction: Stock reduction, Crn debit, Redemption record & Transaction ledger
  const now = new Date().toISOString();
  const redemptionId = 'red-' + crypto.randomUUID();
  const txId = 'tx-' + crypto.randomUUID();
  const idempotencyKey = `MAGEFFICIE-${participant.participant_id}-${item.id}-${Date.now()}`;
  const stockBefore = item.available_count;
  const stockAfter = item.available_count - qty;
  let newBalance = 0;

  db.exec('BEGIN TRANSACTION;');
  try {
    // Conditional update to prevent negative inventory
    const updateStock = db.prepare(`
      UPDATE inventory_items 
      SET available_count = available_count - ?, sold_count = sold_count + ?
      WHERE id = ? AND available_count >= ?
    `).run(qty, qty, item.id, qty);

    if (updateStock.changes === 0) {
      throw new Error('INSUFFICIENT_STOCK_RACE');
    }

    // Debit wallet
    db.prepare(`
      UPDATE wallets 
      SET balance = balance - ?, total_spent = total_spent + ?, updated_at = ?
      WHERE id = ? AND balance >= ?
    `).run(totalCost, totalCost, now, wallet.id, totalCost);

    // Record redemption
    db.prepare(`
      INSERT INTO magefficie_redemptions (id, participant_id, manager_id, reward_id, quantity, unit_cost, total_cost, stock_before, stock_after, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(redemptionId, participant.id, managerId, item.id, qty, unitCost, totalCost, stockBefore, stockAfter, now);

    // Ledger entry
    db.prepare(`
      INSERT INTO transactions (id, idempotency_key, amount, type, from_account_id, to_account_id, participant_id, manager_id, timestamp)
      VALUES (?, ?, ?, 'MAGEFFICIE_PURCHASE', ?, 'VAULT_STORE', ?, ?, ?)
    `).run(txId, idempotencyKey, -totalCost, wallet.id, participant.id, managerId, now);

    newBalance = wallet.balance - totalCost;
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    return { error: 'REDEMPTION_FAILED', message: err.message, status: 500 };
  }

  return {
    success: true,
    message: `Successfully redeemed ${qty}x ${item.name} for ${totalCost} Crn!`,
    redemptionId,
    item: {
      id: item.id,
      name: item.name,
      quantity: qty,
      unitCost,
      totalCost,
      stockRemaining: stockAfter
    },
    newBalance
  };
}

module.exports = {
  getInventory,
  redeemReward
};
