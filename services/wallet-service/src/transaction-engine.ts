// Universal 5-Step Money Action Engine for Carnival Reserve

import { verifyManagerDevice } from '../../auth-service/src/device-guard';

export const REGISTRATION_REWARD = 50;
export const PARTICIPATION_REWARD = 50;
export const WINNER_REWARD = 250;

export interface DomainCreditParams {
  idempotencyKey: string;
  managerId: string;
  deviceFingerprint: string;
  participantId: string;
  domainName: string;
  isWinner: boolean;
  proofPhotoUrl?: string; // Required if isWinner === true
}

export interface MagefficiePurchaseParams {
  idempotencyKey: string;
  managerId: string;
  deviceFingerprint: string;
  participantId: string;
  itemId: string;
  quantity?: number;
  proofPhotoUrl: string; // Mandatory for Magefficie purchase
}

export interface ReversalParams {
  transactionId: string;
  managerId: string;
  reason: string;
}

export interface AuctionBidParams {
  idempotencyKey: string;
  participantId: string;
  itemId: string;
  bidAmount: number;
}

export class TransactionEngine {
  constructor(private prisma: any, private redisPublisher?: any) {}

  /**
   * UNIVERSAL ACTION PATTERN: Domain Credit Route (Participation & Winner)
   * 1. Authenticate manager & device
   * 2. Server-side Domain authorization (Manager assigned to Domain or Super Admin)
   * 3. Validate one-shot domain completion (block second credit or upgrades)
   * 4. Execute atomic Prisma $transaction (credit wallet + record stamp + record transaction)
   * 5. Real-time Notification
   */
  async processDomainCredit(params: DomainCreditParams) {
    const { idempotencyKey, managerId, deviceFingerprint, participantId, domainName, isWinner, proofPhotoUrl } = params;

    // STEP 1: AUTHENTICATE DEVICE & MANAGER
    const deviceCheck = await verifyManagerDevice(this.prisma, managerId, deviceFingerprint);
    if (!deviceCheck.allowed) {
      throw new Error(`AUTH_DEVICE_FAILED: ${deviceCheck.reason}`);
    }

    if (isWinner && (!proofPhotoUrl || proofPhotoUrl.trim() === '')) {
      throw new Error('VALIDATION_FAILED: Winner credits require a photo proof URL.');
    }

    // Server-side Domain Manager Authorization
    const manager = await this.prisma.user.findUnique({
      where: { id: managerId },
      include: { managedTreasury: true },
    });

    if (!manager) {
      throw new Error('AUTH_FAILED: Manager not found.');
    }

    if (manager.role !== 'SUPER_ADMIN' && manager.role !== 'DOMAIN_MANAGER') {
      throw new Error('FORBIDDEN: Unauthorized role for domain operation.');
    }

    const treasury = await this.prisma.domainTreasury.findUnique({
      where: { domainName },
    });

    if (!treasury) {
      throw new Error(`VALIDATION_FAILED: Domain Treasury '${domainName}' does not exist.`);
    }

    if (
      manager.role !== 'SUPER_ADMIN' &&
      manager.managedTreasury?.id !== treasury.id &&
      treasury.managerId !== managerId
    ) {
      throw new Error('FORBIDDEN: Domain Manager is not authorized for this domain.');
    }

    // Check existing Idempotency Key before starting transaction
    const existingTx = await this.prisma.transaction.findUnique({
      where: { idempotencyKey },
    });
    if (existingTx) {
      return { status: 'DUPLICATE_REJECTED', transaction: existingTx };
    }

    // Fixed reward calculation (No arbitrary amounts)
    const creditAmount = isWinner ? WINNER_REWARD : PARTICIPATION_REWARD;
    const txType = isWinner ? 'WINNER_CREDIT' : 'PARTICIPATION_CREDIT';
    const reversalWindowExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // STEP 2, 3 & 4: VALIDATE ONE-SHOT CREDIT, EXECUTE, AND RECORD ATOMICALLY
    const result = await this.prisma.$transaction(async (tx: any) => {
      // Fetch Participant & Passport
      const participant = await tx.participant.findUnique({
        where: { id: participantId },
        include: { wallet: true, passport: { include: { stamps: true } } },
      });

      if (!participant || !participant.wallet) {
        throw new Error('VALIDATION_FAILED: Participant or wallet not found');
      }

      // ONE-SHOT DOMAIN CREDIT CHECK: Block if domain has already been completed
      const existingStamp = participant.passport?.stamps.find((s: any) => s.domainName === domainName);
      if (existingStamp) {
        throw new Error(`VALIDATION_FAILED: Participant has already completed domain '${domainName}'.`);
      }

      // Credit Participant Wallet
      const updatedWallet = await tx.wallet.update({
        where: { id: participant.wallet.id },
        data: {
          balance: { increment: creditAmount },
          totalEarned: { increment: creditAmount },
        },
      });

      // Create Passport Stamp
      if (participant.passport) {
        await tx.passportStamp.create({
          data: {
            passportId: participant.passport.id,
            domainName,
            isWinner,
          },
        });
      }

      // Record Transaction Row with 5-minute Reversal Expiry
      const transactionRecord = await tx.transaction.create({
        data: {
          idempotencyKey,
          amount: creditAmount,
          type: txType,
          fromAccountId: treasury.id,
          toAccountId: participant.wallet.id,
          participantId: participant.id,
          managerId,
          proofPhotoUrl: isWinner ? proofPhotoUrl : null,
          reversalWindowExpiresAt,
        },
      });

      return {
        transaction: transactionRecord,
        newBalance: updatedWallet.balance,
        domainName,
        isWinner,
      };
    });

    // STEP 5: REAL-TIME PUSH NOTIFICATION
    if (this.redisPublisher) {
      await this.redisPublisher.publish(
        'WALLET_UPDATE',
        JSON.stringify({
          participantId,
          balance: result.newBalance,
          domainName,
          isWinner,
          type: txType,
          timestamp: new Date().toISOString(),
        })
      );
    }

    return { status: 'SUCCESS', ...result };
  }

