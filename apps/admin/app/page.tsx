'use client';

import React, { useState } from 'react';
import { OFFICIAL_DOMAINS } from '../../../packages/utils/src/domains';
import { calculateSystemReconciliation, checkInventoryReconciliation } from '../../../packages/utils/src/index';

export default function SuperAdminDashboard() {
  // Financial Audit Ledger Figures
  const [issuedCrn, setIssuedCrn] = useState<number>(52100);
  const [reversedCrn, setReversedCrn] = useState<number>(500);
  const [redeemedCrn, setRedeemedCrn] = useState<number>(12400);
  const [actualWalletTotal, setActualWalletTotal] = useState<number>(39200);

  // Admin Review Flags (Reversals with insufficient balance)
  const [adminFlags, setAdminFlags] = useState([
    {
      id: 'flag_01',
      participantId: 'CR-710492',
      participantName: 'Rohan Mehta',
      managerId: 'DM-07',
      managerName: 'Vikram Rao',
      attemptedAmount: 250,
      currentBalance: 100,
      reason: 'Reversal requested (250 Crn) exceeds available balance (100 Crn). Participant already spent Crn.',
      timestamp: '11:45 AM',
      status: 'PENDING',
    },
  ]);

  // Inventory Items for Audit
  const [inventoryItems] = useState([
    { id: '1', name: 'Pop Art Sticker Pack', tier: 1, openingCount: 200, soldCount: 80, availableCount: 120, reservedCount: 0 },
    { id: '2', name: 'Festival Crunch Snack Combo', tier: 1, openingCount: 150, soldCount: 65, availableCount: 85, reservedCount: 0 },
    { id: '3', name: 'Embroidered Log Notebook', tier: 2, openingCount: 100, soldCount: 55, availableCount: 45, reservedCount: 0 },
    { id: '4', name: 'Champion Snapback Cap', tier: 3, openingCount: 50, soldCount: 30, availableCount: 20, reservedCount: 0 },
    { id: '5', name: 'Festival Audit Check Item (Sample Flag)', tier: 3, openingCount: 50, soldCount: 30, availableCount: 15, reservedCount: 0 },
  ]);

  // Run Calculations
  const reconciliation = calculateSystemReconciliation(issuedCrn, reversedCrn, redeemedCrn, actualWalletTotal);
  const inventoryReport = checkInventoryReconciliation(inventoryItems);

  // Resolve Review Flag
  const handleResolveFlag = (flagId: string) => {
    setAdminFlags((prev) => prev.filter((f) => f.id !== flagId));
    alert(`Admin Review Flag ${flagId} marked as RESOLVED by Super Admin.`);
  };

  return (
    <div className="min-h-screen bg-[#080706] text-[#F8F5EF] p-4 md:p-8 antialiased selection:bg-[#FF6A00] selection:text-white">
      {/* ATMOSPHERIC BACKGROUND */}
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_-20%,rgba(255,106,0,0.15),transparent_65%)]" />

      <div className="max-w-6xl mx-auto space-y-6 relative z-10">
        {/* HEADER BANNER */}
        <header className="rounded-2xl bg-gradient-to-r from-[#1C140E] to-[#12100D] border-2 border-[#6B3A16] p-6 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FF6A00] to-[#FFD21F] p-0.5 flex items-center justify-center text-2xl shadow-[0_0_20px_rgba(255,106,0,0.4)]">
              👑
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-black uppercase text-[#F8F5EF] tracking-tight">
                  SUPER ADMIN GOVERNANCE
                </h1>
                <span className="bg-[#FFD21F]/20 text-[#FFD21F] border border-[#FFD21F]/40 text-[10px] font-black px-2 py-0.5 rounded">
                  GOD MODE
                </span>
              </div>
              <p className="text-xs text-[#A9A29A]">
                Carnival Reserve • Global Reconciliation, Reversal Audits & Domain Telemetry
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-[#35D07F] bg-[#142319] border border-[#35D07F]/40 px-3 py-1.5 rounded-xl">
              ● All {OFFICIAL_DOMAINS.length} Domains Active
            </span>
          </div>
        </header>

        {/* TOP KPI CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-[#12100D] border border-[#2A1A10] p-4 space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-[#A9A29A]">PARTICIPANTS</span>
            <div className="text-2xl font-black text-[#F8F5EF]">1,042</div>
            <span className="text-[10px] text-[#35D07F]">Confirmed Registrations</span>
          </div>

          <div className="rounded-2xl bg-[#12100D] border border-[#2A1A10] p-4 space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-[#A9A29A]">PASSPORTS COMPLETE</span>
            <div className="text-2xl font-black text-[#FFD21F]">189</div>
            <span className="text-[10px] text-[#A9A29A]">{OFFICIAL_DOMAINS.length}/{OFFICIAL_DOMAINS.length} Domains Unlocked</span>
          </div>

          <div className="rounded-2xl bg-[#12100D] border border-[#2A1A10] p-4 space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-[#A9A29A]">TOTAL CRN ISSUED</span>
            <div className="text-2xl font-black text-[#FF8A1F]">{issuedCrn.toLocaleString()}</div>
            <span className="text-[10px] text-[#A9A29A]">Reg + Part + Winner</span>
          </div>

          <div className="rounded-2xl bg-[#12100D] border border-[#2A1A10] p-4 space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-[#A9A29A]">PENDING REVIEW FLAGS</span>
            <div className="text-2xl font-black text-[#FF4D4D]">{adminFlags.length}</div>
            <span className="text-[10px] text-[#FF4D4D]">Reversals with Deficit</span>
          </div>
        </div>

        {/* SECTION 1: SYSTEM CURRENCY RECONCILIATION */}
        <div className="rounded-2xl bg-[#12100D] border-2 border-[#2A1A10] p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-[#2A1A10] pb-3">
            <div>
              <h2 className="text-base font-black uppercase text-[#F8F5EF]">
                SYSTEM CURRENCY RECONCILIATION
              </h2>
              <p className="text-xs text-[#A9A29A]">
                Formula: Expected Outstanding = Issued - Reversed - Redeemed. Must match SUM(Wallet Balances).
              </p>
            </div>

            <span
              className={`text-xs font-black px-3 py-1 rounded-full border ${
                reconciliation.isReconciled
                  ? 'bg-[#35D07F]/20 text-[#35D07F] border-[#35D07F]'
                  : 'bg-[#FF4D4D]/20 text-[#FF4D4D] border-[#FF4D4D]'
              }`}
            >
              {reconciliation.isReconciled ? '✓ RECONCILED (0 DISCREPANCY)' : '⚠️ DISCREPANCY DETECTED'}
            </span>
          </div>

          {/* Audit Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 font-mono text-xs">
            <div className="bg-[#1A1612] border border-[#2A1A10] p-3 rounded-xl">
              <span className="text-[10px] text-[#A9A29A] block uppercase font-sans">Total Issued</span>
              <span className="text-sm font-bold text-[#35D07F]">+{issuedCrn.toLocaleString()} Crn</span>
            </div>

            <div className="bg-[#1A1612] border border-[#2A1A10] p-3 rounded-xl">
              <span className="text-[10px] text-[#A9A29A] block uppercase font-sans">Total Reversed</span>
              <span className="text-sm font-bold text-[#FF8A1F]">-{reversedCrn.toLocaleString()} Crn</span>
            </div>

            <div className="bg-[#1A1612] border border-[#2A1A10] p-3 rounded-xl">
              <span className="text-[10px] text-[#A9A29A] block uppercase font-sans">Total Redeemed</span>
              <span className="text-sm font-bold text-[#FF4D4D]">-{redeemedCrn.toLocaleString()} Crn</span>
            </div>

            <div className="bg-[#1A1612] border border-[#FFD21F]/40 p-3 rounded-xl">
              <span className="text-[10px] text-[#FFD21F] block uppercase font-sans font-bold">Expected Outstanding</span>
              <span className="text-sm font-bold text-[#FFD21F]">{reconciliation.expectedOutstanding.toLocaleString()} Crn</span>
            </div>

            <div className="bg-[#1A1612] border border-[#2A1A10] p-3 rounded-xl">
              <span className="text-[10px] text-[#A9A29A] block uppercase font-sans">Actual Wallet Sum</span>
              <span className="text-sm font-bold text-white">{reconciliation.actualWalletTotal.toLocaleString()} Crn</span>
            </div>
          </div>

          {/* Discrepancy Status Box */}
          <div
            className={`p-4 rounded-xl border text-xs font-bold flex items-center justify-between ${
              reconciliation.isReconciled
                ? 'bg-[#142319] border-[#35D07F]/50 text-[#35D07F]'
                : 'bg-[#2D1212] border-[#FF4D4D] text-[#FF4D4D]'
            }`}
          >
            <span>
              {reconciliation.isReconciled
                ? '✅ AUDIT VERIFIED: Total participant wallets precisely equal Expected Outstanding Currency. Zero leak detected.'
                : `⚠️ WARNING: Currency mismatch of ${reconciliation.discrepancy} Crn detected between expected and actual participant balances!`}
            </span>
            <button
              onClick={() => setActualWalletTotal(issuedCrn - reversedCrn - redeemedCrn)}
              className="px-3 py-1 bg-black/40 hover:bg-black text-white text-[10px] font-black uppercase rounded border border-current"
            >
              SYNC LEDGER
            </button>
          </div>
        </div>

        {/* SECTION 2: ADMIN REVIEW FLAGS (REVERSALS WITH DEFICIT) */}
        <div className="rounded-2xl bg-[#12100D] border-2 border-[#2A1A10] p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-[#2A1A10] pb-3">
            <div>
              <h2 className="text-base font-black uppercase text-[#F8F5EF]">
                ADMIN REVIEW FLAGS (ESCALATED REVERSALS)
              </h2>
              <p className="text-xs text-[#A9A29A]">
                Reversals blocked because participant balance is less than the reversal amount
              </p>
            </div>
            <span className="bg-[#FF4D4D]/20 text-[#FF4D4D] text-xs font-black px-2.5 py-0.5 rounded-full border border-[#FF4D4D]/40">
              {adminFlags.length} PENDING
            </span>
          </div>

          {adminFlags.length === 0 ? (
            <div className="text-center py-6 text-xs text-[#A9A29A] border-2 border-dashed border-[#2A1A10] rounded-xl">
              No pending reversal deficit tickets. All reversals processed within balance limits.
            </div>
          ) : (
            <div className="space-y-3">
              {adminFlags.map((flag) => (
                <div
                  key={flag.id}
                  className="rounded-xl bg-[#1A1612] border border-[#FF4D4D]/50 p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-white">{flag.participantName}</span>
                      <span className="text-[10px] font-mono text-[#FFD21F]">({flag.participantId})</span>
                      <span className="text-[9px] font-bold bg-[#FF4D4D]/20 text-[#FF4D4D] px-2 py-0.5 rounded border border-[#FF4D4D]/40">
                        {flag.status}
                      </span>
                    </div>
                    <p className="text-xs text-[#A9A29A]">{flag.reason}</p>
                    <div className="text-[10px] text-[#64748B] flex gap-3">
                      <span>Operator: {flag.managerName} ({flag.managerId})</span>
                      <span>•</span>
                      <span>Attempted: {flag.attemptedAmount} Crn</span>
                      <span>•</span>
                      <span>Current Balance: {flag.currentBalance} Crn</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleResolveFlag(flag.id)}
                      className="px-3 py-1.5 bg-[#35D07F] hover:bg-[#35D07F]/80 text-black font-black text-xs uppercase rounded-lg shadow"
                    >
                      MANUAL RESOLVE
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SECTION 3: 18 FESTIVAL DOMAINS TELEMETRY */}
        <div className="rounded-2xl bg-[#12100D] border-2 border-[#2A1A10] p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-[#2A1A10] pb-3">
            <div>
              <h2 className="text-base font-black uppercase text-[#F8F5EF]">
                {OFFICIAL_DOMAINS.length} FESTIVAL DOMAINS TELEMETRY
              </h2>
              <p className="text-xs text-[#A9A29A]">Single source of truth operational domain accounts</p>
            </div>
            <span className="text-xs text-[#35D07F] font-bold">{OFFICIAL_DOMAINS.length}/{OFFICIAL_DOMAINS.length} Operational</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {OFFICIAL_DOMAINS.map((domain) => (
              <div
                key={domain.id}
                className="rounded-xl bg-[#1A1612] border border-[#2A1A10] p-3 flex items-center justify-between hover:border-[#6B3A16] transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">{domain.icon}</span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-xs font-black text-white">{domain.displayName}</h4>
                      <span className="text-[9px] font-mono text-[#FF8A1F] bg-[#2A1A10] px-1 rounded">
                        {domain.accountRef}
                      </span>
                    </div>
                    <span className="text-[9px] text-[#A9A29A]">{domain.category}</span>
                  </div>
                </div>
                <span className="w-2 h-2 rounded-full bg-[#35D07F] shadow-[0_0_6px_#35D07F]" />
              </div>
            ))}
          </div>
        </div>

        {/* SECTION 4: AUTOMATED INVENTORY STOCK AUDIT */}
        <div className="rounded-2xl bg-[#12100D] border-2 border-[#2A1A10] p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-[#2A1A10] pb-3">
            <div>
              <h2 className="text-base font-black uppercase text-[#F8F5EF]">
                AUTOMATED INVENTORY AUDIT TABLE
              </h2>
              <p className="text-xs text-[#A9A29A]">
                Closing Count (Available + Reserved) MUST equal Opening minus Sold
              </p>
            </div>
            <span className="bg-[#FF8A1F]/20 text-[#FF8A1F] text-xs font-bold px-3 py-1 rounded-full border border-[#FF8A1F]/40">
              Magefficie Reward Vault (ACC-19)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="border-b border-[#2A1A10] text-[#A9A29A] uppercase text-[10px]">
                <tr>
                  <th className="py-2 px-3">Item Name</th>
                  <th className="py-2 px-3">Tier</th>
                  <th className="py-2 px-3">Opening</th>
                  <th className="py-2 px-3">Sold</th>
                  <th className="py-2 px-3">Available</th>
                  <th className="py-2 px-3">Expected</th>
                  <th className="py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1612]">
                {inventoryReport.map((item) => (
                  <tr key={item.itemId} className={!item.isReconciled ? 'bg-[#2D1212]/40' : ''}>
                    <td className="py-2.5 px-3 font-sans font-bold text-white">{item.name}</td>
                    <td className="py-2.5 px-3">Tier {item.tier}</td>
                    <td className="py-2.5 px-3">{item.openingCount}</td>
                    <td className="py-2.5 px-3">{item.soldCount}</td>
                    <td className="py-2.5 px-3">{item.availableCount}</td>
                    <td className="py-2.5 px-3">{item.expectedAvailable}</td>
                    <td className="py-2.5 px-3">
                      {item.isReconciled ? (
                        <span className="text-[#35D07F] font-bold text-[10px] bg-[#142319] px-2 py-0.5 rounded border border-[#35D07F]/40">
                          MATCHED
                        </span>
                      ) : (
                        <span className="text-[#FF4D4D] font-bold text-[10px] bg-[#2D1212] px-2 py-0.5 rounded border border-[#FF4D4D]/40">
                          MISMATCH ({item.discrepancy})
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
