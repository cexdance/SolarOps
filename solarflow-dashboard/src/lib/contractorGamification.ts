// SolarOps — Contractor Gamification System
// XP is earned per job based on documentation quality, photo completeness,
// report detail, signatures, outcome, timeliness, and speed.

import { ContractorJob } from '../types/contractor';

// ── Levels ────────────────────────────────────────────────────────────────────

export interface LevelInfo {
  level: number;
  name: string;
  minXp: number;
  maxXp: number;
  color: string;       // text color class
  bg: string;          // bg color class
  border: string;      // border color class
  gradient: string;    // gradient for progress bar
  emoji: string;
}

export const LEVELS: LevelInfo[] = [
  { level: 1, name: 'Rookie',      minXp: 0,     maxXp: 500,    color: 'text-slate-500',   bg: 'bg-slate-100',   border: 'border-slate-300',   gradient: 'from-slate-400 to-slate-500',         emoji: '🔧' },
  { level: 2, name: 'Field Tech',  minXp: 500,   maxXp: 1500,   color: 'text-blue-600',    bg: 'bg-blue-100',    border: 'border-blue-300',    gradient: 'from-blue-400 to-blue-600',           emoji: '⚡' },
  { level: 3, name: 'Pro Tech',    minXp: 1500,  maxXp: 3500,   color: 'text-emerald-600', bg: 'bg-emerald-100', border: 'border-emerald-400', gradient: 'from-emerald-400 to-emerald-600',     emoji: '🌟' },
  { level: 4, name: 'Senior Tech', minXp: 3500,  maxXp: 7500,   color: 'text-amber-600',   bg: 'bg-amber-100',   border: 'border-amber-400',   gradient: 'from-amber-400 to-orange-500',         emoji: '🏆' },
  { level: 5, name: 'Elite Tech',  minXp: 7500,  maxXp: 15000,  color: 'text-orange-600',  bg: 'bg-orange-100',  border: 'border-orange-400',  gradient: 'from-orange-400 to-rose-500',          emoji: '🔥' },
  { level: 6, name: 'Master Tech', minXp: 15000, maxXp: 999999, color: 'text-purple-600',  bg: 'bg-purple-100',  border: 'border-purple-400',  gradient: 'from-purple-500 to-indigo-600',        emoji: '💎' },
];

export const getLevelInfo = (xp: number): LevelInfo =>
  [...LEVELS].reverse().find(l => xp >= l.minXp) ?? LEVELS[0];

export const getNextLevel = (xp: number): LevelInfo | null => {
  const current = getLevelInfo(xp);
  return LEVELS.find(l => l.level === current.level + 1) ?? null;
};

// 0–1 progress within current level
export const getLevelProgress = (xp: number): number => {
  const current = getLevelInfo(xp);
  if (current.level === LEVELS[LEVELS.length - 1].level) return 1;
  return Math.min((xp - current.minXp) / (current.maxXp - current.minXp), 1);
};

// ── Badges ────────────────────────────────────────────────────────────────────

export type BadgeId =
  | 'first_call'
  | 'photo_pro'
  | 'report_master'
  | 'powercare_pro'
  | 'client_approved'
  | 'speed_demon'
  | 'hot_streak'
  | 'perfect_score'
  | 'reliability';

export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface Badge {
  id: BadgeId;
  name: string;
  description: string;
  emoji: string;
  rarity: BadgeRarity;
  xpBonus: number;
  rarityColor: string;
  rarityBg: string;
}

