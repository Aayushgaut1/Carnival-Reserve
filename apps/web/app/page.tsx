'use client';

import React, { useState, useMemo } from 'react';
import { OFFICIAL_DOMAINS, REWARD_CONSTANTS, DomainConfig, REQUIRED_DOMAIN_COUNT } from '../../../packages/utils/src/domains';

interface ClaimedDomainState {
  isWinner: boolean;
  time: string;
}

interface RewardItem {
  id: string;
  name: string;
  price: number;
  icon: string;
  stock: number;
  tag: string;
}

const INITIAL_REWARDS: RewardItem[] = [
  { id: '1', name: 'Pop Art Sticker Pack', price: 150, icon: '🏷️', stock: 120, tag: 'Popular' },
  { id: '2', name: 'Festival Crunch Snack Combo', price: 250, icon: '🍿', stock: 85, tag: 'Tasty' },
  { id: '3', name: 'Embroidered Log Notebook', price: 650, icon: '📓', stock: 45, tag: 'Limited Edition' },
  { id: '4', name: 'Champion Snapback Cap', price: 1200, icon: '🧢', stock: 20, tag: 'Exclusive' },
  { id: '5', name: 'Concert VIP Festival Hoodie', price: 2500, icon: '🧥', stock: 8, tag: 'Legendary' },
];

