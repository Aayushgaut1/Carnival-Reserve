// Leaderboard Service

import { LeaderboardEntry } from '@carnival/types';

/**
 * Public Leaderboard Service
 * Hard Security Requirement: The public leaderboard endpoint returns rank and name ONLY.
 * It does NOT expose wallet balance, participant ID, phone number, or registration number.
 */
export async function getLeaderboard(
  prisma: any,
  limit: number = 50
): Promise<LeaderboardEntry[]> {
  const wallets = await prisma.wallet.findMany({
    take: limit,
    orderBy: [{ balance: 'desc' }, { totalEarned: 'desc' }],
    include: {
      participant: {
        include: {
          user: true,
        },
      },
    },
  });

  return wallets.map((wallet: any, index: number) => ({
    rank: index + 1,
    name: wallet.participant?.user?.name || 'Anonymous Participant',
  }));
}