export const BADGES: Record<BadgeId, Badge> = {
  first_call: {
    id: 'first_call', name: 'First Call', emoji: '🔧',
    description: 'Complete your first work order',
    rarity: 'common', xpBonus: 50,
    rarityColor: 'text-slate-600', rarityBg: 'bg-slate-100',
  },
  speed_demon: {
    id: 'speed_demon', name: 'Speed Demon', emoji: '⚡',
    description: 'Complete a job in under 90 minutes',
    rarity: 'common', xpBonus: 75,
    rarityColor: 'text-slate-600', rarityBg: 'bg-slate-100',
  },
  photo_pro: {
    id: 'photo_pro', name: 'Photo Pro', emoji: '📸',
    description: 'Upload photos in 4+ categories on a single job',
    rarity: 'rare', xpBonus: 100,
    rarityColor: 'text-blue-600', rarityBg: 'bg-blue-100',
  },
  client_approved: {
    id: 'client_approved', name: 'Client Approved', emoji: '✍️',
    description: 'Collect client signatures on 10 jobs',
    rarity: 'rare', xpBonus: 150,
    rarityColor: 'text-blue-600', rarityBg: 'bg-blue-100',
  },
  report_master: {
    id: 'report_master', name: 'Report Master', emoji: '📋',
    description: 'Submit a perfect report 5 times (all fields + fully operational)',
    rarity: 'rare', xpBonus: 150,
    rarityColor: 'text-blue-600', rarityBg: 'bg-blue-100',
  },
  reliability: {
    id: 'reliability', name: 'Reliable Pro', emoji: '🎯',
    description: 'Complete 10 jobs on their scheduled date',
    rarity: 'epic', xpBonus: 300,
    rarityColor: 'text-purple-600', rarityBg: 'bg-purple-100',
  },
  hot_streak: {
    id: 'hot_streak', name: 'Hot Streak', emoji: '🔥',
    description: 'Complete 5 jobs in a single week',
    rarity: 'epic', xpBonus: 250,
    rarityColor: 'text-purple-600', rarityBg: 'bg-purple-100',
  },
  powercare_pro: {
    id: 'powercare_pro', name: 'Powercare Pro', emoji: '🌞',
    description: 'Complete 3 Powercare service jobs',
    rarity: 'epic', xpBonus: 200,
    rarityColor: 'text-purple-600', rarityBg: 'bg-purple-100',
  },
  perfect_score: {
    id: 'perfect_score', name: 'Perfect Score', emoji: '💎',
    description: 'Earn 350+ XP on a single job',
    rarity: 'legendary', xpBonus: 500,
    rarityColor: 'text-amber-600', rarityBg: 'bg-amber-100',
  },
};

// ── XP Calculation ────────────────────────────────────────────────────────────

export interface XpLineItem {
  label: string;
  points: number;
  achieved: boolean;
}

export interface JobXpBreakdown {
  items: XpLineItem[];
  earned: number;   // total actually earned (achieved items only)
  possible: number; // max possible if all items achieved
}

