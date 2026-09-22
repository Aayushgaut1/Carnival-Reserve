// Shared Utilities for Carnival Reserve

export * from './domains';
import { InventoryReconciliationReport, ReconciliationReportDTO } from '@carnival/types';

/**
 * Super Admin Currency Reconciliation Calculator
 * Formula: Expected Outstanding = Issued - Reversed - Redeemed
 * Discrepancy = Actual Outstanding - Expected Outstanding
 */
export function calculateSystemReconciliation(
  totalIssued: number,
  totalReversed: number,
  totalRedeemed: number,
  actualWalletTotal: number
): ReconciliationReportDTO {
  const expectedOutstanding = totalIssued - totalReversed - totalRedeemed;
  const discrepancy = actualWalletTotal - expectedOutstanding;
  const isReconciled = discrepancy === 0;

  return {
    issued: totalIssued,
    reversed: totalReversed,
    redeemed: totalRedeemed,
    expectedOutstanding,
    actualWalletTotal,
    discrepancy,
    isReconciled,
  };
}

/**
 * Economy Calculation Engine
 * N = confirmed registrations at registration close
 * Registration Pool = N × 50
 * Participation Pool per domain = N × 50 (Ceiling)
 * Winner Pool per domain = 16 winners × 250 = 4,000 max per domain
 */
export function calculateEconomyPools(confirmedRegistrations: number) {
  const N = Math.max(0, confirmedRegistrations);
  const registrationPoolPerUser = 50;
  const participationPoolPerDomain = N * 50;
  const winnerPoolPerDomain = 16 * 250; // 4,000 Crn max per domain

  return {
    N,
    registrationPoolTotal: N * registrationPoolPerUser,
    participationPoolPerDomain,
    winnerPoolPerDomain,
    totalDomainTreasurySeed: participationPoolPerDomain + winnerPoolPerDomain,
  };
}

/**
 * Inventory Reconciliation Checker
 * Automated check: closing count (available + reserved) MUST equal opening minus sold.
 */
export function checkInventoryReconciliation(items: {
  id: string;
  name: string;
  tier: number;
  openingCount: number;
  soldCount: number;
  availableCount: number;
  reservedCount: number;
}[]): InventoryReconciliationReport[] {
  return items.map((item) => {
    const expectedAvailable = item.openingCount - item.soldCount - item.reservedCount;
    const discrepancy = item.availableCount - expectedAvailable;
    const isReconciled = discrepancy === 0;

    return {
      itemId: item.id,
      name: item.name,
      tier: item.tier,
      openingCount: item.openingCount,
      soldCount: item.soldCount,
      availableCount: item.availableCount,
      reservedCount: item.reservedCount,
      expectedAvailable,
      isReconciled,
      discrepancy,
    };
  });
}

/**
 * Mask Registration Number for privacy on public leaderboard
 * Example: "21BCE1042" -> "21BCE***"
 */
export function maskRegNo(regNo: string): string {
  if (!regNo || regNo.length <= 5) return '***';
  return regNo.substring(0, 5) + '*'.repeat(Math.max(3, regNo.length - 5));
}
