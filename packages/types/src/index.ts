// Shared TypeScript Types for Carnival Reserve

export enum Role {
  PARTICIPANT = 'PARTICIPANT',
  DOMAIN_MANAGER = 'DOMAIN_MANAGER',
  MAGEFFICIE_MANAGER = 'MAGEFFICIE_MANAGER',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export enum TransactionType {
  REGISTRATION_SEED = 'REGISTRATION_SEED',
  PARTICIPATION_CREDIT = 'PARTICIPATION_CREDIT',
  WINNER_CREDIT = 'WINNER_CREDIT',
  MAGEFFICIE_PURCHASE = 'MAGEFFICIE_PURCHASE',
  REVERSAL = 'REVERSAL',
  AUCTION_HOLD = 'AUCTION_HOLD',
  AUCTION_SETTLE = 'AUCTION_SETTLE',
  AUCTION_REFUND = 'AUCTION_REFUND',
}

export interface DomainTreasuryDTO {
  id: string;
  domainName: string;
  accountRef: string; // e.g. "ACC-01"
  active: boolean;
  managerId?: string | null;
}

export interface UniversalTransactionDTO {
  idempotencyKey: string;
  participantId: string;
  managerId: string;
  deviceFingerprint: string;
  amount?: number;
  domainName?: string;
  isWinner?: boolean;
  itemId?: string;
  quantity?: number;
  proofPhotoUrl?: string;
}

export interface ReversalRequestDTO {
  transactionId: string;
  managerId: string;
  reason: string;
}

export interface MagefficieRedemptionDTO {
  id: string;
  participantId: string;
  managerId: string;
  rewardId: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  stockBefore: number;
  stockAfter: number;
  proofRef?: string | null;
  status: string;
  createdAt: string;
}

export interface AdminReviewFlagDTO {
  id: string;
  transactionId?: string | null;
  participantId: string;
  managerId: string;
  reason: string;
  currentBalance: number;
  attemptedAmount: number;
  status: 'PENDING' | 'RESOLVED';
  createdAt: string;
}

export interface WalletBalanceResponse {
  participantId: string;
  balance: number;
  totalEarned: number;
  totalSpent: number;
  updatedAt: string;
}

export interface PassportStatusResponse {
  participantId: string;
  stamps: {
    domainName: string;
    claimedAt: string;
    isWinner: boolean;
  }[];
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
}