export const calcJobXpBreakdown = (job: ContractorJob): JobXpBreakdown => {
  const items: XpLineItem[] = [];

  const add = (label: string, points: number, achieved: boolean) =>
    items.push({ label, points, achieved });

  // Base
  add('Job Completed', 100, job.status === 'completed');

  // Photos — before
  add('Before Photos', 25, job.photos.before.length >= 1);
  add('Before Photos (thorough, 3+)', 15, job.photos.before.length >= 3);
  // Photos — after
  add('After Photos', 25, job.photos.after.length >= 1);
  add('After Photos (thorough, 3+)', 15, job.photos.after.length >= 3);
  // Other photo categories
  add('Serial Number Photos', 15, job.photos.serial.length >= 1);
  add('Parts Photos', 10, job.photos.parts.length >= 1);
  add('Process Photos', 10, job.photos.process.length >= 1);

  // Report
  add('Service Status Selected', 20, !!job.serviceStatus);
  add('Detailed Notes (50+ chars)', 20, (job.operationalNotes ?? '').length >= 50);
  add('Next Steps Documented', 15, (job.nextSteps ?? '').length >= 20);
  add('Parts Documented', 15, (job.parts ?? []).length > 0);

  // Signatures
  add('Client Signature', 30, !!job.clientSignature);
  add('Tech Signature', 10, !!job.signature);

  // Outcome bonus
  add('Fully Operational Outcome', 50, job.serviceStatus === 'fully_operational');
  add('Partial Completion Bonus', 20, job.serviceStatus === 'partially_operational');
  add('Pending Parts Documented', 10,
    job.serviceStatus === 'pending_parts' || job.serviceStatus === 'could_not_complete');

  // Timeliness
  const completedDate = job.completedAt?.split('T')[0];
  add('On-Time Completion', 25, !!completedDate && completedDate === job.scheduledDate);

  // Speed bonus
  let speedAchieved = false;
  if (job.startedAt && job.completedAt) {
    const mins = (new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 60000;
    speedAchieved = mins > 0 && mins <= 90;
  }
  add('Speed Bonus (≤90 min)', 20, speedAchieved);

  const achieved = items.filter(i => i.achieved);
  const notAchieved = items.filter(i => !i.achieved);

  return {
    items,
    earned:   achieved.reduce((s, i) => s + i.points, 0),
    possible: achieved.reduce((s, i) => s + i.points, 0) + notAchieved.reduce((s, i) => s + i.points, 0),
  };
};

// ── XP Data Store ─────────────────────────────────────────────────────────────

export interface ContractorXpData {
  totalXp: number;
  earnedBadges: BadgeId[];
  counters: {
    completedJobs: number;
    powercareJobs: number;
    clientSignatureJobs: number;
    perfectReports: number;
    onTimeJobs: number;
  };
  jobHistory: { jobId: string; xp: number; earnedAt: string }[];
}

const XP_KEY = (cid: string) => `solarops_xp_v1_${cid}`;

const defaultXpData = (): ContractorXpData => ({
  totalXp: 0,
  earnedBadges: [],
  counters: { completedJobs: 0, powercareJobs: 0, clientSignatureJobs: 0, perfectReports: 0, onTimeJobs: 0 },
  jobHistory: [],
});

export const loadXpData = (contractorId: string): ContractorXpData => {
  try {
    const raw = localStorage.getItem(XP_KEY(contractorId));
    if (raw) return { ...defaultXpData(), ...JSON.parse(raw) };
  } catch {}
  return defaultXpData();
};

const saveXpData = (contractorId: string, data: ContractorXpData): void => {
  try { localStorage.setItem(XP_KEY(contractorId), JSON.stringify(data)); } catch {}
};

// ── Badge checker ─────────────────────────────────────────────────────────────

const getMondayOfWeek = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
};

const isPerfectReport = (job: ContractorJob): boolean =>
  job.serviceStatus === 'fully_operational' &&
  job.photos.before.length >= 1 &&
  job.photos.after.length >= 1 &&
  (job.operationalNotes ?? '').length >= 50 &&
  !!job.clientSignature;

