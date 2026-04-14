// SolarFlow CRM v2 - Data Store
// Gamified Sales CRM for Solar Outreach Team

import { Lead, LeadActivity, UserStats, Badge, XP_ACTIONS, LEVEL_THRESHOLDS, LeadSource, LeadStatus, LeadPriority } from '../types';

const STORAGE_KEY = 'solarflow_crm_data';

// ============================================
// Mock Data Generators
// ============================================

const firstNames = ['James', 'Maria', 'Carlos', 'Linda', 'Robert', 'Jennifer', 'Michael', 'Patricia', 'David', 'Susan', 'John', 'Karen', 'Antonio', 'Michelle', 'Daniel', 'Sarah', 'Francisco', 'Nancy', 'Miguel', 'Betty'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'];
const cities = [
  { city: 'Miami', state: 'FL' },
  { city: 'Fort Lauderdale', state: 'FL' },
  { city: 'West Palm Beach', state: 'FL' },
  { city: 'Orlando', state: 'FL' },
  { city: 'Tampa', state: 'FL' },
  { city: 'Jacksonville', state: 'FL' },
  { city: 'Hollywood', state: 'FL' },
  { city: 'Pembroke Pines', state: 'FL' },
  { city: 'Coral Gables', state: 'FL' },
  { city: 'Boca Raton', state: 'FL' },
];

const streetNames = ['Oak Street', 'Palm Avenue', 'Maple Drive', 'Cedar Lane', 'Pine Road', 'Sunset Blvd', 'Ocean Drive', 'Main Street', 'First Avenue', 'Second Street'];

const sources: LeadSource[] = ['google_forms', 'website', 'referral', 'cold_call', 'social_media', 'advertising', 'partner'];

export const generateRandomLead = (index: number): Lead => {
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  const location = cities[Math.floor(Math.random() * cities.length)];
  const streetNum = Math.floor(Math.random() * 9999) + 1;
  const street = streetNames[Math.floor(Math.random() * streetNames.length)];
  const source = sources[Math.floor(Math.random() * sources.length)];

  const createdAgo = Math.floor(Math.random() * 72); // Hours ago
  const createdAt = new Date(Date.now() - createdAgo * 60 * 60 * 1000).toISOString();

  // Calculate initial score based on freshness and random factors
  let score = 100 - createdAgo * 2; // Freshness bonus
  if (score < 10) score = 10;
  score += Math.floor(Math.random() * 30);

  const monthlyBill = Math.floor(Math.random() * 400) + 80;

  return {
    id: `lead-${index}`,
    firstName,
    lastName,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@email.com`,
    phone: `(${Math.floor(Math.random() * 900) + 100}) ${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000) + 1000}`,
    address: `${streetNum} ${street}`,
    city: location.city,
    state: location.state,
    zip: String(Math.floor(Math.random() * 90000) + 10000),
    monthlyBill,
    roofType: Math.random() > 0.5 ? 'sloped' : 'flat',
    roofShade: Math.random() > 0.6 ? 'full_sun' : 'partial_shade',
    homeowner: Math.random() > 0.2,
    status: 'new',
    source,
    priority: score > 80 ? 'high' : score > 50 ? 'medium' : 'low',
    score,
    createdAt,
    updatedAt: createdAt,
    notes: '',
    description: `Potential solar customer. Estimated monthly bill: $${monthlyBill}`,
  };
};

const generateMockLeads = (count: number): Lead[] => {
  const leads: Lead[] = [];
  for (let i = 1; i <= count; i++) {
    leads.push(generateRandomLead(i));
  }
  // Sort by score descending
  return leads.sort((a, b) => b.score - a.score);
};

const generateMockStats = (userId: string, userName: string): UserStats => {
  const baseXP = Math.floor(Math.random() * 5000);
  const level = LEVEL_THRESHOLDS.findIndex(t => t.xp > baseXP) || 1;

  return {
    userId,
    xp: baseXP,
    level: Math.max(1, level),
    streak: Math.floor(Math.random() * 7),
    totalCalls: Math.floor(Math.random() * 500) + 100,
    totalEmails: Math.floor(Math.random() * 300) + 50,
    appointmentsSet: Math.floor(Math.random() * 50) + 10,
    dealsClosed: Math.floor(Math.random() * 20) + 5,
    revenueGenerated: Math.floor(Math.random() * 100000) + 20000,
    badges: generateMockBadges(),
    weeklyCalls: Math.floor(Math.random() * 50) + 10,
    weeklyAppointments: Math.floor(Math.random() * 10) + 2,
    weeklyXP: Math.floor(Math.random() * 500) + 100,
    lastActiveDate: new Date().toISOString(),
  };
};

const generateMockBadges = (): Badge[] => {
  const badgeTypes = [
    { name: 'First Call', icon: '📞', rarity: 'common' as const },
    { name: 'Early Bird', icon: '🌅', rarity: 'common' as const },
    { name: 'Phone Warrior', icon: '⚔️', rarity: 'rare' as const },
    { name: 'Closer', icon: '🏆', rarity: 'epic' as const },
    { name: 'Solar Champion', icon: '☀️', rarity: 'legendary' as const },
  ];

  const earned: Badge[] = [];
  const numBadges = Math.floor(Math.random() * 4) + 1;

  for (let i = 0; i < numBadges; i++) {
    const badgeType = badgeTypes[Math.floor(Math.random() * badgeTypes.length)];
    earned.push({
      id: `badge-${i}`,
      name: badgeType.name,
      description: `Earned for ${badgeType.name.toLowerCase()}`,
      icon: badgeType.icon,
      earnedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      rarity: badgeType.rarity,
    });
  }

  return earned;
};

// ============================================
// CRM Data Store
// ============================================

export interface CRMData {
  leads: Lead[];
  activities: LeadActivity[];
  userStats: Record<string, UserStats>;
  currentUserId: string;
}

const initialLeads = generateMockLeads(25);
const today = new Date().toISOString().split('T')[0];

export const initialCRMData: CRMData = {
  leads: initialLeads,
  activities: [],
  userStats: {
    'user-1': generateMockStats('user-1', 'Sarah (Admin)'),
    'user-2': generateMockStats('user-2', 'Mike (Sales)'),
    'user-3': generateMockStats('user-3', 'Joe (Sales)'),
    'user-4': generateMockStats('user-4', 'Carlos (Manager)'),
  },
  currentUserId: 'user-1',
};

export const loadCRMData = (): CRMData => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load CRM data:', e);
  }
  return initialCRMData;
};

export const saveCRMData = (data: CRMData): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save CRM data:', e);
  }
};

// ============================================
// Helper Functions
// ============================================

export const calculateLeadScore = (lead: Lead): number => {
  let score = 50; // Base score

  // Freshness bonus - newer leads get higher score
  const hoursSinceCreation = (Date.now() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60);
  if (hoursSinceCreation < 1) score += 40;
  else if (hoursSinceCreation < 4) score += 30;
  else if (hoursSinceCreation < 12) score += 20;
  else if (hoursSinceCreation < 24) score += 10;

  // Priority boost
  if (lead.priority === 'urgent') score += 30;
  else if (lead.priority === 'high') score += 20;
  else if (lead.priority === 'medium') score += 10;

  // Monthly bill boost (higher bills = more interested)
  if (lead.monthlyBill && lead.monthlyBill > 300) score += 20;
  else if (lead.monthlyBill && lead.monthlyBill > 200) score += 10;

  // Homeowner verification
  if (lead.homeowner) score += 15;

  // Roof condition
  if (lead.roofShade === 'full_sun') score += 10;
  if (lead.roofType === 'flat') score += 5;

  // Source quality
  if (lead.source === 'referral') score += 15;
  else if (lead.source === 'website') score += 10;
  else if (lead.source === 'google_forms') score += 5;

  return Math.min(100, score);
};

export const sortLeadsByPriority = (leads: Lead[]): Lead[] => {
  return [...leads].sort((a, b) => {
    const scoreA = calculateLeadScore(a);
    const scoreB = calculateLeadScore(b);
    return scoreB - scoreA;
  });
};

export const getNextLead = (leads: Lead[]): Lead | null => {
  const sorted = sortLeadsByPriority(leads.filter(l => l.status === 'new' || l.status === 'attempting'));
  return sorted.length > 0 ? sorted[0] : null;
};

export const addXP = (stats: UserStats, action: keyof typeof XP_ACTIONS): UserStats => {
  const xpGain = XP_ACTIONS[action];
  const newXP = stats.xp + xpGain;

  // Check for level up
  let newLevel = stats.level;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (newXP >= LEVEL_THRESHOLDS[i].xp) {
      newLevel = LEVEL_THRESHOLDS[i].level;
      break;
    }
  }

  // Check for streak bonus
  let streakBonus = 0;
  const today = new Date().toISOString().split('T')[0];
  if (stats.lastActiveDate !== today) {
    streakBonus = XP_ACTIONS.streak_bonus;
  }

  return {
    ...stats,
    xp: newXP + streakBonus,
    level: newLevel,
    lastActiveDate: today,
    totalCalls: action === 'call_made' ? stats.totalCalls + 1 : stats.totalCalls,
    totalEmails: action === 'email_sent' ? stats.totalEmails + 1 : stats.totalEmails,
    appointmentsSet: action === 'appointment_set' ? stats.appointmentsSet + 1 : stats.appointmentsSet,
    dealsClosed: action === 'deal_closed' ? stats.dealsClosed + 1 : stats.dealsClosed,
    weeklyCalls: action === 'call_made' ? stats.weeklyCalls + 1 : stats.weeklyCalls,
    weeklyAppointments: action === 'appointment_set' ? stats.weeklyAppointments + 1 : stats.weeklyAppointments,
    weeklyXP: stats.weeklyXP + xpGain,
  };
};

export const addLead = (data: CRMData, newLead: Omit<Lead, 'id' | 'score' | 'createdAt' | 'updatedAt'>): CRMData => {
  const lead: Lead = {
    ...newLead,
    id: `lead-${Date.now()}`,
    score: calculateLeadScore({ ...newLead, createdAt: '', updatedAt: '', score: 0 } as Lead),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    ...data,
    leads: [lead, ...data.leads],
  };
};

export const updateLeadStatus = (data: CRMData, leadId: string, newStatus: LeadStatus, userId: string, userName: string): CRMData => {
  const lead = data.leads.find(l => l.id === leadId);
  if (!lead) return data;

  const oldStatus = lead.status;
  const updatedLead = {
    ...lead,
    status: newStatus,
    updatedAt: new Date().toISOString(),
    lastContactAt: new Date().toISOString(),
  };

  // Create activity log
  const activity: LeadActivity = {
    id: `activity-${Date.now()}`,
    leadId,
    userId,
    userName,
    type: 'status_change',
    description: `Status changed from ${oldStatus} to ${newStatus}`,
    outcome: newStatus,
    timestamp: new Date().toISOString(),
    xpEarned: newStatus === 'appointment' ? XP_ACTIONS.appointment_set :
              newStatus === 'closed_won' ? XP_ACTIONS.deal_closed :
              newStatus === 'proposal' ? XP_ACTIONS.proposal_sent : 0,
  };

  // Calculate XP gain
  let xpGain = 0;
  if (newStatus === 'connected') xpGain = XP_ACTIONS.call_made;
  else if (newStatus === 'appointment') xpGain = XP_ACTIONS.appointment_set;
  else if (newStatus === 'proposal') xpGain = XP_ACTIONS.proposal_sent;
  else if (newStatus === 'closed_won') xpGain = XP_ACTIONS.deal_closed;

  // Update user stats
  const currentStats = data.userStats[userId] || generateMockStats(userId, userName);
  const updatedStats = addXP(currentStats, xpGain > 0 ?
    (newStatus === 'connected' ? 'call_made' :
     newStatus === 'appointment' ? 'appointment_set' :
     newStatus === 'proposal' ? 'proposal_sent' : 'deal_closed') as any : 'call_made');

  return {
    ...data,
    leads: data.leads.map(l => l.id === leadId ? updatedLead : l),
    activities: [activity, ...data.activities],
    userStats: {
      ...data.userStats,
      [userId]: updatedStats,
    },
  };
};

export const logActivity = (data: CRMData, leadId: string, userId: string, userName: string, type: LeadActivity['type'], description: string): CRMData => {
  const xpGain = type === 'call' ? XP_ACTIONS.call_made :
                type === 'email' ? XP_ACTIONS.email_sent :
                type === 'note' ? XP_ACTIONS.note_added : 0;

  const activity: LeadActivity = {
    id: `activity-${Date.now()}`,
    leadId,
    userId,
    userName,
    type,
    description,
    timestamp: new Date().toISOString(),
    xpEarned: xpGain,
  };

  // Update user stats
  const currentStats = data.userStats[userId] || generateMockStats(userId, userName);
  const updatedStats = addXP(currentStats, xpGain > 0 ?
    (type === 'call' ? 'call_made' : type === 'email' ? 'email_sent' : 'note_added') as any : 'call_made');

  // Update lead last contact
  const updatedLeads = data.leads.map(l =>
    l.id === leadId ? { ...l, lastContactAt: new Date().toISOString() } : l
  );

  return {
    ...data,
    leads: updatedLeads,
    activities: [activity, ...data.activities],
    userStats: {
      ...data.userStats,
      [userId]: updatedStats,
    },
  };
};

export const getLeaderboard = (userStats: Record<string, UserStats>, users: { id: string; name: string }[]): { userId: string; name: string; xp: number; level: number; streak: number; dealsClosed: number; rank: number }[] => {
  const entries = users.map(user => ({
    userId: user.id,
    name: user.name,
    xp: userStats[user.id]?.xp || 0,
    level: userStats[user.id]?.level || 1,
    streak: userStats[user.id]?.streak || 0,
    dealsClosed: userStats[user.id]?.dealsClosed || 0,
    rank: 0,
  }));

  // Sort by XP
  entries.sort((a, b) => b.xp - a.xp);

  // Assign ranks
  return entries.map((e, i) => ({ ...e, rank: i + 1 }));
};

export const getLevelTitle = (level: number): string => {
  const threshold = LEVEL_THRESHOLDS.find(t => t.level === level);
  return threshold?.title || 'Rookie';
};

export const getXPForNextLevel = (currentXP: number): { xpNeeded: number; nextLevel: number; title: string } => {
  const currentLevel = LEVEL_THRESHOLDS.findIndex(t => t.xp > currentXP);
  const nextThreshold = LEVEL_THRESHOLDS[currentLevel] || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  return {
    xpNeeded: nextThreshold.xp - currentXP,
    nextLevel: nextThreshold.level,
    title: nextThreshold.title,
  };
};
