# Carnival Reserve — Implementation Plan (v3 Final Spec)

Refactor specification and phased execution plan for Carnival Reserve based on finalized event requirements.

---

## 1. Executive Summary & Architectural Decisions

* **3 Administrative Roles Only**: `SUPER_ADMIN`, `DOMAIN_MANAGER` (17 domains), `MAGEFFICIE_MANAGER`. No Global Manager tier.
* **Repurposed `DomainTreasury` in place**: No table rename; removal of pre-seeded pool ceilings; addition of `accountRef` (`ACC-01` to `ACC-17`) and strict 1:1 `managerId` foreign key.
* **Hardcoded Reward Constants**:
  * `REGISTRATION_REWARD = 50 Crn`
  * `PARTICIPATION_REWARD = 50 Crn`
  * `WINNER_REWARD = 250 Crn`
  * Rewards are fixed in code constants, non-configurable via UI to prevent misconfiguration.
* **One-Shot Domain Crediting (Option A)**: Exactly one scan per domain per participant (`50` or `250`). No upgrade delta logic. Re-crediting blocked server-side.
* **Additive Reversal Engine (`POST /api/transactions/:id/reverse`)**:
  * 5-minute manager window (unlimited for Super Admin).
  * Enforces single-reversal guard (`reversalOfId` check).
  * Auto-blocks with `409 INSUFFICIENT_BALANCE_FOR_REVERSAL` if wallet balance < reversal amount.
  * Reverts passport stamp on success; never updates or deletes historical rows.
* **Magefficie Multi-Quantity & Atomic Row-Locked Stock**:
  * Supports quantity $Q \ge 1$ with `totalCost = unitCost * quantity`.
  * Atomic conditional decrement (`availableCount >= Q`) preventing race conditions.
  * Logs to dedicated `MagefficieRedemption` table.
* **Name-Only Public Leaderboard**: API endpoint returns `rank` + `name` exclusively.
* **Single-Query Reconciliation Dashboard**:
  $$\text{Expected Outstanding} = \text{Issued} - \text{Reversed} - \text{Redeemed} == \sum \text{Wallet.balance}$$
  Flags instant discrepancy banner if mismatch detected.
* **Deferred Modules**: Auction service, Redis Pub/Sub requirement, dynamic pool seeding formulas, and hard blocking device gates.

---

## 2. Proposed Changes by Phase

### Phase 1: Database Schema Diff (`packages/database/prisma/schema.prisma` & `packages/types`)

#### [MODIFY] [packages/database/prisma/schema.prisma](file:///d:/projects/Carnival%20Reserve/packages/database/prisma/schema.prisma)
- Update `Role` enum: `SUPER_ADMIN`, `DOMAIN_MANAGER`, `MAGEFFICIE_MANAGER`, `PARTICIPANT`.
- Update `TransactionType` enum: `REGISTRATION_SEED`, `PARTICIPATION_REWARD`, `WINNER_REWARD`, `MAGEFFICIE_PURCHASE`, `REVERSAL`, `ADMIN_ADJUSTMENT`.
- Repurpose `DomainTreasury` model in place:
  - Remove: `balance`, `participationRemaining`, `winnerSlotsRemaining`.
  - Add: `accountRef String @unique`, `active Boolean @default(true)`.
  - Ensure: `managerId String? @unique` with 1:1 relation to `User`.
- Update `User` model:
  - Add `assignedDomain DomainTreasury?` relation.
- Update `Transaction` model:
  - Add `reversalOfId String? @unique` (self-referencing FK to prevent double reversal).
  - Add `reversalWindowExpiresAt DateTime?`.
  - Add `reason String?`.
- Add `AdminReviewFlag` model (for blocked reversals & discrepancies):
  - `id`, `transactionId`, `participantId`, `managerId`, `reason`, `currentBalance`, `attemptedAmount`, `status` (`PENDING`, `RESOLVED`), `createdAt`.
- Add `MagefficieRedemption` model:
  - `id`, `participantId`, `managerId`, `rewardId`, `quantity`, `unitCost`, `totalCost`, `stockBefore`, `stockAfter`, `proofRef`, `status`, `createdAt`.
- Update `PassportStamp`:
  - `completed Boolean @default(true)`.

#### [MODIFY] [packages/types/src/index.ts](file:///d:/projects/Carnival%20Reserve/packages/types/src/index.ts)
- Align all TypeScript enums, DTOs, and interfaces with the updated schema.

---

### Phase 2: RBAC & Server-Side Domain Validation

#### [MODIFY] [services/auth-service/src/device-guard.ts](file:///d:/projects/Carnival%20Reserve/services/auth-service/src/device-guard.ts)
- Align role check to `DOMAIN_MANAGER`, `MAGEFFICIE_MANAGER`, `SUPER_ADMIN`.
- Downgrade device gate: log device usage for audit while auto-allowing backup logins (soft logging).