  /**
   * ADDITIVE REVERSAL ENGINE (`POST /transactions/:id/reverse`)
   * - 5-minute manager window (unlimited for Super Admin)
   * - Enforces single-reversal guard
   * - Auto-blocks with AdminReviewFlag on insufficient balance
   * - Resets passport stamp on successful reversal
   */
  async reverseTransaction(params: ReversalParams) {
    const { transactionId, managerId, reason } = params;

    if (!reason || reason.trim() === '') {
      throw new Error('VALIDATION_FAILED: Reason is required for transaction reversal.');
    }

    const originalTx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        reversedBy: true,
        participant: { include: { wallet: true, passport: { include: { stamps: true } } } },
      },
    });

    if (!originalTx) {
      throw new Error('VALIDATION_FAILED: Original transaction not found.');
    }

    if (originalTx.reversedBy || originalTx.reversalOfId) {
      throw new Error('VALIDATION_FAILED: Transaction has already been reversed.');
    }

    const manager = await this.prisma.user.findUnique({
      where: { id: managerId },
    });

    if (!manager) {
      throw new Error('AUTH_FAILED: Manager account not found.');
    }

    // Ownership and 5-minute window check for non-Super Admin
    if (manager.role !== 'SUPER_ADMIN') {
      if (originalTx.managerId !== managerId) {
        throw new Error('FORBIDDEN: Only the original Domain Manager or Super Admin can reverse this transaction.');
      }

      if (originalTx.reversalWindowExpiresAt && new Date() > new Date(originalTx.reversalWindowExpiresAt)) {
        throw new Error('VALIDATION_FAILED: Reversal window of 5 minutes has expired.');
      }
    }

    const participant = originalTx.participant;
    if (!participant || !participant.wallet) {
      throw new Error('VALIDATION_FAILED: Participant wallet not found for reversal.');
    }

    const reversalAmount = originalTx.amount;

    // Balance Protection Check: Reversal must NOT create a negative balance
    if (participant.wallet.balance < reversalAmount) {
      await this.prisma.adminReviewFlag.create({
        data: {
          transactionId: originalTx.id,
          participantId: participant.id,
          managerId,
          reason: `INSUFFICIENT_BALANCE: Reversal requested (${reversalAmount} Crn) exceeds available balance (${participant.wallet.balance} Crn). Reason: ${reason}`,
          currentBalance: participant.wallet.balance,
          attemptedAmount: reversalAmount,
          status: 'PENDING',
        },
      });

      throw new Error(
        `INSUFFICIENT_BALANCE_FOR_REVERSAL: Reversal Blocked: Participant has already spent this balance (Current Balance: ${participant.wallet.balance} Crn < Reversal Amount: ${reversalAmount} Crn). An escalation ticket has been automatically logged for Super Admin manual review.`
      );
    }

    // Execute Atomic Reversal
    const result = await this.prisma.$transaction(async (tx: any) => {
      // 1. Debit Participant Wallet
      const updatedWallet = await tx.wallet.update({
        where: { id: participant.wallet.id },
        data: {
          balance: { decrement: reversalAmount },
          totalEarned: { decrement: reversalAmount },
        },
      });

      // 2. Insert Reversal Transaction Ledger Row
      const reversalTxKey = `rev_${originalTx.id}_${Date.now()}`;
      const reversalRecord = await tx.transaction.create({
        data: {
          idempotencyKey: reversalTxKey,
          amount: -reversalAmount,
          type: 'REVERSAL',
          fromAccountId: originalTx.toAccountId,
          toAccountId: originalTx.fromAccountId,
          participantId: participant.id,
          managerId,
          reversalOfId: originalTx.id,
          reason: reason.trim(),
        },
      });

      // 3. Reset Passport Stamp if this was a domain credit
      if (originalTx.type === 'PARTICIPATION_CREDIT' || originalTx.type === 'WINNER_CREDIT') {
        const treasury = await tx.domainTreasury.findUnique({
          where: { id: originalTx.fromAccountId },
        });

        if (treasury?.domainName && participant.passport) {
          await tx.passportStamp.deleteMany({
            where: {
              passportId: participant.passport.id,
              domainName: treasury.domainName,
            },
          });
        }
      }

      return {
        reversalTransaction: reversalRecord,
        newBalance: updatedWallet.balance,
      };
    });

    return { status: 'SUCCESS', ...result };
  }

  /**
   * UNIVERSAL ACTION PATTERN: Magefficie Marketplace Purchase Route
   * - Supports quantity > 1
   * - Computes totalCost = unitCost * quantity
   * - Atomic conditional inventory stock decrement preventing overselling race conditions
   * - Logs dedicated MagefficieRedemption row
   */
  async processMagefficiePurchase(params: MagefficiePurchaseParams) {
    const { idempotencyKey, managerId, deviceFingerprint, participantId, itemId, quantity, proofPhotoUrl } = params;

    const qty = quantity && quantity > 0 ? quantity : 1;

    // STEP 1: AUTHENTICATE
    const deviceCheck = await verifyManagerDevice(this.prisma, managerId, deviceFingerprint);
    if (!deviceCheck.allowed) {
      throw new Error(`AUTH_DEVICE_FAILED: ${deviceCheck.reason}`);
    }

    if (!proofPhotoUrl || proofPhotoUrl.trim() === '') {
      throw new Error('VALIDATION_FAILED: Magefficie purchases require proof photo URL.');
    }

    // Check Idempotency Key
    const existingTx = await this.prisma.transaction.findUnique({
      where: { idempotencyKey },
    });
    if (existingTx) {
      return { status: 'DUPLICATE_REJECTED', transaction: existingTx };
    }

    // STEP 2, 3 & 4: ATOMIC TRANSACTION WITH CONDITIONAL STOCK CHECK
    const result = await this.prisma.$transaction(async (tx: any) => {
      const item = await tx.inventoryItem.findUnique({
        where: { id: itemId },
      });

      if (!item) {
        throw new Error('VALIDATION_FAILED: Inventory item not found.');
      }

      if (item.tier === 4) {
        throw new Error('VALIDATION_FAILED: Tier 4 items are reserved for auction only.');
      }

      const unitCost = item.price;
      const totalCost = unitCost * qty;

      if (item.availableCount < qty) {
        throw new Error(`VALIDATION_FAILED: Requested quantity (${qty}) exceeds available stock (${item.availableCount}).`);
      }

      const participant = await tx.participant.findUnique({
        where: { id: participantId },
        include: { wallet: true },
      });

      if (!participant || !participant.wallet) {
        throw new Error('VALIDATION_FAILED: Participant wallet not found.');
      }

      if (participant.wallet.balance < totalCost) {
        throw new Error(`VALIDATION_FAILED: Insufficient wallet balance (${participant.wallet.balance} Crn) for total cost (${totalCost} Crn).`);
      }

      // Atomic Stock Decrement preventing race condition
      const updatedItemCount = await tx.inventoryItem.updateMany({
        where: {
          id: item.id,
          availableCount: { gte: qty },
        },
        data: {
          availableCount: { decrement: qty },
          soldCount: { increment: qty },
        },
      });

      if (updatedItemCount.count === 0) {
        throw new Error('INSUFFICIENT_STOCK: Stock became unavailable during transaction.');
      }

      // Debit Wallet
      const updatedWallet = await tx.wallet.update({
        where: { id: participant.wallet.id },
        data: {
          balance: { decrement: totalCost },
          totalSpent: { increment: totalCost },
        },
      });

      // Record Magefficie Redemption Log
      const redemptionRecord = await tx.magefficieRedemption.create({
        data: {
          participantId: participant.id,
          managerId,
          rewardId: item.id,
          quantity: qty,
          unitCost,
          totalCost,
          stockBefore: item.availableCount,
          stockAfter: item.availableCount - qty,
          proofRef: proofPhotoUrl,
          status: 'COMPLETED',
        },
      });

      // Record Transaction
      const transactionRecord = await tx.transaction.create({
        data: {
          idempotencyKey,
          amount: totalCost,
          type: 'MAGEFFICIE_PURCHASE',
          fromAccountId: participant.wallet.id,
          toAccountId: `MAGEFFICIE_ITEM_${item.id}`,
          participantId: participant.id,
          managerId,
          proofPhotoUrl,
        },
      });

      return {
        transaction: transactionRecord,
        redemption: redemptionRecord,
        newBalance: updatedWallet.balance,
        itemName: item.name,
        quantity: qty,
        unitCost,
        totalCost,
      };
    });

    // STEP 5: REAL-TIME PUSH NOTIFICATION
    if (this.redisPublisher) {
      await this.redisPublisher.publish(
        'WALLET_UPDATE',
        JSON.stringify({
          participantId,
          balance: result.newBalance,
          type: 'MAGEFFICIE_PURCHASE',
          itemName: result.itemName,
          quantity: result.quantity,
          totalCost: result.totalCost,
          timestamp: new Date().toISOString(),
        })
      );
    }

    return { status: 'SUCCESS', ...result };
  }

  /**
   * TIER 4 AUCTION: Place Bid with Balance Hold
   */
  async placeAuctionBid(params: AuctionBidParams) {
    const { idempotencyKey, participantId, itemId, bidAmount } = params;

    return await this.prisma.$transaction(async (tx: any) => {
      const item = await tx.inventoryItem.findUnique({ where: { id: itemId } });
      if (!item || item.tier !== 4) {
        throw new Error('VALIDATION_FAILED: Item is not a valid Tier 4 auction item.');
      }

      if (bidAmount < item.price) {
        throw new Error(`VALIDATION_FAILED: Bid amount must be at least starting price of ${item.price} Crn.`);
      }

      const highestBid = await tx.auctionBid.findFirst({
        where: { itemId, status: 'ACTIVE' },
        orderBy: { bidAmount: 'desc' },
      });

      if (highestBid && bidAmount <= highestBid.bidAmount) {
        throw new Error(`VALIDATION_FAILED: Bid must exceed current highest bid of ${highestBid.bidAmount} Crn.`);
      }

      const participant = await tx.participant.findUnique({
        where: { id: participantId },
        include: { wallet: true },
      });

      if (!participant || participant.wallet.balance < bidAmount) {
        throw new Error('VALIDATION_FAILED: Insufficient balance for auction hold.');
      }

      if (highestBid) {
        await tx.auctionBid.update({
          where: { id: highestBid.id },
          data: { status: 'OUTBID' },
        });

        await tx.wallet.update({
          where: { participantId: highestBid.participantId },
          data: { balance: { increment: highestBid.bidAmount } },
        });
      }

      await tx.wallet.update({
        where: { id: participant.wallet.id },
        data: { balance: { decrement: bidAmount } },
      });

      const newBid = await tx.auctionBid.create({
        data: {
          itemId,
          participantId,
          bidAmount,
          status: 'ACTIVE',
        },
      });

      await tx.transaction.create({
        data: {
          idempotencyKey,
          amount: bidAmount,
          type: 'AUCTION_HOLD',
          fromAccountId: participant.wallet.id,
          toAccountId: `AUCTION_ITEM_${itemId}`,
          participantId,
        },
      });

      return { status: 'SUCCESS', bid: newBid };
    });
  }
}