function checkNewBadges(data: ContractorXpData, job: ContractorJob, breakdown: JobXpBreakdown): Badge[] {
  const earned: Badge[] = [];
  const has = (id: BadgeId) => data.earnedBadges.includes(id);

  // first_call
  if (!has('first_call') && data.counters.completedJobs >= 1)
    earned.push(BADGES.first_call);

  // speed_demon
  if (!has('speed_demon') && job.startedAt && job.completedAt) {
    const mins = (new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 60000;
    if (mins > 0 && mins <= 90) earned.push(BADGES.speed_demon);
  }

  // photo_pro (4 categories used)
  if (!has('photo_pro')) {
    const categories = [job.photos.before, job.photos.serial, job.photos.parts, job.photos.process, job.photos.after];
    if (categories.filter(c => c.length > 0).length >= 4) earned.push(BADGES.photo_pro);
  }

  // client_approved
  if (!has('client_approved') && data.counters.clientSignatureJobs >= 10)
    earned.push(BADGES.client_approved);

  // report_master
  if (!has('report_master') && data.counters.perfectReports >= 5)
    earned.push(BADGES.report_master);

  // reliability
  if (!has('reliability') && data.counters.onTimeJobs >= 10)
    earned.push(BADGES.reliability);

  // powercare_pro
  if (!has('powercare_pro') && data.counters.powercareJobs >= 3)
    earned.push(BADGES.powercare_pro);

  // hot_streak (5 jobs this week)
  if (!has('hot_streak')) {
    const monday = getMondayOfWeek(new Date()).getTime();
    const thisWeekCount = data.jobHistory.filter(h => new Date(h.earnedAt).getTime() >= monday).length;
    if (thisWeekCount >= 5) earned.push(BADGES.hot_streak);
  }

  // perfect_score
  if (!has('perfect_score') && breakdown.earned >= 350)
    earned.push(BADGES.perfect_score);

  return earned;
}

// ── Add XP for a completed job ────────────────────────────────────────────────

export interface AddXpResult {
  xpEarned: number;
  badgeXpBonus: number;
  newBadges: Badge[];
  leveledUp: boolean;
  prevLevel: LevelInfo | null;
  currentLevel: LevelInfo;
  breakdown: JobXpBreakdown;
  alreadyCounted: boolean;
}

export const addJobXp = (contractorId: string, job: ContractorJob): AddXpResult => {
  if (job.status !== 'completed') {
    const data = loadXpData(contractorId);
    return {
      xpEarned: 0, badgeXpBonus: 0, newBadges: [], leveledUp: false,
      prevLevel: null, currentLevel: getLevelInfo(data.totalXp),
      breakdown: calcJobXpBreakdown(job), alreadyCounted: false,
    };
  }

  const data = loadXpData(contractorId);

  // Idempotency — only count each job once
  if (data.jobHistory.some(h => h.jobId === job.id)) {
    return {
      xpEarned: 0, badgeXpBonus: 0, newBadges: [], leveledUp: false,
      prevLevel: null, currentLevel: getLevelInfo(data.totalXp),
      breakdown: calcJobXpBreakdown(job), alreadyCounted: true,
    };
  }

  const breakdown = calcJobXpBreakdown(job);
  const prevXp    = data.totalXp;
  const prevLevel = getLevelInfo(prevXp);

  // Add XP
  data.totalXp += breakdown.earned;

  // Update counters
  data.counters.completedJobs += 1;
  if (job.isPowercare) data.counters.powercareJobs += 1;
  if (job.clientSignature) data.counters.clientSignatureJobs += 1;
  if (isPerfectReport(job)) data.counters.perfectReports += 1;
  const completedDate = job.completedAt?.split('T')[0];
  if (completedDate && completedDate === job.scheduledDate) data.counters.onTimeJobs += 1;

  // Record job
  data.jobHistory.push({ jobId: job.id, xp: breakdown.earned, earnedAt: new Date().toISOString() });

  // Check badges
  const newBadges = checkNewBadges(data, job, breakdown);
  newBadges.forEach(b => {
    data.earnedBadges.push(b.id);
    data.totalXp += b.xpBonus;
  });
  const badgeXpBonus = newBadges.reduce((s, b) => s + b.xpBonus, 0);

  const currentLevel = getLevelInfo(data.totalXp);
  const leveledUp    = currentLevel.level > prevLevel.level;

  saveXpData(contractorId, data);

  return {
    xpEarned: breakdown.earned,
    badgeXpBonus,
    newBadges,
    leveledUp,
    prevLevel: leveledUp ? prevLevel : null,
    currentLevel,
    breakdown,
    alreadyCounted: false,
  };
};

// ── Add flat bonus XP (upsell referral, etc.) ─────────────────────────────────
export const addBonusXp = (
  contractorId: string,
  amount: number,
): { xpEarned: number; currentLevel: LevelInfo; leveledUp: boolean; prevLevel: LevelInfo } => {
  const data = loadXpData(contractorId);
  const prevLevel = getLevelInfo(data.totalXp);
  data.totalXp += amount;
  const currentLevel = getLevelInfo(data.totalXp);
  saveXpData(contractorId, data);
  return { xpEarned: amount, currentLevel, leveledUp: currentLevel.level > prevLevel.level, prevLevel };
};
