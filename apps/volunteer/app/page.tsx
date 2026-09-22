'use client';

import React, { useState } from 'react';
import { OFFICIAL_DOMAINS, REWARD_CONSTANTS } from '../../../packages/utils/src/domains';

interface ScanHistoryItem {
  id: string;
  participantId: string;
  domainName: string;
  type: 'PARTICIPATION_CREDIT' | 'WINNER_CREDIT';
  amount: number;
  timestamp: string;
  createdAt: number;
  isReversed?: boolean;
}

export default function DomainManagerScannerPanel() {
  // Assigned Domain selection (Defaulting to ACC-07 Electrizite for demonstration)
  const [assignedAccountRef, setAssignedAccountRef] = useState<string>('ACC-07');
  const [managerId] = useState<string>('DM-07');
  const [managerName] = useState<string>('Vikram Rao');

  // Scanner Form State
  const [scannedParticipantId, setScannedParticipantId] = useState<string>('');
  const [isWinnerCredit, setIsWinnerCredit] = useState<boolean>(false);
  const [proofPhotoUrl, setProofPhotoUrl] = useState<string>('https://storage.carnival.edu/proofs/winner_1042.jpg');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  // Reversal Form State
  const [reversalReason, setReversalReason] = useState<string>('');
  const [targetTxForReversal, setTargetTxForReversal] = useState<string>('');

  // Sample Database of completed domains for participant CR-XXXXXXXX
  const [participantCompletions, setParticipantCompletions] = useState<Record<string, boolean>>({
    'Agritech': true,
    'Architecture': true,
    'Bluebook': true,
    // Electrizite is pending!
  });

  // Local Recent Transaction Ledger for 5-Minute Reversals
  const [recentTransactions, setRecentTransactions] = useState<ScanHistoryItem[]>([
    {
      id: 'tx_demo_01',
      participantId: 'CR-104921',
      domainName: 'Electrizite',
      type: 'PARTICIPATION_CREDIT',
      amount: 50,
      timestamp: 'Just now',
      createdAt: Date.now() - 60 * 1000, // 1 minute ago
    },
  ]);

  // Find active domain config
  const currentDomain = OFFICIAL_DOMAINS.find((d) => d.accountRef === assignedAccountRef) || OFFICIAL_DOMAINS[6];

  // Check if participant already completed this domain
  const isAlreadyCompleted = !!participantCompletions[currentDomain.displayName];

  // Execute Credit Action
  const handleExecuteCredit = () => {
    if (!scannedParticipantId.trim()) {
      setStatusMsg({ type: 'error', text: 'Please enter or scan a valid Participant ID.' });
      return;
    }

    // Server-Side Duplicate Check Simulation
    if (isAlreadyCompleted) {
      setStatusMsg({
        type: 'error',
        text: `❌ DOMAIN ALREADY COMPLETED: Participant ${scannedParticipantId} has already completed ${currentDomain.displayName}. Duplicate credit blocked!`,
      });
      return;
    }

    if (isWinnerCredit && (!proofPhotoUrl || !proofPhotoUrl.trim())) {
      setStatusMsg({ type: 'error', text: '📸 Winner credits strictly require a proof photo URL.' });
      return;
    }

    const rewardAmount = isWinnerCredit ? REWARD_CONSTANTS.WINNER : REWARD_CONSTANTS.PARTICIPATION;
    const txId = `tx_${Date.now()}`;

    // Record Completion
    setParticipantCompletions((prev) => ({
      ...prev,
      [currentDomain.displayName]: true,
    }));

    // Record Ledger Entry
    const newTx: ScanHistoryItem = {
      id: txId,
      participantId: scannedParticipantId,
      domainName: currentDomain.displayName,
      type: isWinnerCredit ? 'WINNER_CREDIT' : 'PARTICIPATION_CREDIT',
      amount: rewardAmount,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: Date.now(),
    };

    setRecentTransactions((prev) => [newTx, ...prev]);
    setTargetTxForReversal(txId);

    setStatusMsg({
      type: 'success',
      text: `✓ ${isWinnerCredit ? 'WINNER' : 'PARTICIPATION'} RECORDED: +${rewardAmount} Crn credited to ${scannedParticipantId}. Passport digitally stamped!`,
    });
  };

  // 5-Minute Additive Reversal Execution
  const handleExecuteReversal = () => {
    if (!reversalReason.trim()) {
      setStatusMsg({ type: 'error', text: '❌ REVERSAL FAILED: A valid explanation/reason is mandatory.' });
      return;
    }

    const tx = recentTransactions.find((t) => t.id === targetTxForReversal && !t.isReversed);
    if (!tx) {
      setStatusMsg({ type: 'error', text: '❌ REVERSAL FAILED: Transaction not found or already reversed.' });
      return;
    }

    // 5-Minute Window Check
    const elapsedMinutes = (Date.now() - tx.createdAt) / (1000 * 60);
    if (elapsedMinutes > 5) {
      setStatusMsg({
        type: 'error',
        text: '❌ REVERSAL WINDOW EXPIRED: 5 minutes have elapsed since the transaction. Super Admin manual override required.',
      });
      return;
    }

    // Execute Reversal: Mark as reversed, restore passport state
    setRecentTransactions((prev) =>
      prev.map((t) => (t.id === tx.id ? { ...t, isReversed: true } : t))
    );

    setParticipantCompletions((prev) => {
      const next = { ...prev };
      delete next[tx.domainName];
      return next;
    });

    setReversalReason('');
    setStatusMsg({
      type: 'warning',
      text: `↺ REVERSAL EXECUTED: Transaction ${tx.id} reversed (-${tx.amount} Crn). Passport stamp for ${tx.domainName} reset. Reason: "${reversalReason}"`,
    });
  };

  return (
    <div className="min-h-screen bg-[#080706] text-[#F8F5EF] p-4 md:p-6 antialiased selection:bg-[#FF6A00] selection:text-white">
      {/* ATMOSPHERIC BACKGROUND */}
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_-20%,rgba(255,106,0,0.15),transparent_65%)]" />

      <main className="max-w-md mx-auto space-y-5 relative z-10">
        {/* HEADER BAR */}
        <header className="rounded-2xl bg-[#12100D] border-2 border-[#2A1A10] p-4 shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#2A1A10] border border-[#FF6A00] flex items-center justify-center text-xl">
              ⚡
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-black uppercase text-[#F8F5EF]">DOMAIN MANAGER</h1>
                <span className="text-[9px] font-mono font-bold bg-[#FF6A00] text-black px-1.5 py-0.2 rounded">
                  {currentDomain.accountRef}
                </span>
              </div>
              <p className="text-[10px] text-[#A9A29A]">
                Operator: {managerName} ({managerId})
              </p>
            </div>
          </div>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#35D07F]/20 text-[#35D07F] border border-[#35D07F]/40 font-black uppercase">
            ONLINE
          </span>
        </header>

        {/* DOMAIN SELECTION BOX (SERVER ASSIGNMENT LOCK) */}
        <div className="rounded-2xl bg-[#12100D] border border-[#2A1A10] p-4 space-y-2">
          <label className="text-[10px] font-black uppercase tracking-wider text-[#A9A29A] block">
            ASSIGNED FESTIVAL DOMAIN
          </label>
          <select
            value={assignedAccountRef}
            onChange={(e) => {
              setAssignedAccountRef(e.target.value);
              setStatusMsg(null);
            }}
            className="w-full bg-[#1A1612] border border-[#6B3A16] rounded-xl p-2.5 text-xs font-bold text-white outline-none focus:border-[#FF6A00]"
          >
            {OFFICIAL_DOMAINS.map((domain) => (
              <option key={domain.accountRef} value={domain.accountRef}>
                {domain.accountRef} • {domain.displayName} ({domain.category})
              </option>
            ))}
          </select>
          <p className="text-[9px] text-[#A9A29A]">
            Server Guard: Domain Manager can only process transactions for their assigned domain account.
          </p>
        </div>

        {/* STATUS ALERT NOTIFICATION */}
        {statusMsg && (
          <div
            className={`p-3.5 rounded-xl border-2 text-xs font-bold shadow-lg ${
              statusMsg.type === 'success'
                ? 'bg-[#142319] border-[#35D07F] text-[#35D07F]'
                : statusMsg.type === 'error'
                ? 'bg-[#2D1212] border-[#FF4D4D] text-[#FF4D4D]'
                : 'bg-[#2A1E0E] border-[#FFD21F] text-[#FFD21F]'
            }`}
          >
            {statusMsg.text}
          </div>
        )}

        {/* SCANNER TERMINAL CARD */}
        <div className="rounded-2xl bg-gradient-to-b from-[#1C140E] to-[#12100D] border-2 border-[#6B3A16] p-5 shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-[#2A1A10] pb-2">
            <h2 className="text-sm font-black uppercase text-[#FF8A1F]">PARTICIPANT SCANNER</h2>
            <span className="text-[10px] font-mono text-[#A9A29A]">Camera Ready</span>
          </div>

          {/* Camera Viewfinder Mock */}
          <div className="rounded-xl bg-black border-2 border-dashed border-[#FF6A00]/50 p-6 text-center space-y-2 relative overflow-hidden">
            <div className="w-24 h-24 mx-auto border-2 border-[#FFD21F] rounded-xl flex items-center justify-center bg-[#1A130E]/50">
              <span className="text-xs font-mono text-[#FFD21F] animate-pulse">[ SCAN QR ]</span>
            </div>
            <p className="text-[10px] text-[#A9A29A]">Position Participant QR Code in Frame</p>
          </div>

          {/* Participant ID Input */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-[#A9A29A] block mb-1">
              OR ENTER PARTICIPANT ID
            </label>
            <input
              type="text"
              value={scannedParticipantId}
              onChange={(e) => {
                setScannedParticipantId(e.target.value);
                setStatusMsg(null);
              }}
              placeholder="e.g. CR-XXXXXXXX"
              className="w-full bg-[#1A1612] border border-[#2A1A10] focus:border-[#FF6A00] rounded-xl p-2.5 text-xs font-mono font-bold text-white uppercase outline-none"
            />
          </div>

          {/* Live Participant Status Check */}
          <div className="rounded-xl bg-[#12100D] border border-[#2A1A10] p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-[#A9A29A]">Participant:</span>
              <span className="font-bold text-white">{scannedParticipantId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#A9A29A]">Domain Status:</span>
              <span
                className={`font-black uppercase text-[10px] px-2 py-0.5 rounded ${
                  isAlreadyCompleted
                    ? 'bg-[#FF4D4D]/20 text-[#FF4D4D] border border-[#FF4D4D]/40'
                    : 'bg-[#35D07F]/20 text-[#35D07F] border border-[#35D07F]/40'
                }`}
              >
                {isAlreadyCompleted ? 'ALREADY COMPLETED' : 'NOT COMPLETED (READY)'}
              </span>
            </div>
          </div>

          {/* Result Type Selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-[#A9A29A] block">
              CHOOSE RESULT TYPE
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsWinnerCredit(false)}
                className={`py-2 px-3 rounded-xl border text-xs font-black uppercase transition-all ${
                  !isWinnerCredit
                    ? 'bg-[#FF6A00] border-[#FF6A00] text-black shadow-md'
                    : 'bg-[#1A1612] border-[#2A1A10] text-[#A9A29A]'
                }`}
              >
                PARTICIPATION (+50)
              </button>
              <button
                type="button"
                onClick={() => setIsWinnerCredit(true)}
                className={`py-2 px-3 rounded-xl border text-xs font-black uppercase transition-all ${
                  isWinnerCredit
                    ? 'bg-[#FFD21F] border-[#FFD21F] text-black shadow-md'
                    : 'bg-[#1A1612] border-[#2A1A10] text-[#A9A29A]'
                }`}
              >
                WINNER (+250)
              </button>
            </div>
          </div>

          {/* Proof Photo URL for Winner */}
          {isWinnerCredit && (
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-[#FFD21F] block">
                📸 MANDATORY WINNER PROOF URL
              </label>
              <input
                type="text"
                value={proofPhotoUrl}
                onChange={(e) => setProofPhotoUrl(e.target.value)}
                placeholder="https://storage.carnival.edu/proofs/winner_xxx.jpg"
                className="w-full bg-[#1A1612] border border-[#FFD21F]/60 rounded-xl p-2 text-xs font-mono text-white outline-none"
              />
            </div>
          )}

          {/* Submit Credit Button */}
          <button
            onClick={handleExecuteCredit}
            className="w-full py-3 bg-gradient-to-r from-[#FF6A00] to-[#FFD21F] hover:from-[#FF8A1F] hover:to-[#FFD21F] text-black font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition-all"
          >
            {isWinnerCredit ? 'RECORD WINNER (+250 Crn)' : 'RECORD PARTICIPATION (+50 Crn)'}
          </button>
        </div>

        {/* 5-MINUTE REVERSAL SECTION */}
        <div className="rounded-2xl bg-[#12100D] border-2 border-[#2A1A10] p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[#2A1A10] pb-2">
            <span className="text-xs font-black uppercase text-[#FF8A1F]">⏱️ 5-MINUTE REVERSAL DESK</span>
            <span className="text-[9px] text-[#A9A29A]">Self-Service Undo</span>
          </div>

          <p className="text-[11px] text-[#A9A29A] leading-relaxed">
            Domain Managers can reverse accidental credits within 5 minutes. The reversal creates an additive ledger entry, restores the wallet balance, and frees the domain stamp.
          </p>

          <div className="space-y-2">
            <div>
              <label className="text-[9px] font-bold text-[#A9A29A] uppercase block mb-1">Target Transaction</label>
              <select
                value={targetTxForReversal}
                onChange={(e) => setTargetTxForReversal(e.target.value)}
                className="w-full bg-[#1A1612] border border-[#2A1A10] rounded-xl p-2 text-xs font-mono text-white outline-none"
              >
                {recentTransactions.map((tx) => (
                  <option key={tx.id} value={tx.id} disabled={tx.isReversed}>
                    {tx.id} • {tx.participantId} (+{tx.amount} Crn) {tx.isReversed ? '[ALREADY REVERSED]' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[9px] font-bold text-[#A9A29A] uppercase block mb-1">
                Mandatory Reason for Reversal
              </label>
              <input
                type="text"
                value={reversalReason}
                onChange={(e) => setReversalReason(e.target.value)}
                placeholder="e.g. Accidental double scan / Wrong participant"
                className="w-full bg-[#1A1612] border border-[#2A1A10] focus:border-[#FF4D4D] rounded-xl p-2 text-xs text-white outline-none"
              />
            </div>

            <button
              onClick={handleExecuteReversal}
              className="w-full py-2 bg-[#2A1A10] hover:bg-[#FF4D4D] text-[#FF4D4D] hover:text-white border border-[#FF4D4D]/50 font-black text-xs uppercase rounded-xl transition-all"
            >
              UNDO / REVERSE TRANSACTION
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