#### [MODIFY] [services/wallet-service/src/transaction-engine.ts](file:///d:/projects/Carnival%20Reserve/services/wallet-service/src/transaction-engine.ts)
- Enforce strict server-side authorization in `processDomainCredit`:
  1. `manager.role === DOMAIN_MANAGER` (or `SUPER_ADMIN`).
  2. `manager.assignedDomain.id === requestedDomainId` (reject cross-domain mutation).
  3. `domain.active === true`.

---

### Phase 3: One-Shot Crediting Engine & Additive Reversals

#### [MODIFY] [services/wallet-service/src/transaction-engine.ts](file:///d:/projects/Carnival%20Reserve/services/wallet-service/src/transaction-engine.ts)
- **One-Shot Crediting**:
  - Check `PassportStamp` for `domainName`: if already completed, immediately reject with `409 DOMAIN_ALREADY_CREDITED`.
  - Retrying as WINNER after mistaken PARTICIPATION is blocked at credit time; manager MUST reverse first.
  - Award hardcoded `PARTICIPATION_REWARD` (50) or `WINNER_REWARD` (250).
  - Set `reversalWindowExpiresAt = now() + 5 minutes`.
- **Additive Reversals (`reverseTransaction`)**:
  - Step 1: Validate `reason` is present and non-empty (reject with `400 Bad Request` if empty).
  - Step 2: Verify transaction has not already been reversed (`reversalOfId` lookup).
  - Step 3: Verify `now() < reversalWindowExpiresAt` (unless `SUPER_ADMIN`).
  - Step 4: Verify `managerId === transaction.managerId` (unless `SUPER_ADMIN`).
  - Step 5: Verify `wallet.balance >= transaction.amount`; if participant has spent the Crn:
    - Block reversal with `409 INSUFFICIENT_BALANCE_FOR_REVERSAL`.
    - Automatically create an `AdminReviewFlag` record in DB for Super Admin review.
  - Step 6: Atomically execute in single `prisma.$transaction`:
    - Insert new `Transaction` row (`type: REVERSAL`, `amount: -transaction.amount`, `reversalOfId: transaction.id`, `reason`).
    - Debit `wallet.balance` by `transaction.amount`.
    - Delete/reset `PassportStamp` for this domain, freeing the domain for re-processing.

---

### Phase 4: Magefficie Multi-Quantity & Atomic Stock Decrement

#### [MODIFY] [services/wallet-service/src/transaction-engine.ts](file:///d:/projects/Carnival%20Reserve/services/wallet-service/src/transaction-engine.ts)
- Update `processMagefficiePurchase`:
  - Accept `quantity >= 1`.
  - Compute `totalCost = item.price * quantity`.
  - Verify participant passport completion (17/17 domains completed if required for redemption, or standard balance check).
  - Verify `wallet.balance >= totalCost`.
  - Execute atomic conditional update on inventory:
    ```typescript
    const updatedItem = await tx.inventoryItem.updateMany({
      where: { id: itemId, availableCount: { gte: quantity } },
      data: { availableCount: { decrement: quantity }, soldCount: { increment: quantity } }
    });
    if (updatedItem.count === 0) throw new Error('INSUFFICIENT_STOCK');
    ```
  - Insert `MagefficieRedemption` row and `Transaction` row.

---

### Phase 5: Single-Query Reconciliation Dashboard & Name-Only Leaderboard

#### [MODIFY] [services/leaderboard-service/src/index.ts](file:///d:/projects/Carnival%20Reserve/services/leaderboard-service/src/index.ts)
- Return `rank` and `name` ONLY. Strip all other fields (`balance`, `regNo`, `participantId`) from the query response.

#### [MODIFY] [apps/admin/app/page.tsx](file:///d:/projects/Carnival%20Reserve/apps/admin/app/page.tsx)
- Implement single reconciliation formula:
  - Query SUMs for Issued, Reversed, Redeemed, and Wallet balances.
  - Render simple `MATCHED` or `DISCREPANCY DETECTED` indicator.

#### [MODIFY] [apps/volunteer/app/page.tsx](file:///d:/projects/Carnival%20Reserve/apps/volunteer/app/page.tsx)
- Update scanner UI to lock domain to the logged-in manager's assigned domain (`ACC-xx`), support one-shot crediting, and offer a 5-minute undo button on recently scanned items.

---

### Phase 6: Defer / Disable Unused Modules

- Defer `AuctionBid` and auction routes.
- Remove pool calculation engine from `packages/utils/src/index.ts`.