export default function ParticipantPortal() {
  // Navigation
  const [activeTab, setActiveTab] = useState<'home' | 'passport' | 'domains' | 'qr' | 'shop' | 'leaderboard'>('home');
  const [showRegisterModal, setShowRegisterModal] = useState<boolean>(false);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);

  // Participant Account State
  const [participant, setParticipant] = useState({
    id: '',
    name: '',
    regNo: '21BCE1042',
    phone: '+91 98765 43210',
    isRegistered: false,
  });

  // Registration Form State
  const [regForm, setRegForm] = useState({
    name: '',
    regNo: '',
    phone: '',
    otp: '',
    termsAccepted: false,
    otpSent: false,
  });

  // Wallet & Domain Completion State
  const [balance, setBalance] = useState<number>(0);
  const [claimedDomains, setClaimedDomains] = useState<Record<string, ClaimedDomainState>>({
    'Agritech': { isWinner: false, time: '10:15 AM' },
    'Architecture': { isWinner: false, time: '11:00 AM' },
    'Bluebook': { isWinner: true, time: '11:45 AM' },
    'Challenges & Championships': { isWinner: true, time: '01:20 PM' },
    'Cosmic Quest': { isWinner: false, time: '02:00 PM' },
    'Digital Design': { isWinner: false, time: '02:30 PM' },
    'Fundaz': { isWinner: false, time: '03:15 PM' },
    'Konstruktion & Canoe Challenge': { isWinner: true, time: '03:50 PM' },
    'Machination': { isWinner: false, time: '04:10 PM' },
    'Praesentatio': { isWinner: false, time: '04:45 PM' },
    'Robogyan': { isWinner: true, time: '05:10 PM' },
    'Vimanaz': { isWinner: false, time: '05:40 PM' },
  });

  // Reward Store State
  const [rewards, setRewards] = useState<RewardItem[]>(INITIAL_REWARDS);
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>({
    '1': 1,
    '2': 1,
    '3': 1,
    '4': 1,
    '5': 1,
  });

  // Domain Exploration Search & Filter
  const [domainSearch, setDomainSearch] = useState<string>('');
  const [domainFilter, setDomainFilter] = useState<'all' | 'completed' | 'pending'>('all');
  const [notification, setNotification] = useState<string | null>(null);

  // Computed Values
  const completedCount = Object.keys(claimedDomains).length;
  const isVaultUnlocked = completedCount >= REQUIRED_DOMAIN_COUNT;
  const progressPercentage = Math.round((completedCount / REQUIRED_DOMAIN_COUNT) * 100);

  // Next Quest Calculation: Find first uncompleted official domain
  const nextQuestDomain = useMemo(() => {
    return OFFICIAL_DOMAINS.find((d) => !claimedDomains[d.displayName]) || OFFICIAL_DOMAINS[0];
  }, [claimedDomains]);

  // Toast Helper
  const triggerToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  // Registration & OTP Submission
  const handleSendOtp = () => {
    if (!regForm.name || !regForm.regNo || !regForm.phone) {
      alert('Please fill in Name, Reg No, and Phone Number.');
      return;
    }
    setRegForm((prev) => ({ ...prev, otpSent: true, otp: '4829' }));
    triggerToast('📱 OTP sent to ' + regForm.phone + ' (Use 4829 for demo)');
  };

  const handleCompleteRegistration = () => {
    if (!regForm.termsAccepted) {
      alert('You must accept the Festival Terms & Conditions.');
      return;
    }
    const newId = `CR-${Math.floor(100000 + Math.random() * 900000)}`;
    setParticipant({
      id: newId,
      name: regForm.name,
      regNo: regForm.regNo,
      phone: regForm.phone,
      isRegistered: false,
    });
    setBalance(REWARD_CONSTANTS.REGISTRATION); // +50 Crn Registration Bonus
    setClaimedDomains({});
    setShowRegisterModal(false);
    triggerToast(`🎉 Welcome ${regForm.name}! Received +50 Crn Registration Bonus. ID: ${newId}`);
  };

  // Simulation of Domain Credit (for interactive testing)
  const handleSimulateCredit = (domainName: string, isWinner: boolean) => {
    if (claimedDomains[domainName]) {
      triggerToast(`⚠️ ${domainName} is already stamped! One credit per domain rule enforced.`);
      return;
    }
    const amount = isWinner ? REWARD_CONSTANTS.WINNER : REWARD_CONSTANTS.PARTICIPATION;
    setBalance((prev) => prev + amount);
    setClaimedDomains((prev) => ({
      ...prev,
      [domainName]: { isWinner, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
    }));
    triggerToast(`⚡ Stamp Claimed: ${domainName} (+${amount} Crn ${isWinner ? 'Winner' : 'Participation'})!`);
  };

  // Magefficie Purchase
  const handleRedeemReward = (reward: RewardItem) => {
    if (!isVaultUnlocked) {
      triggerToast('🔒 Vault Locked: You must complete all 17 domains to unlock Magefficie!');
      return;
    }
    const qty = selectedQuantities[reward.id] || 1;
    const totalCost = reward.price * qty;

    if (balance < totalCost) {
      triggerToast(`❌ Insufficient Crn! Need ${totalCost} Crn, current balance is ${balance} Crn.`);
      return;
    }
    if (reward.stock < qty) {
      triggerToast(`❌ Insufficient stock! Only ${reward.stock} left.`);
      return;
    }

    setBalance((prev) => prev - totalCost);
    setRewards((prev) =>
      prev.map((item) => (item.id === reward.id ? { ...item, stock: item.stock - qty } : item))
    );
    triggerToast(`🛍️ Redeemed ${qty}x ${reward.name} for ${totalCost} Crn! Head to Magefficie Desk.`);
  };

  return (
    <div className="min-h-screen bg-[#080706] text-[#F8F5EF] pb-28 antialiased selection:bg-[#FF6A00] selection:text-white">
      {/* ATMOSPHERIC BACKGROUND LIGHTING */}
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_-20%,rgba(255,106,0,0.18),transparent_65%)]" />
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_100%_60%,rgba(255,210,31,0.08),transparent_50%)]" />

      {/* TOP FESTIVAL APP BAR */}
      <header className="sticky top-0 z-40 bg-[#12100D]/90 backdrop-blur-md border-b border-[#2A1A10] px-4 py-3 shadow-lg">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF6A00] to-[#FFD21F] p-0.5 shadow-[0_0_15px_rgba(255,106,0,0.4)] flex items-center justify-center">
              <span className="text-xl">🎠</span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-black text-sm uppercase tracking-wider text-[#F8F5EF] leading-none">
                  CARNIVAL <span className="text-[#FF6A00]">RESERVE</span>
                </h1>
                <span className="bg-[#FF6A00]/20 text-[#FF8A1F] border border-[#FF6A00]/40 text-[9px] font-bold px-1.5 py-0.2 rounded">
                  FEST 2026
                </span>
              </div>
              <p className="text-[10px] font-mono text-[#A9A29A] mt-0.5">
                {participant.id} • {participant.name}
              </p>
            </div>
          </div>

          {/* CRN WALLET CAPSULE */}
          <div
            onClick={() => setActiveTab('home')}
            className="cursor-pointer bg-gradient-to-r from-[#1A130E] to-[#2A1A10] border border-[#FFD21F]/40 hover:border-[#FFD21F] px-3.5 py-1.5 rounded-xl shadow-[0_0_15px_rgba(255,210,31,0.15)] flex items-center gap-2 transition-all"
          >
            <div>
              <span className="text-[8px] font-black uppercase tracking-wider text-[#FFD21F] block leading-none">
                WALLET
              </span>
              <span className="text-base font-black text-[#FFD21F] leading-none">
                {balance.toLocaleString()} <span className="text-[10px] text-[#F8F5EF]">Crn</span>
              </span>
            </div>
            <span className="text-lg animate-pulse">✦</span>
          </div>
        </div>
      </header>

      {/* TOAST ALERT NOTIFICATION */}
      {notification && (
        <div className="fixed top-16 left-4 right-4 z-50 max-w-md mx-auto bg-[#1A130E] border-2 border-[#FF6A00] text-[#F8F5EF] p-3 rounded-xl shadow-[0_0_20px_rgba(255,106,0,0.4)] text-xs font-bold flex items-center justify-between animate-bounce">
          <span>{notification}</span>
          <button onClick={() => setNotification(null)} className="text-[#A9A29A] hover:text-white text-sm ml-2">
            ✕
          </button>
        </div>
      )}

      {/* MAIN MOBILE-FIRST CONTAINER */}
      <main className="max-w-md mx-auto px-4 pt-5 space-y-5">
        {/* ========================================================================= */}
        {/* TAB 1: HOME SCREEN (Cinematic Dashboard, Hero, Stats, Personal Hub, Featured Domains) */}
        {/* ========================================================================= */}
        {activeTab === 'home' && (
          <div className="space-y-6">
            {/* CINEMATIC HERO SECTION */}
            <div className="rounded-3xl bg-gradient-to-b from-[#1C110A] to-[#0A0705] border-2 border-[#6B3A16] p-6 shadow-[0_0_30px_rgba(255,106,0,0.15)] relative overflow-hidden text-center space-y-4">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,106,0,0.4),transparent_50%)] pointer-events-none" />
              <div className="relative z-10 space-y-2">
                <h2 className="text-3xl md:text-4xl font-black uppercase tracking-widest text-[#F8F5EF] leading-none">
                  CARNIVAL <br /><span className="text-[#FF6A00]">RESERVE</span>
                </h2>
                <div className="flex justify-center items-center gap-2 text-[10px] md:text-xs font-black tracking-widest text-[#FFD21F]">
                  <span>PLAY</span> • <span>EARN</span> • <span>EXPLORE</span> • <span>REDEEM</span>
                </div>
                <h3 className="text-sm md:text-base font-bold text-[#F8F5EF] tracking-wide mt-2">
                  A FESTIVAL BEYOND LIMITS
                </h3>
                <p className="text-xs text-[#A9A29A] max-w-sm mx-auto mt-2 leading-relaxed">
                  Explore {REQUIRED_DOMAIN_COUNT} unique domains, earn Crn, collect your passport stamps, and unlock exclusive rewards.
                </p>
              </div>
              <div className="relative z-10 flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => (!participant.isRegistered ? setShowRegisterModal(true) : setActiveTab('domains'))}
                  className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-[#FF6A00] to-[#FFD21F] text-black font-black text-sm uppercase rounded-xl shadow-[0_0_15px_rgba(255,106,0,0.5)] hover:scale-105 transition-transform"
                >
                  GET STARTED →
                </button>
                <button
                  onClick={() => triggerToast('🎬 Trailer coming soon!')}
                  className="w-full sm:w-auto px-6 py-3 bg-[#12100D] border border-[#6B3A16] text-[#FF8A1F] font-black text-sm uppercase rounded-xl hover:bg-[#2A1A10] transition-colors"
                >
                  WATCH TRAILER
                </button>
              </div>
            </div>

            {/* DASHBOARD SUMMARY CARDS */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-[#12100D] border border-[#2A1A10] p-3 text-center">
                <div className="text-xl font-black text-[#F8F5EF]">{REQUIRED_DOMAIN_COUNT}</div>
                <div className="text-[9px] font-bold uppercase text-[#A9A29A] tracking-wider mt-1">REQUIRED DOMAINS</div>
              </div>
              <div className="rounded-2xl bg-[#12100D] border border-[#2A1A10] p-3 text-center">
                <div className="text-xl font-black text-[#FFD21F]">1</div>
                <div className="text-[9px] font-bold uppercase text-[#A9A29A] tracking-wider mt-1">FESTIVAL JOURNEY</div>
              </div>
              <div className="rounded-2xl bg-[#12100D] border border-[#2A1A10] p-3 text-center">
                <div className="text-xl font-black text-[#FF8A1F]">∞</div>
                <div className="text-[9px] font-bold uppercase text-[#A9A29A] tracking-wider mt-1">MEMORIES</div>
              </div>
            </div>

            {/* PERSONALIZED PARTICIPANT HUB */}
            <div className="space-y-4 pt-2">
              <div className="text-center space-y-1">
                <h3 className="text-lg font-black uppercase text-[#F8F5EF] tracking-tight">
                  HEY, {participant.name.split(' ')[0]} 👋
                </h3>
                <p className="text-[10px] font-black tracking-widest text-[#FF8A1F] uppercase">
                  YOUR FESTIVAL JOURNEY AWAITS
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* WALLET */}
                <div className="rounded-2xl bg-gradient-to-br from-[#1F140A] to-[#0A0705] border border-[#FFD21F]/40 p-4 shadow-lg flex flex-col justify-between h-full">
                  <div className="text-[9px] font-black uppercase tracking-wider text-[#A9A29A] mb-2">CARNIVAL WALLET</div>
                  <div>
                    <div className="text-2xl font-black text-[#FFD21F] leading-none drop-shadow-md mb-1">
                      {balance.toLocaleString()}
                    </div>
                    <div className="text-[10px] font-bold text-[#F8F5EF]">Crn / Festival Currency</div>
                  </div>
                </div>

                {/* PASSPORT */}
                <div
                  onClick={() => setActiveTab('passport')}
                  className="rounded-2xl bg-[#12100D] border border-[#2A1A10] p-4 shadow-lg flex flex-col justify-between h-full cursor-pointer hover:border-[#6B3A16] transition-colors"
                >
                  <div className="text-[9px] font-black uppercase tracking-wider text-[#A9A29A] mb-2">CARNIVAL PASSPORT</div>
                  <div>
                    <div className="text-xl font-black text-[#F8F5EF] leading-none mb-1">
                      {completedCount} / {REQUIRED_DOMAIN_COUNT} DOMAINS
                    </div>
                    <div className="w-full bg-[#1A1612] rounded-full h-1.5 mb-1.5 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[#FF6A00] to-[#FFD21F]" style={{ width: `${Math.max(5, progressPercentage)}%` }} />
                    </div>
                    <div className="text-[10px] font-bold text-[#35D07F]">{progressPercentage}% COMPLETE</div>
                  </div>
                </div>
              </div>

              {/* NEXT QUEST */}
              <div className="rounded-2xl bg-[#12100D] border-l-4 border-l-[#FF6A00] border-t border-t-[#2A1A10] border-r border-r-[#2A1A10] border-b border-b-[#2A1A10] p-4 flex items-center justify-between">
                <div>
                  <div className="text-[9px] font-black uppercase tracking-wider text-[#A9A29A] mb-1">NEXT QUEST</div>
                  <div className="text-sm font-black text-[#F8F5EF] flex items-center gap-1.5 mb-1">
                    <span>{nextQuestDomain.icon}</span> {nextQuestDomain.displayName}
                  </div>
                  <div className="text-[9px] text-[#A9A29A]">Continue your journey and earn Crn</div>
                </div>
                <button onClick={() => setActiveTab('domains')} className="px-3 py-1.5 bg-[#1A130E] border border-[#FF6A00] text-[#FF8A1F] font-bold text-[10px] uppercase rounded-lg hover:bg-[#FF6A00] hover:text-black transition-colors">
                  ENTER →
                </button>
              </div>
            </div>

            {/* CURATED DOMAIN PREVIEW */}
            <div className="pt-4 border-t border-[#2A1A10] space-y-4">
              <div className="flex items-end justify-between">
                <div>
                  <h3 className="text-base font-black uppercase text-[#F8F5EF]">EXPLORE DOMAINS</h3>
                  <p className="text-[10px] text-[#A9A29A]">Discover the {REQUIRED_DOMAIN_COUNT} experiences waiting for you.</p>
                </div>
                <button onClick={() => setActiveTab('domains')} className="text-[10px] font-bold text-[#FF8A1F] hover:underline">
                  VIEW ALL →
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Regular Featured Domain 1 */}
                <div className="rounded-xl bg-[#12100D] border border-[#2A1A10] p-3 flex items-center gap-3">
                  <div className="text-2xl">🚀</div>
                  <div>
                    <h4 className="text-xs font-black text-[#F8F5EF]">Cosmic Quest</h4>
                    <p className="text-[9px] text-[#A9A29A]">Astronomy & Space</p>
                  </div>
                </div>
                {/* Regular Featured Domain 2 */}
                <div className="rounded-xl bg-[#12100D] border border-[#2A1A10] p-3 flex items-center gap-3">
                  <div className="text-2xl">⚡</div>
                  <div>
                    <h4 className="text-xs font-black text-[#F8F5EF]">Electrizite</h4>
                    <p className="text-[9px] text-[#A9A29A]">Electrical & Energy</p>
                  </div>
                </div>
                {/* AARUUSH FEATURED CARD */}
                <div className="sm:col-span-2 rounded-xl bg-gradient-to-r from-[#2A1305] to-[#120803] border-2 border-[#FF8A1F] p-4 shadow-[0_0_15px_rgba(255,106,0,0.2)] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-3xl filter drop-shadow-[0_0_8px_rgba(255,210,31,0.6)]">☀️</div>
                    <div>
                      <h4 className="text-sm font-black text-[#FFD21F] tracking-wide uppercase">AARUUSH</h4>
                      <p className="text-[10px] font-bold text-[#F8F5EF] uppercase">The Festival Experience</p>
                      <p className="text-[9px] text-[#A9A29A] mt-1">One more destination on your Carnival journey.</p>
                    </div>
                  </div>
                  <button onClick={() => setActiveTab('domains')} className="px-3 py-1.5 bg-[#FF6A00] text-black font-black text-[10px] uppercase rounded-lg shadow-md hover:bg-[#FFD21F] transition-colors">
                    EXPLORE →
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: DIGITAL CARNIVAL PASSPORT (All Required Domains with Glowing Stamps) */}
        {/* ========================================================================= */}
        {activeTab === 'passport' && (
          <div className="space-y-4">
            <div className="border-b border-[#2A1A10] pb-3 flex items-center justify-between">
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-[#FF8A1F]">
                  FESTIVAL IDENTITY
                </span>
                <h2 className="text-xl font-black uppercase text-[#F8F5EF]">CARNIVAL PASSPORT</h2>
              </div>
              <span className="bg-[#FF6A00]/20 text-[#FF8A1F] border border-[#FF6A00]/40 text-xs font-black px-3 py-1 rounded-full">
                {completedCount}/{REQUIRED_DOMAIN_COUNT} STAMPS
              </span>
            </div>

            {/* Passport Cover Card */}
            <div className="rounded-2xl bg-gradient-to-b from-[#1C140E] to-[#12100D] border-2 border-[#6B3A16] p-5 shadow-xl space-y-4">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 mx-auto rounded-full bg-[#FF6A00]/20 border border-[#FF6A00] flex items-center justify-center text-xl">
                  🎪
                </div>
                <h3 className="text-lg font-black tracking-wider uppercase text-[#FFD21F]">
                  OFFICIAL PASSPORT BOOK
                </h3>
                <p className="text-xs text-[#A9A29A]">
                  Issued to: <strong className="text-white">{participant.name}</strong> ({participant.id})
                </p>
              </div>

              {/* Required Domain Stamps Grid */}
              <div className="grid grid-cols-2 gap-2.5 pt-2">
                {OFFICIAL_DOMAINS.map((domain) => {
                  const stamp = claimedDomains[domain.displayName];
                  return (
                    <div
                      key={domain.id}
                      className={`relative rounded-xl p-3 border transition-all ${
                        stamp
                          ? stamp.isWinner
                            ? 'bg-[#1F180A] border-[#FFD21F] shadow-[0_0_15px_rgba(255,210,31,0.25)]'
                            : 'bg-[#1B140E] border-[#FF6A00] shadow-[0_0_15px_rgba(255,106,0,0.25)]'
                          : 'bg-[#12100D] border-[#2A1A10] opacity-60'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-1">
                        <span className="text-lg">{domain.icon}</span>
                        <span className="text-[8px] font-mono text-[#A9A29A]">{domain.accountRef}</span>
                      </div>

                      <h4 className="text-xs font-black text-[#F8F5EF] leading-snug line-clamp-1">
                        {domain.displayName}
                      </h4>

                      <div className="mt-2 pt-1 border-t border-[#2A1A10] flex items-center justify-between">
                        {stamp ? (
                          <span
                            className={`text-[9px] font-black uppercase flex items-center gap-1 ${
                              stamp.isWinner ? 'text-[#FFD21F]' : 'text-[#35D07F]'
                            }`}
                          >
                            {stamp.isWinner ? '🏆 WINNER +250' : '✓ COMPLETED +50'}
                          </span>
                        ) : (
                          <span className="text-[8px] font-bold uppercase text-[#64748B]">
                            🔒 LOCKED
                          </span>
                        )}
                        {stamp && <span className="text-[7px] text-[#A9A29A]">{stamp.time}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="text-center pt-2 text-[10px] text-[#A9A29A]">
                Note: Physical stamps and stickers are applied to your physical passport at domain booths.
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: DOMAIN EXPLORER / QUEST LIST */}
        {/* ========================================================================= */}
        {activeTab === 'domains' && (
          <div className="space-y-4">
            <div className="border-b border-[#2A1A10] pb-3">
              <span className="text-[9px] font-black uppercase tracking-widest text-[#FF8A1F]">
                EVENT DESTINATIONS
              </span>
              <h2 className="text-xl font-black uppercase text-[#F8F5EF]">17 FESTIVAL DOMAINS</h2>
              <p className="text-xs text-[#A9A29A]">Visit booth managers to play games and earn Crn</p>
            </div>

            {/* Search and Filters */}
            <div className="space-y-2">
              <input
                type="text"
                value={domainSearch}
                onChange={(e) => setDomainSearch(e.target.value)}
                placeholder="🔍 Search domains by name or category..."
                className="w-full bg-[#12100D] border border-[#2A1A10] focus:border-[#FF6A00] rounded-xl px-3.5 py-2.5 text-xs text-[#F8F5EF] outline-none"
              />

              <div className="flex gap-2">
                {(['all', 'completed', 'pending'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setDomainFilter(filter)}
                    className={`px-3 py-1 text-xs font-black uppercase rounded-lg border transition-all ${
                      domainFilter === filter
                        ? 'bg-[#FF6A00] border-[#FF6A00] text-black shadow-sm'
                        : 'bg-[#12100D] border-[#2A1A10] text-[#A9A29A] hover:text-white'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            {/* Domain Cards List */}
            <div className="space-y-3">
              {OFFICIAL_DOMAINS.filter((d) => {
                const matchesSearch =
                  d.displayName.toLowerCase().includes(domainSearch.toLowerCase()) ||
                  d.category.toLowerCase().includes(domainSearch.toLowerCase());
                const isClaimed = !!claimedDomains[d.displayName];
                if (domainFilter === 'completed') return matchesSearch && isClaimed;
                if (domainFilter === 'pending') return matchesSearch && !isClaimed;
                return matchesSearch;
              }).map((domain) => {
                const stamp = claimedDomains[domain.displayName];
                return (
                  <div
                    key={domain.id}
                    className={`rounded-2xl p-4 border transition-all ${
                      stamp
                        ? 'bg-[#1A130E] border-[#6B3A16]'
                        : 'bg-[#12100D] border-[#2A1A10] hover:border-[#FF6A00]/50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-[#080706] border border-[#2A1A10] flex items-center justify-center text-2xl">
                          {domain.icon}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-black text-[#F8F5EF]">{domain.displayName}</h4>
                            <span className="text-[9px] font-mono text-[#FF8A1F] bg-[#2A1A10] px-1.5 py-0.5 rounded">
                              {domain.accountRef}
                            </span>
                          </div>
                          <span className="text-[10px] text-[#A9A29A]">{domain.category}</span>
                        </div>
                      </div>

                      {stamp ? (
                        <span
                          className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${
                            stamp.isWinner
                              ? 'bg-[#FFD21F]/20 text-[#FFD21F] border-[#FFD21F]/50'
                              : 'bg-[#35D07F]/20 text-[#35D07F] border-[#35D07F]/50'
                          }`}
                        >
                          {stamp.isWinner ? '🏆 WINNER (+250)' : '✓ CLAIMED (+50)'}
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold text-[#A9A29A] bg-[#1A1612] px-2 py-0.5 rounded border border-[#2A1A10]">
                          NOT VISITED
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-[#A9A29A] mt-2 leading-relaxed">
                      {domain.shortDescription}
                    </p>

                    <div className="mt-3 pt-2 border-t border-[#2A1A10] flex items-center justify-between">
                      <div className="text-[10px] text-[#A9A29A] flex gap-2">
                        <span>+50 Participation</span>
                        <span>•</span>
                        <span className="text-[#FFD21F]">+250 Winner</span>
                      </div>

                      {!stamp ? (
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleSimulateCredit(domain.displayName, false)}
                            className="px-2.5 py-1 bg-[#2A1A10] hover:bg-[#FF6A00] hover:text-black text-xs font-bold rounded-lg border border-[#6B3A16] transition-all"
                          >
                            +50 Crn
                          </button>
                          <button
                            onClick={() => handleSimulateCredit(domain.displayName, true)}
                            className="px-2.5 py-1 bg-gradient-to-r from-[#FF6A00] to-[#FFD21F] text-black font-black text-xs rounded-lg shadow transition-all"
                          >
                            +250 Crn
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] font-bold text-[#35D07F]">
                          Stamped at {stamp.time}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: MY PARTICIPANT QR PASS */}
        {/* ========================================================================= */}
        {activeTab === 'qr' && (
          <div className="space-y-4 text-center">
            <div className="border-b border-[#2A1A10] pb-3 text-left">
              <span className="text-[9px] font-black uppercase tracking-widest text-[#FF8A1F]">
                OFFICIAL IDENTITY PASS
              </span>
              <h2 className="text-xl font-black uppercase text-[#F8F5EF]">MY PARTICIPANT QR</h2>
              <p className="text-xs text-[#A9A29A]">Scan at booth desks for participation and rewards</p>
            </div>

            {/* QR Pass Box */}
            <div className="rounded-3xl bg-gradient-to-b from-[#1C140E] to-[#12100D] border-2 border-[#FF6A00] p-6 shadow-[0_0_30px_rgba(255,106,0,0.25)] inline-block w-full max-w-xs space-y-4">
              <div className="bg-white p-4 rounded-2xl border-2 border-black inline-block shadow-lg">
                {/* Clean Scalable Vector QR Representation */}
                <svg width="180" height="180" viewBox="0 0 100 100" className="mx-auto">
                  <rect x="5" y="5" width="25" height="25" fill="black" />
                  <rect x="10" y="10" width="15" height="15" fill="white" />
                  <rect x="13" y="13" width="9" height="9" fill="black" />

                  <rect x="70" y="5" width="25" height="25" fill="black" />
                  <rect x="75" y="10" width="15" height="15" fill="white" />
                  <rect x="78" y="13" width="9" height="9" fill="black" />

                  <rect x="5" y="70" width="25" height="25" fill="black" />
                  <rect x="10" y="75" width="15" height="15" fill="white" />
                  <rect x="13" y="78" width="9" height="9" fill="black" />

                  <rect x="35" y="35" width="10" height="10" fill="black" />
                  <rect x="50" y="35" width="15" height="10" fill="black" />
                  <rect x="35" y="50" width="25" height="15" fill="black" />
                  <rect x="65" y="65" width="15" height="15" fill="black" />
                  <rect x="40" y="75" width="15" height="15" fill="black" />
                </svg>
              </div>

              <div>
                <span className="text-[9px] font-black uppercase text-[#A9A29A]">PARTICIPANT IDENTIFIER</span>
                <div className="text-xl font-mono font-black text-[#FFD21F] tracking-widest">
                  {participant.id}
                </div>
                <p className="text-xs font-bold text-[#F8F5EF]">{participant.name}</p>
              </div>

              <button
                onClick={() => setShowQrModal(true)}
                className="w-full py-2 bg-[#2A1A10] hover:bg-[#FF6A00] hover:text-black text-xs font-black uppercase rounded-xl border border-[#6B3A16] transition-all"
              >
                ⤢ EXPAND FULLSCREEN
              </button>
            </div>

            <div className="rounded-xl bg-[#12100D] border border-[#2A1A10] p-3 text-xs text-[#A9A29A] text-left">
              🔒 <strong>Security & Privacy Rule:</strong> This QR code encodes strictly your safe{' '}
              <code className="text-[#FFD21F]">{participant.id}</code> identifier. Private balance, phone number, and ledger secrets are never exposed in the code.
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: MAGEFFICIE REWARD VAULT (Catalog, Multi-Quantity, 17/17 Gate) */}
        {/* ========================================================================= */}
        {activeTab === 'shop' && (
          <div className="space-y-4">
            <div className="border-b border-[#2A1A10] pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#FFD21F]">
                    THE REWARD VAULT
                  </span>
                  <h2 className="text-xl font-black uppercase text-[#F8F5EF]">MAGEFFICIE</h2>
                </div>
                <span
                  className={`text-xs font-black px-3 py-1 rounded-full border ${
                    isVaultUnlocked
                      ? 'bg-[#35D07F]/20 text-[#35D07F] border-[#35D07F]'
                      : 'bg-[#FF4D4D]/20 text-[#FF4D4D] border-[#FF4D4D]'
                  }`}
                >
                  {isVaultUnlocked ? '🔓 VAULT UNLOCKED' : '🔒 VAULT LOCKED'}
                </span>
              </div>
              <p className="text-xs text-[#A9A29A] mt-1">
                Desk Location: Magefficie Counter (ACC-18) • Exchange Crn for official physical merch
              </p>
            </div>

            {/* Locked Gate Banner if < 18 Stamps */}
            {!isVaultUnlocked ? (
              <div className="rounded-2xl bg-gradient-to-br from-[#1C140E] to-[#12100D] border-2 border-[#FF4D4D]/50 p-5 text-center space-y-3 shadow-lg">
                <div className="w-12 h-12 mx-auto rounded-full bg-[#FF4D4D]/10 border border-[#FF4D4D] flex items-center justify-center text-2xl">
                  🔒
                </div>
                <h3 className="text-base font-black uppercase text-[#F8F5EF]">
                  {REQUIRED_DOMAIN_COUNT} DOMAIN COMPLETION REQUIRED
                </h3>
                <p className="text-xs text-[#A9A29A]">
                  You have completed <strong className="text-white">{completedCount} of {REQUIRED_DOMAIN_COUNT}</strong> domains. Complete all {REQUIRED_DOMAIN_COUNT} domains to unlock reward redemption at the festival desk.
                </p>
                <div className="pt-2">
                  <button
                    onClick={() => setActiveTab('domains')}
                    className="px-4 py-2 bg-gradient-to-r from-[#FF6A00] to-[#FF8A1F] text-black font-black text-xs uppercase rounded-xl shadow-md"
                  >
                    CONTINUE PASSPORT QUEST →
                  </button>
                </div>
              </div>
            ) : (
              /* 18/18 Unlocked Celebration Banner */
              <div className="rounded-2xl bg-gradient-to-r from-[#2B1B0A] via-[#1F1508] to-[#140E05] border-2 border-[#FFD21F] p-4 text-center space-y-2 shadow-[0_0_25px_rgba(255,210,31,0.3)]">
                <span className="text-2xl animate-bounce inline-block">🎉</span>
                <h3 className="text-base font-black uppercase text-[#FFD21F]">
                  PASSPORT COMPLETE ({REQUIRED_DOMAIN_COUNT} / {REQUIRED_DOMAIN_COUNT})
                </h3>
                <p className="text-xs text-[#F8F5EF]">
                  ✦ CARNIVAL JOURNEY COMPLETE ✦<br/>
                  Your festival journey is complete! You can now spend your Crn on physical merch below.
                </p>
              </div>
            )}

            {/* Catalog Items */}
            <div className="space-y-3">
              {rewards.map((reward) => {
                const qty = selectedQuantities[reward.id] || 1;
                const totalCost = reward.price * qty;

                return (
                  <div
                    key={reward.id}
                    className="rounded-2xl bg-[#12100D] border border-[#2A1A10] p-4 shadow-md space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-[#080706] border border-[#2A1A10] flex items-center justify-center text-2xl">
                          {reward.icon}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-black text-[#F8F5EF]">{reward.name}</h4>
                            <span className="text-[9px] font-bold text-[#FF8A1F] bg-[#2A1A10] px-1.5 py-0.5 rounded">
                              {reward.tag}
                            </span>
                          </div>
                          <span className="text-xs font-black text-[#FFD21F]">{reward.price} Crn each</span>
                        </div>
                      </div>
                      <span className="text-[10px] text-[#A9A29A]">Stock: {reward.stock}</span>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-[#2A1A10]">
                      {/* Quantity Selector */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[#A9A29A] font-bold uppercase">Qty:</span>
                        <div className="flex items-center border border-[#2A1A10] rounded-lg bg-[#1A1612]">
                          <button
                            onClick={() =>
                              setSelectedQuantities((prev) => ({
                                ...prev,
                                [reward.id]: Math.max(1, (prev[reward.id] || 1) - 1),
                              }))
                            }
                            className="px-2 py-0.5 text-xs text-[#A9A29A] hover:text-white"
                          >
                            -
                          </button>
                          <span className="px-2 text-xs font-mono font-bold text-white">{qty}</span>
                          <button
                            onClick={() =>
                              setSelectedQuantities((prev) => ({
                                ...prev,
                                [reward.id]: (prev[reward.id] || 1) + 1,
                              }))
                            }
                            className="px-2 py-0.5 text-xs text-[#A9A29A] hover:text-white"
                          >
                            +
                          </button>
                        </div>
                        <span className="text-xs font-mono text-[#A9A29A]">
                          = <strong className="text-[#FFD21F]">{totalCost} Crn</strong>
                        </span>
                      </div>

                      {/* Redeem Button */}
                      <button
                        onClick={() => handleRedeemReward(reward)}
                        disabled={!isVaultUnlocked}
                        className={`px-3 py-1.5 rounded-xl font-black text-xs uppercase transition-all ${
                          isVaultUnlocked
                            ? 'bg-gradient-to-r from-[#FF6A00] to-[#FFD21F] text-black shadow-md hover:opacity-90'
                            : 'bg-[#2A1A10] text-[#64748B] cursor-not-allowed border border-[#2A1A10]'
                        }`}
                      >
                        REDEEM
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 6: PRIVACY LEADERBOARD (Rank & Name ONLY) */}
        {/* ========================================================================= */}
        {activeTab === 'leaderboard' && (
          <div className="space-y-4">
            <div className="border-b border-[#2A1A10] pb-3">
              <span className="text-[9px] font-black uppercase tracking-widest text-[#FF8A1F]">
                FESTIVAL RANKINGS
              </span>
              <h2 className="text-xl font-black uppercase text-[#F8F5EF]">LEADERBOARD</h2>
              <p className="text-xs text-[#A9A29A]">
                Public view adheres strictly to Requirement 20: Raw balances masked for privacy
              </p>
            </div>

            <div className="rounded-2xl bg-[#12100D] border border-[#2A1A10] p-3 space-y-2 shadow-lg">
              {[
                { rank: 1, name: 'Aarav Sharma', isSelf: false },
                { rank: 2, name: 'Ananya Verma', isSelf: false },
                { rank: 3, name: `${participant.name} (You)`, isSelf: true },
                { rank: 4, name: 'Rohan Mehta', isSelf: false },
                { rank: 5, name: 'Priya Nair', isSelf: false },
                { rank: 6, name: 'Siddharth Iyer', isSelf: false },
                { rank: 7, name: 'Divya Joshi', isSelf: false },
              ].map((entry) => (
                <div
                  key={entry.rank}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                    entry.isSelf
                      ? 'bg-gradient-to-r from-[#2A1A10] to-[#1A130E] border-[#FFD21F] shadow-[0_0_12px_rgba(255,210,31,0.2)]'
                      : 'bg-[#1A1612] border-[#2A1A10]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                        entry.rank === 1
                          ? 'bg-[#FFD21F] text-black shadow-[0_0_8px_rgba(255,210,31,0.6)]'
                          : entry.rank === 2
                          ? 'bg-[#C0C0C0] text-black'
                          : entry.rank === 3
                          ? 'bg-[#CD7F32] text-black'
                          : 'bg-[#2A1A10] text-[#A9A29A]'
                      }`}
                    >
                      #{entry.rank}
                    </span>
                    <span className={`text-xs font-bold ${entry.isSelf ? 'text-[#FFD21F]' : 'text-[#F8F5EF]'}`}>
                      {entry.name}
                    </span>
                  </div>

                  {entry.isSelf ? (
                    <span className="text-xs font-mono font-black text-[#FFD21F]">
                      {balance.toLocaleString()} Crn
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold text-[#64748B] bg-[#080706] px-2 py-0.5 rounded border border-[#2A1A10]">
                      🔒 HIDDEN
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* MOBILE BOTTOM NAVIGATION BAR */}
      {/* ========================================================================= */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#12100D]/95 backdrop-blur-md border-t border-[#2A1A10] px-3 py-2 shadow-2xl">
        <div className="max-w-md mx-auto grid grid-cols-5 gap-1 text-center">
          {[
            { id: 'home', label: 'Home', icon: '⚡' },
            { id: 'passport', label: 'Passport', icon: '🎫' },
            { id: 'domains', label: 'Domains', icon: '🧭' },
            { id: 'leaderboard', label: 'Ranks', icon: '👑' },
            { id: 'shop', label: 'Vault', icon: isVaultUnlocked ? '🔓' : '🔒' },
          ].map((nav) => {
            const isActive = activeTab === nav.id;
            return (
              <button
                key={nav.id}
                onClick={() => setActiveTab(nav.id as any)}
                className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition-all ${
                  isActive
                    ? 'bg-gradient-to-b from-[#2A1A10] to-[#1A130E] border border-[#FF6A00] text-[#FF8A1F] shadow-[0_0_12px_rgba(255,106,0,0.3)]'
                    : 'text-[#A9A29A] hover:text-white'
                }`}
              >
                <span className="text-base leading-none mb-0.5">{nav.icon}</span>
                <span className="text-[9px] font-black uppercase tracking-tight">{nav.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ========================================================================= */}
      {/* MODAL: FULLSCREEN PARTICIPANT QR PASS */}
      {/* ========================================================================= */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#12100D] border-2 border-[#FF6A00] rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-[0_0_40px_rgba(255,106,0,0.4)]">
            <div className="flex justify-between items-center border-b border-[#2A1A10] pb-2">
              <span className="text-xs font-black uppercase text-[#FF8A1F]">CARNIVAL PASS</span>
              <button onClick={() => setShowQrModal(false)} className="text-white hover:text-[#FF6A00] text-sm">
                ✕ CLOSE
              </button>
            </div>

            <div className="bg-white p-6 rounded-2xl inline-block shadow-2xl">
              <svg width="220" height="220" viewBox="0 0 100 100" className="mx-auto">
                <rect x="5" y="5" width="25" height="25" fill="black" />
                <rect x="10" y="10" width="15" height="15" fill="white" />
                <rect x="13" y="13" width="9" height="9" fill="black" />

                <rect x="70" y="5" width="25" height="25" fill="black" />
                <rect x="75" y="10" width="15" height="15" fill="white" />
                <rect x="78" y="13" width="9" height="9" fill="black" />

                <rect x="5" y="70" width="25" height="25" fill="black" />
                <rect x="10" y="75" width="15" height="15" fill="white" />
                <rect x="13" y="78" width="9" height="9" fill="black" />

                <rect x="35" y="35" width="10" height="10" fill="black" />
                <rect x="50" y="35" width="15" height="10" fill="black" />
                <rect x="35" y="50" width="25" height="15" fill="black" />
                <rect x="65" y="65" width="15" height="15" fill="black" />
                <rect x="40" y="75" width="15" height="15" fill="black" />
              </svg>
            </div>

            <div>
              <div className="text-2xl font-mono font-black text-[#FFD21F] tracking-wider">
                {participant.id}
              </div>
              <p className="text-sm font-bold text-[#F8F5EF]">{participant.name}</p>
              <p className="text-xs font-mono text-[#A9A29A]">Reg: {participant.regNo}</p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: PARTICIPANT REGISTRATION & OTP VERIFICATION */}
      {/* ========================================================================= */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#12100D] border-2 border-[#FFD21F] rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-[0_0_35px_rgba(255,210,31,0.25)]">
            <div className="flex justify-between items-center border-b border-[#2A1A10] pb-2">
              <h3 className="text-base font-black uppercase text-[#FFD21F]">
                PARTICIPANT REGISTRATION
              </h3>
              <button onClick={() => setShowRegisterModal(false)} className="text-[#A9A29A] hover:text-white">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[#A9A29A] font-bold mb-1 uppercase text-[10px]">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Ayush Sharma"
                  value={regForm.name}
                  onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                  className="w-full bg-[#1A1612] border border-[#2A1A10] focus:border-[#FF6A00] rounded-xl p-2 text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[#A9A29A] font-bold mb-1 uppercase text-[10px]">Registration Number</label>
                <input
                  type="text"
                  placeholder="e.g. 21BCE1042"
                  value={regForm.regNo}
                  onChange={(e) => setRegForm({ ...regForm, regNo: e.target.value })}
                  className="w-full bg-[#1A1612] border border-[#2A1A10] focus:border-[#FF6A00] rounded-xl p-2 text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[#A9A29A] font-bold mb-1 uppercase text-[10px]">Phone Number</label>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={regForm.phone}
                    onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                    className="w-full bg-[#1A1612] border border-[#2A1A10] focus:border-[#FF6A00] rounded-xl p-2 text-white outline-none"
                  />
                  <button
                    onClick={handleSendOtp}
                    className="px-3 py-2 bg-[#FF6A00] hover:bg-[#FF8A1F] text-black font-black text-[10px] uppercase rounded-xl whitespace-nowrap"
                  >
                    SEND OTP
                  </button>
                </div>
              </div>

              {regForm.otpSent && (
                <div>
                  <label className="block text-[#35D07F] font-bold mb-1 uppercase text-[10px]">
                    Enter 4-Digit Phone OTP
                  </label>
                  <input
                    type="text"
                    value={regForm.otp}
                    onChange={(e) => setRegForm({ ...regForm, otp: e.target.value })}
                    className="w-full bg-[#1A1612] border border-[#35D07F] rounded-xl p-2 text-center text-lg font-mono tracking-widest text-[#35D07F] outline-none"
                  />
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="terms"
                  checked={regForm.termsAccepted}
                  onChange={(e) => setRegForm({ ...regForm, termsAccepted: e.target.checked })}
                  className="rounded border-[#2A1A10]"
                />
                <label htmlFor="terms" className="text-[10px] text-[#A9A29A]">
                  I accept the Festival Terms & Rules.
                </label>
              </div>

              <button
                onClick={handleCompleteRegistration}
                disabled={!regForm.otpSent || !regForm.termsAccepted}
                className={`w-full py-2.5 rounded-xl font-black text-xs uppercase transition-all ${
                  regForm.otpSent && regForm.termsAccepted
                    ? 'bg-gradient-to-r from-[#FF6A00] to-[#FFD21F] text-black shadow-lg hover:opacity-90'
                    : 'bg-[#2A1A10] text-[#64748B] cursor-not-allowed'
                }`}
              >
                CLAIM +50 CRN & START QUEST
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
