// SolarFlow CRM v2 - Main Dashboard Component
// Gamified Sales CRM for Solar Outreach Team

import React, { useState, useEffect } from 'react';
import {
  Phone,
  Mail,
  User,
  Clock,
  Star,
  Trophy,
  Flame,
  Zap,
  ArrowRight,
  Plus,
  Filter,
  Search,
  ChevronRight,
  X,
  MessageSquare,
  Calendar,
  CheckCircle,
  XCircle,
  AlertCircle,
  Building,
  Home,
  TrendingUp,
  Users,
  Target,
  Award,
  Activity,
} from 'lucide-react';
import {
  Lead,
  LeadStatus,
  LeadSource,
  LeadActivity,
  UserStats,
  XP_ACTIONS,
  LEVEL_THRESHOLDS,
  LeadPriority,
} from '../types';
import {
  loadCRMData,
  saveCRMData,
  calculateLeadScore,
  sortLeadsByPriority,
  getNextLead,
  updateLeadStatus,
  logActivity,
  getLeaderboard,
  getLevelTitle,
  getXPForNextLevel,
  CRMData,
  generateRandomLead,
} from '../lib/crmStore';
import { rcClickToCall, rcSendSMS, getRCClientId } from '../lib/ringcentral';
import * as XLSX from 'xlsx';

// ─── RMA Extractor ────────────────────────────────────────────────────────────
class RMAExtractor {
  cases: Map<string, { info: Record<string, unknown>; parts: Record<string, unknown>[] }>;
  constructor() { this.cases = new Map(); }

  parseData(rows: Record<string, unknown>[]) {
    rows.forEach(row => {
      const caseNum = String(row['Case Number'] ?? '').trim();
      if (!caseNum) return;
      if (!this.cases.has(caseNum)) {
        this.cases.set(caseNum, { info: row, parts: [] });
      }
      const c = this.cases.get(caseNum)!;
      if (row['Serial Number (old)'] || row['Shipped SN']) {
        c.parts.push({ oldPN: row['Part Number (old)'], oldSN: row['Serial Number (old)'], newPN: row['Shipped PN'], newSN: row['Shipped SN'], family: row['Family'] });
      }
    });
  }

  private excelDateToString(v: unknown): string {
    if (typeof v === 'number') {
      const d = new Date((v - 25569) * 86400 * 1000);
      return d.toISOString().slice(0, 16).replace('T', ' ');
    }
    return v ? String(v).trim() : 'N/A';
  }

  private getValue(row: Record<string, unknown>, key: string, def = 'N/A'): string {
    const v = row[key];
    if (v === null || v === undefined || v === '' || v === 'nan' || (typeof v === 'number' && isNaN(v))) return def;
    return String(v).trim();
  }

  private getLastFour(sn: unknown): string {
    if (!sn) return '????';
    return String(sn).replace(/-/g, '').slice(-4).toUpperCase();
  }

  private getPartType(family: unknown): string {
    if (!family) return 'Part(s)';
    const f = String(family).toUpperCase();
    if (f.includes('OP') || f.includes('S4') || f.includes('S5')) return 'Optimizer(s)';
    if (f.includes('VENUS') || f.includes('HOME')) return 'Inverter';
    return 'Part(s)';
  }

  generateReport(caseNum: string): string {
    const caseData = this.cases.get(caseNum);
    if (!caseData) return '';
    const row = caseData.info;
    const parts = caseData.parts;
    const partType = this.getPartType(parts[0]?.family);
    const partsRows = parts.map((p, i) => `| ${i + 1} | ${this.getLastFour(p.oldSN)} | ${this.getLastFour(p.newSN)} |`).join('\n');

    return `Client: ${this.getValue(row, 'Site Main Contact Name')}  POWERCARE: ${caseNum}

Phone: ${this.getValue(row, 'Site Main Contact Phone')}

Email: ${this.getValue(row, 'Site Main Contact Email')}

Address: ${this.getValue(row, 'RMA Street')}, ${this.getValue(row, 'RMA City')}, ${this.getValue(row, 'RMA State')} ${this.getValue(row, 'RMA Zip/Postal Code')}, ${this.getValue(row, 'RMA Country')}

---

## Site Contact Information

**Contact Name:** ${this.getValue(row, 'Site Main Contact Name')}

**Contact Telephone:** ${this.getValue(row, 'Site Main Contact Phone')}

---

## RMA Case Information

**Case Number:** ${caseNum}

**Subject:** ${this.getValue(row, 'Subject')}

**Account Name:** ${this.getValue(row, 'Account Name')}

---

## RMA Shipping Address

**RMA Street:** ${this.getValue(row, 'RMA Street')}

**RMA City:** ${this.getValue(row, 'RMA City')}

**RMA State:** ${this.getValue(row, 'RMA State')}

**RMA Zip/Postal Code:** ${this.getValue(row, 'RMA Zip/Postal Code')}

**RMA Country:** ${this.getValue(row, 'RMA Country')}

---

## Shipping Details

**Shipping Tracking Number:** ${this.getValue(row, 'Shipping Tracking Number')}

**Actual Ship Date:** ${this.excelDateToString(row['Actual Ship Date'])}

**Shipping ETA:** ${this.excelDateToString(row['Shipping ETA'])}

---

## Parts Information (${parts.length} ${partType})

| # | Old SN (last 4) | New SN (last 4) |
|---|-----------------|-----------------|
${partsRows}

---

## Meeting/Service Details

**Work Order Project Name:** ${this.getValue(row, 'Project Name')}

**Work Description:** ${this.getValue(row, 'Work Description (Internal comments)')}

---

## Equipment Information

**Modem Family:** ${this.getValue(row, 'Modem family')}

**Family:** ${this.getValue(row, 'Family')}

**Subject:** ${this.getValue(row, 'Subject')}

---

**FA Request Status:** ${this.getValue(row, 'FA Request Status')}

**Case ID:** ${this.getValue(row, 'Case ID')}

**Coordinates:** Lat ${this.getValue(row, 'latitude')}, Lon ${this.getValue(row, 'longitude')}`;
  }

  getAllCases(): Array<{ caseNum: string; report: string; leadData: Record<string, string> }> {
    const results: Array<{ caseNum: string; report: string; leadData: Record<string, string> }> = [];
    this.cases.forEach((caseData, caseNum) => {
      const row = caseData.info;
      const name = String(row['Site Main Contact Name'] ?? '').trim();
      const nameParts = name.split(' ');
      results.push({
        caseNum,
        report: this.generateReport(caseNum),
        leadData: {
          firstName: nameParts[0] || '',
          lastName: nameParts.slice(1).join(' ') || '',
          phone: String(row['Site Main Contact Phone'] ?? '').replace(/^\+/, ''),
          email: String(row['Site Main Contact Email'] ?? ''),
          address: String(row['RMA Street'] ?? ''),
          city: String(row['RMA City'] ?? ''),
          state: String(row['RMA State'] ?? ''),
          zip: String(row['RMA Zip/Postal Code'] ?? ''),
          powercareCaseNumber: caseNum,
        },
      });
    });
    return results;
  }
}

// ─── SolarEdge Email Parser ───────────────────────────────────────────────────
function parseSolarEdgeEmail(text: string): {
  firstName: string; lastName: string; email: string; phone: string;
  address: string; city: string; state: string; zip: string;
  notes: string; hsId: string; contractName: string;
} | null {
  const get = (label: string) => {
    const m = text.match(new RegExp(`${label}:\\s*(.*)`, 'i'));
    return m ? m[1].replace(/^__|__$/g, '').trim() : '';
  };
  const firstName = get('First Name');
  const lastName = get('Last Name');
  if (!firstName && !lastName) return null;
  return {
    firstName,
    lastName,
    email: get('Email').replace(/__/g, ''),
    phone: get('Phone'),
    address: get('Address'),
    city: get('City'),
    state: get('State'),
    zip: get('Zip Code'),
    notes: get('notes'),
    hsId: get('HS_ID'),
    contractName: get('Contract Name'),
  };
}

// User for demo
const users = [
  { id: 'user-1', name: 'Sarah (Admin)', role: 'admin' },
  { id: 'user-2', name: 'Mike (Sales)', role: 'sales' },
  { id: 'user-3', name: 'Joe (Sales)', role: 'sales' },
  { id: 'user-4', name: 'Carlos (Manager)', role: 'manager' },
];

// Status colors and labels
const statusConfig: Record<LeadStatus, { color: string; bg: string; label: string }> = {
  new: { color: 'text-blue-600', bg: 'bg-blue-100', label: 'New' },
  attempting: { color: 'text-yellow-600', bg: 'bg-yellow-100', label: 'Attempting' },
  connected: { color: 'text-green-600', bg: 'bg-green-100', label: 'Connected' },
  appointment: { color: 'text-purple-600', bg: 'bg-purple-100', label: 'Appointment' },
  qualified: { color: 'text-indigo-600', bg: 'bg-indigo-100', label: 'Qualified' },
  proposal: { color: 'text-orange-600', bg: 'bg-orange-100', label: 'Proposal' },
  closed_won: { color: 'text-emerald-600', bg: 'bg-emerald-100', label: 'Closed Won' },
  closed_lost: { color: 'text-gray-600', bg: 'bg-gray-100', label: 'Closed Lost' },
  not_interested: { color: 'text-red-600', bg: 'bg-red-100', label: 'Not Interested' },
};

const sourceLabels: Record<LeadSource, string> = {
  google_forms: 'Google Forms',
  website: 'Website',
  referral: 'Referral',
  cold_call: 'Cold Call',
  social_media: 'Social Media',
  advertising: 'Advertising',
  partner: 'Partner',
  other: 'Other',
};

interface CRMDashboardProps {
  currentUserId: string;
  onSwitchUser?: (userId: string) => void;
}

export const CRMDashboard: React.FC<CRMDashboardProps> = ({ currentUserId, onSwitchUser }) => {
  const [data, setData] = useState<CRMData>(loadCRMData);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [view, setView] = useState<'queue' | 'pipeline' | 'leaderboard'>('queue');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCallModal, setShowCallModal] = useState(false);
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  const currentUser = users.find(u => u.id === currentUserId) || users[0];
  const userStats = data.userStats[currentUserId] || {
    xp: 0,
    level: 1,
    streak: 0,
    totalCalls: 0,
    totalEmails: 0,
    appointmentsSet: 0,
    dealsClosed: 0,
    revenueGenerated: 0,
    badges: [],
    weeklyCalls: 0,
    weeklyAppointments: 0,
    weeklyXP: 0,
  };

  // Auto-select next lead
  useEffect(() => {
    if (!selectedLead) {
      const next = getNextLead(data.leads);
      if (next) setSelectedLead(next);
    }
  }, [data.leads, selectedLead]);

  // Save data on change
  useEffect(() => {
    saveCRMData(data);
  }, [data]);

  // Show notification
  const showNotification = (message: string, type: 'success' | 'info' = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // Get filtered leads
  const filteredLeads = data.leads.filter(lead =>
    lead.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    lead.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    lead.phone.includes(searchQuery) ||
    lead.city.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get leads by status for pipeline
  const leadsByStatus = filteredLeads.reduce((acc, lead) => {
    if (!acc[lead.status]) acc[lead.status] = [];
    acc[lead.status].push(lead);
    return acc;
  }, {} as Record<LeadStatus, Lead[]>);

  // Get leaderboard
  const leaderboard = getLeaderboard(data.userStats, users);

  // Get next level info
  const nextLevelInfo = getXPForNextLevel(userStats.xp);
  const levelThreshold = LEVEL_THRESHOLDS.find(t => t.level === userStats.level) || LEVEL_THRESHOLDS[0];
  const prevLevelXP = LEVEL_THRESHOLDS.find(t => t.level === userStats.level - 1)?.xp || 0;
  const levelProgress = ((userStats.xp - prevLevelXP) / (levelThreshold.xp - prevLevelXP)) * 100;

  // Handle status change
  const handleStatusChange = (newStatus: LeadStatus) => {
    if (!selectedLead) return;

    const xpGain = newStatus === 'connected' ? XP_ACTIONS.call_made :
                  newStatus === 'appointment' ? XP_ACTIONS.appointment_set :
                  newStatus === 'proposal' ? XP_ACTIONS.proposal_sent :
                  newStatus === 'closed_won' ? XP_ACTIONS.deal_closed : 0;

    setData(prev => updateLeadStatus(prev, selectedLead.id, newStatus, currentUserId, currentUser.name));

    if (xpGain > 0) {
      showNotification(`+${xpGain} XP earned!`, 'success');
    }

    // Get next lead
    const next = getNextLead(data.leads.filter(l => l.id !== selectedLead.id));
    setSelectedLead(next || null);
    setShowCallModal(false);
  };

  // Handle add new lead
  const handleAddLead = (newLead: Partial<Lead>) => {
    const lead: Omit<Lead, 'id' | 'score' | 'createdAt' | 'updatedAt'> = {
      firstName: newLead.firstName || '',
      lastName: newLead.lastName || '',
      email: newLead.email || '',
      phone: newLead.phone || '',
      address: newLead.address || '',
      city: newLead.city || '',
      state: newLead.state || 'FL',
      zip: newLead.zip || '',
      monthlyBill: newLead.monthlyBill,
      roofType: newLead.roofType,
      roofShade: newLead.roofShade,
      homeowner: newLead.homeowner,
      status: 'new',
      source: newLead.source || 'other',
      priority: newLead.priority || 'medium',
      notes: newLead.notes || '',
    };

    setData(prev => {
      const updated = { ...prev, leads: [({
        ...lead,
        id: `lead-${Date.now()}`,
        score: calculateLeadScore(lead as Lead),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as Lead), ...prev.leads] };
      return updated;
    });

    showNotification('New lead added to queue!', 'success');
    setShowAddLeadModal(false);
  };

  // Simulate incoming lead
  const handleSimulateLead = () => {
    const lead = generateRandomLead(Date.now());
    setData(prev => ({
      ...prev,
      leads: [lead, ...prev.leads],
    }));
    showNotification('New lead received!', 'info');
  };

  // Format time ago
  const formatTimeAgo = (dateStr: string) => {
    const hours = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60));
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg ${
          notification.type === 'success' ? 'bg-emerald-500' : 'bg-blue-500'
        } text-white animate-fade-in`}>
          {notification.message}
        </div>
      )}

      {/* Header / HUD */}
      <div className="bg-white border-b border-slate-200 px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center">
              <SunIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">SolarFlow CRM</h1>
              <p className="text-xs text-slate-500">Sales Outreach Platform</p>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="flex items-center gap-6">
            {/* Streak */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 rounded-full">
              <Flame className="w-5 h-5 text-orange-500" />
              <span className="font-bold text-orange-600">{userStats.streak}</span>
              <span className="text-xs text-orange-600">day streak</span>
            </div>

            {/* Today's Calls */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-full">
              <Phone className="w-4 h-4 text-blue-600" />
              <span className="font-bold text-blue-600">{userStats.weeklyCalls}</span>
              <span className="text-xs text-blue-600">calls today</span>
            </div>

            {/* Appointments */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 rounded-full">
              <Calendar className="w-4 h-4 text-purple-600" />
              <span className="font-bold text-purple-600">{userStats.appointmentsSet}</span>
              <span className="text-xs text-purple-600">appointments</span>
            </div>
          </div>

          {/* User Profile & XP */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="flex items-center gap-2 justify-end">
                <span className="font-bold text-slate-900">{currentUser.name}</span>
                <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-purple-600 rounded-full flex items-center justify-center">
                  <Star className="w-4 h-4 text-white" />
                </div>
              </div>
              <div className="text-xs text-slate-500">{getLevelTitle(userStats.level)} • Level {userStats.level}</div>
            </div>

            {/* XP Bar */}
            <div className="w-32">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-violet-600 font-medium">{userStats.xp} XP</span>
                <span className="text-slate-400">{nextLevelInfo.xpNeeded} to next</span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-purple-600 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, levelProgress)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-slate-200 px-6">
        <div className="flex gap-1">
          <button
            onClick={() => setView('queue')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              view === 'queue'
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4" />
              Call Queue
              <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">
                {data.leads.filter(l => l.status === 'new' || l.status === 'attempting').length}
              </span>
            </div>
          </button>
          <button
            onClick={() => setView('pipeline')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              view === 'pipeline'
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Pipeline
            </div>
          </button>
          <button
            onClick={() => setView('leaderboard')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              view === 'leaderboard'
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4" />
              Leaderboard
            </div>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        {view === 'queue' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Panel - Active Lead */}
            <div className="lg:col-span-2">
              {/* Search & Actions */}
              <div className="flex items-center justify-between mb-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search leads..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSimulateLead}
                    className="px-3 py-2 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                  >
                    + Simulate Lead
                  </button>
                  <button
                    onClick={() => setShowAddLeadModal(true)}
                    className="px-3 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    Add Lead
                  </button>
                </div>
              </div>

              {/* Active Lead Card */}
              {selectedLead ? (
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
                  {/* Lead Header */}
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-2xl font-bold text-white">
                          {selectedLead.firstName} {selectedLead.lastName}
                        </h2>
                        <div className="flex items-center gap-4 mt-1 text-slate-300 text-sm">
                          <span className="flex items-center gap-1">
                            <Phone className="w-4 h-4" />
                            {selectedLead.phone}
                          </span>
                          <span className="flex items-center gap-1">
                            <Mail className="w-4 h-4" />
                            {selectedLead.email}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <Zap className="w-5 h-5 text-amber-400" />
                          <span className="text-3xl font-bold text-white">{selectedLead.score}</span>
                        </div>
                        <span className="text-xs text-slate-400">Lead Score</span>
                      </div>
                    </div>
                  </div>

                  {/* Lead Details */}
                  <div className="p-6">
                    <div className="grid grid-cols-2 gap-6">
                      {/* Left Column */}
                      <div className="space-y-4">
                        <div>
                          <h3 className="text-sm font-medium text-slate-500 mb-2">Location</h3>
                          <div className="flex items-center gap-2 text-slate-900">
                            <MapPin className="w-4 h-4 text-slate-400" />
                            {selectedLead.address}, {selectedLead.city}, {selectedLead.state} {selectedLead.zip}
                          </div>
                        </div>

                        <div>
                          <h3 className="text-sm font-medium text-slate-500 mb-2">Solar Potential</h3>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-slate-50 rounded-lg p-3">
                              <div className="text-xs text-slate-500">Monthly Bill</div>
                              <div className="font-bold text-slate-900">${selectedLead.monthlyBill || 'N/A'}</div>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3">
                              <div className="text-xs text-slate-500">Roof Type</div>
                              <div className="font-bold text-slate-900 capitalize">{selectedLead.roofType || 'N/A'}</div>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3">
                              <div className="text-xs text-slate-500">Shade</div>
                              <div className="font-bold text-slate-900 capitalize">{selectedLead.roofShade?.replace('_', ' ') || 'N/A'}</div>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3">
                              <div className="text-xs text-slate-500">Homeowner</div>
                              <div className="font-bold text-slate-900">{selectedLead.homeowner ? 'Yes' : 'No'}</div>
                            </div>
                          </div>
                        </div>

                        <div>
                          <h3 className="text-sm font-medium text-slate-500 mb-2">Source</h3>
                          <span className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                            {sourceLabels[selectedLead.source]}
                          </span>
                        </div>
                      </div>

                      {/* Right Column - Quick Actions */}
                      <div className="space-y-4">
                        <div>
                          <h3 className="text-sm font-medium text-slate-500 mb-3">Quick Actions</h3>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => {
                                if (selectedLead.phone && getRCClientId()) {
                                  rcClickToCall(selectedLead.phone);
                                }
                                setShowCallModal(true);
                              }}
                              className="flex items-center justify-center gap-2 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors"
                            >
                              <Phone className="w-4 h-4" />
                              Call Now
                            </button>
                            <button
                              onClick={() => {
                                setData(prev => logActivity(prev, selectedLead.id, currentUserId, currentUser.name, 'email', 'Sent follow-up email'));
                                showNotification('+5 XP - Email logged', 'success');
                              }}
                              className="flex items-center justify-center gap-2 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
                            >
                              <Mail className="w-4 h-4" />
                              Send Email
                            </button>
                            <button
                              onClick={() => {
                                setData(prev => logActivity(prev, selectedLead.id, currentUserId, currentUser.name, 'note', 'Added note'));
                                showNotification('+5 XP - Note added', 'success');
                              }}
                              className="flex items-center justify-center gap-2 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
                            >
                              <MessageSquare className="w-4 h-4" />
                              Add Note
                            </button>
                            <button
                              onClick={() => handleStatusChange('not_interested')}
                              className="flex items-center justify-center gap-2 py-3 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg font-medium transition-colors"
                            >
                              <XCircle className="w-4 h-4" />
                              Not Interested
                            </button>
                          </div>
                        </div>

                        <div>
                          <h3 className="text-sm font-medium text-slate-500 mb-2">Notes</h3>
                          <textarea
                            className="w-full h-24 p-3 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500"
                            placeholder="Add notes about this lead..."
                            value={selectedLead.notes}
                            onChange={(e) => {
                              setData(prev => ({
                                ...prev,
                                leads: prev.leads.map(l =>
                                  l.id === selectedLead.id ? { ...l, notes: e.target.value } : l
                                ),
                              }));
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Time Info */}
                  <div className="bg-slate-50 px-6 py-3 flex items-center justify-between text-sm text-slate-500">
                    <span>Created: {formatTimeAgo(selectedLead.createdAt)}</span>
                    <span>Last Contact: {selectedLead.lastContactAt ? formatTimeAgo(selectedLead.lastContactAt) : 'Never'}</span>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-12 text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">All Caught Up!</h3>
                  <p className="text-slate-500 mb-4">No more leads in the queue. Great job!</p>
                  <button
                    onClick={handleSimulateLead}
                    className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
                  >
                    Simulate New Lead
                  </button>
                </div>
              )}

              {/* Lead List */}
              <div className="mt-6 bg-white rounded-xl shadow border border-slate-200">
                <div className="px-4 py-3 border-b border-slate-200">
                  <h3 className="font-medium text-slate-900">Up Next ({filteredLeads.slice(0, 10).length})</h3>
                </div>
                <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                  {filteredLeads.slice(0, 10).map((lead) => (
                    <button
                      key={lead.id}
                      onClick={() => setSelectedLead(lead)}
                      className={`w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors ${
                        selectedLead?.id === lead.id ? 'bg-amber-50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                          lead.score > 70 ? 'bg-green-100 text-green-700' :
                          lead.score > 40 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {lead.firstName[0]}{lead.lastName[0]}
                        </div>
                        <div className="text-left">
                          <div className="font-medium text-slate-900">{lead.firstName} {lead.lastName}</div>
                          <div className="text-xs text-slate-500">{lead.city}, {lead.state}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${statusConfig[lead.status].bg} ${statusConfig[lead.status].color}`}>
                          {statusConfig[lead.status].label}
                        </span>
                        <div className="flex items-center gap-1 text-amber-600">
                          <Zap className="w-3 h-3" />
                          <span className="text-sm font-medium">{lead.score}</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Panel - Stats & Activity */}
            <div className="space-y-6">
              {/* Today's Progress */}
              <div className="bg-white rounded-xl shadow border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-900 mb-4">Today's Progress</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-blue-500" />
                      <span className="text-sm text-slate-600">Calls</span>
                    </div>
                    <span className="font-bold text-slate-900">{userStats.totalCalls}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-slate-600">Emails</span>
                    </div>
                    <span className="font-bold text-slate-900">{userStats.totalEmails}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-purple-500" />
                      <span className="text-sm text-slate-600">Appointments</span>
                    </div>
                    <span className="font-bold text-slate-900">{userStats.appointmentsSet}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-amber-500" />
                      <span className="text-sm text-slate-600">Deals Closed</span>
                    </div>
                    <span className="font-bold text-slate-900">{userStats.dealsClosed}</span>
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-white rounded-xl shadow border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-900 mb-4">Recent Activity</h3>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {data.activities.slice(0, 10).map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        activity.type === 'call' ? 'bg-blue-100' :
                        activity.type === 'email' ? 'bg-green-100' :
                        activity.type === 'status_change' ? 'bg-purple-100' :
                        'bg-slate-100'
                      }`}>
                        {activity.type === 'call' ? <Phone className="w-4 h-4 text-blue-600" /> :
                         activity.type === 'email' ? <Mail className="w-4 h-4 text-green-600" /> :
                         activity.type === 'status_change' ? <ArrowRight className="w-4 h-4 text-purple-600" /> :
                         <MessageSquare className="w-4 h-4 text-slate-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-900 truncate">{activity.description}</p>
                        <p className="text-xs text-slate-500">{activity.userName} • {formatTimeAgo(activity.timestamp)}</p>
                      </div>
                      {activity.xpEarned > 0 && (
                        <span className="text-xs font-medium text-violet-600">+{activity.xpEarned} XP</span>
                      )}
                    </div>
                  ))}
                  {data.activities.length === 0 && (
                    <p className="text-sm text-slate-500 text-center py-4">No recent activity</p>
                  )}
                </div>
              </div>

              {/* Quick Stats */}
              <div className="bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl p-4 text-white">
                <h3 className="font-semibold mb-4">Your Stats</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/10 rounded-lg p-3">
                    <div className="text-2xl font-bold">{userStats.xp.toLocaleString()}</div>
                    <div className="text-xs text-white/70">Total XP</div>
                  </div>
                  <div className="bg-white/10 rounded-lg p-3">
                    <div className="text-2xl font-bold">{userStats.level}</div>
                    <div className="text-xs text-white/70">Level</div>
                  </div>
                  <div className="bg-white/10 rounded-lg p-3">
                    <div className="text-2xl font-bold">{userStats.streak}</div>
                    <div className="text-xs text-white/70">Day Streak</div>
                  </div>
                  <div className="bg-white/10 rounded-lg p-3">
                    <div className="text-2xl font-bold">{userStats.badges.length}</div>
                    <div className="text-xs text-white/70">Badges</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === 'pipeline' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {Object.entries(statusConfig).map(([status, config]) => (
              <div key={status} className="bg-white rounded-xl shadow border border-slate-200">
                <div className={`px-4 py-3 border-b border-slate-200 ${config.bg}`}>
                  <div className="flex items-center justify-between">
                    <span className={`font-medium ${config.color}`}>{config.label}</span>
                    <span className={`text-sm font-bold ${config.color}`}>
                      {leadsByStatus[status as LeadStatus]?.length || 0}
                    </span>
                  </div>
                </div>
                <div className="p-2 space-y-2 max-h-96 overflow-y-auto">
                  {(leadsByStatus[status as LeadStatus] || []).map((lead) => (
                    <button
                      key={lead.id}
                      onClick={() => { setSelectedLead(lead); setView('queue'); }}
                      className="w-full p-3 text-left bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <div className="font-medium text-slate-900 text-sm">
                        {lead.firstName} {lead.lastName}
                      </div>
                      <div className="text-xs text-slate-500">{lead.city}, {lead.state}</div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-slate-400">{formatTimeAgo(lead.createdAt)}</span>
                        <div className="flex items-center gap-1 text-amber-600">
                          <Zap className="w-3 h-3" />
                          <span className="text-xs font-medium">{lead.score}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {view === 'leaderboard' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-xl shadow border border-slate-200 overflow-hidden">
              <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Trophy className="w-6 h-6" />
                  Sales Leaderboard
                </h2>
              </div>
              <div className="divide-y divide-slate-100">
                {leaderboard.map((entry, index) => (
                  <div
                    key={entry.userId}
                    className={`px-6 py-4 flex items-center justify-between ${
                      entry.userId === currentUserId ? 'bg-amber-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                        index === 0 ? 'bg-yellow-100 text-yellow-700' :
                        index === 1 ? 'bg-gray-100 text-gray-700' :
                        index === 2 ? 'bg-orange-100 text-orange-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-medium text-slate-900">{entry.name}</div>
                        <div className="text-xs text-slate-500">Level {entry.level} • {getLevelTitle(entry.level)}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <Zap className="w-4 h-4 text-amber-500" />
                        <span className="text-xl font-bold text-slate-900">{entry.xp.toLocaleString()}</span>
                      </div>
                      <div className="text-xs text-slate-500">{entry.dealsClosed} deals closed</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Call Result Modal */}
      {showCallModal && selectedLead && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Call Result</h3>
              <button onClick={() => setShowCallModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-slate-600 mb-4">
              What happened after calling <strong>{selectedLead.firstName} {selectedLead.lastName}</strong>?
            </p>

            <div className="space-y-2">
              <button
                onClick={() => handleStatusChange('connected')}
                className="w-full p-3 text-left bg-green-50 hover:bg-green-100 rounded-lg transition-colors flex items-center justify-between"
              >
                <span className="font-medium text-green-700">Connected - Needs Follow-up</span>
                <span className="text-xs text-green-600">+10 XP</span>
              </button>
              <button
                onClick={() => handleStatusChange('appointment')}
                className="w-full p-3 text-left bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors flex items-center justify-between"
              >
                <span className="font-medium text-purple-700">Appointment Scheduled</span>
                <span className="text-xs text-purple-600">+150 XP</span>
              </button>
              <button
                onClick={() => handleStatusChange('not_interested')}
                className="w-full p-3 text-left bg-red-50 hover:bg-red-100 rounded-lg transition-colors flex items-center justify-between"
              >
                <span className="font-medium text-red-700">Not Interested</span>
                <span className="text-xs text-red-600">+0 XP</span>
              </button>
              <button
                onClick={() => handleStatusChange('attempting')}
                className="w-full p-3 text-left bg-yellow-50 hover:bg-yellow-100 rounded-lg transition-colors flex items-center justify-between"
              >
                <span className="font-medium text-yellow-700">No Answer / Voicemail</span>
                <span className="text-xs text-yellow-600">+0 XP</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Lead Modal */}
      {showAddLeadModal && (
        <AddLeadModal
          onClose={() => setShowAddLeadModal(false)}
          onAdd={handleAddLead}
        />
      )}
    </div>
  );
};

// ─── Add Lead Modal ───────────────────────────────────────────────────────────
const AddLeadModal: React.FC<{
  onClose: () => void;
  onAdd: (lead: Partial<Lead>) => void;
}> = ({ onClose, onAdd }) => {
  type Tab = 'manual' | 'excel' | 'email';
  const [tab, setTab] = useState<Tab>('manual');

  // ── Manual form state ──
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    address: '', city: '', state: 'FL', zip: '',
    monthlyBill: 150,
    source: 'other' as LeadSource,
    priority: 'medium' as LeadPriority,
    homeowner: true,
    notes: '',
  });

  // ── Excel import state ──
  const [excelCases, setExcelCases] = useState<ReturnType<RMAExtractor['getAllCases']>>([]);
  const [excelCaseIdx, setExcelCaseIdx] = useState(0);
  const [excelError, setExcelError] = useState('');
  const [excelFileName, setExcelFileName] = useState('');

  // ── Email paste state ──
  const [emailText, setEmailText] = useState('');
  const [emailParsed, setEmailParsed] = useState<ReturnType<typeof parseSolarEdgeEmail>>(null);
  const [emailError, setEmailError] = useState('');

  // ── Apply Excel case to form ──
  const applyExcelCase = (idx: number) => {
    const c = excelCases[idx];
    if (!c) return;
    const ts = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    setFormData(f => ({
      ...f,
      firstName: c.leadData.firstName || f.firstName,
      lastName: c.leadData.lastName || f.lastName,
      phone: c.leadData.phone || f.phone,
      email: c.leadData.email || f.email,
      address: c.leadData.address || f.address,
      city: c.leadData.city || f.city,
      state: c.leadData.state || f.state,
      zip: c.leadData.zip || f.zip,
      source: 'solaredge' as LeadSource,
      notes: `[Imported from RMA Excel — ${ts}]\n\n${c.report}`,
    }));
    setTab('manual');
  };

  // ── Apply parsed email to form ──
  const applyEmail = () => {
    if (!emailParsed) return;
    const ts = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    const noteParts: string[] = [`[SolarEdge Lead — ${ts}]`];
    if (emailParsed.contractName) noteParts.push(`Contract: ${emailParsed.contractName}`);
    if (emailParsed.hsId) noteParts.push(`HS ID: ${emailParsed.hsId}`);
    if (emailParsed.notes) noteParts.push(`\nCustomer Notes: ${emailParsed.notes}`);
    setFormData(f => ({
      ...f,
      firstName: emailParsed.firstName || f.firstName,
      lastName: emailParsed.lastName || f.lastName,
      email: emailParsed.email || f.email,
      phone: emailParsed.phone || f.phone,
      address: emailParsed.address || f.address,
      city: emailParsed.city || f.city,
      state: emailParsed.state || f.state,
      zip: emailParsed.zip || f.zip,
      source: 'solaredge' as LeadSource,
      notes: noteParts.join('\n'),
    }));
    setTab('manual');
  };

  // ── Process Excel file ──
  const handleExcelFile = async (file: File) => {
    setExcelError('');
    setExcelFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      if (!rows.length) { setExcelError('No data found in spreadsheet.'); return; }
      const extractor = new RMAExtractor();
      extractor.parseData(rows);
      const cases = extractor.getAllCases();
      if (!cases.length) { setExcelError('No valid RMA cases found. Check column headers match the spec.'); return; }
      setExcelCases(cases);
      setExcelCaseIdx(0);
    } catch (err) {
      setExcelError(`Failed to parse file: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // ── Parse email ──
  const handleParseEmail = () => {
    setEmailError('');
    const result = parseSolarEdgeEmail(emailText);
    if (!result) { setEmailError('Could not parse — ensure you pasted the full SolarEdge lead email.'); return; }
    setEmailParsed(result);
  };

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onAdd(formData); };

  const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 shrink-0">
          <h3 className="text-lg font-bold text-slate-900">Add New Lead</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 shrink-0">
          {(['manual', 'excel', 'email'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === t ? 'border-b-2 border-amber-500 text-amber-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {t === 'manual' ? '✏️ Manual' : t === 'excel' ? '📊 Import Excel' : '📧 Paste Email'}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">

          {/* ── MANUAL TAB ── */}
          {tab === 'manual' && (
            <form id="lead-form" onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">First Name *</label>
                  <input type="text" required value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Last Name *</label>
                  <input type="text" required value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone *</label>
                  <input type="tel" required value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className={inputCls} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                <input type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className={inputCls} />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                  <input type="text" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                  <input type="text" value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ZIP</label>
                  <input type="text" value={formData.zip} onChange={e => setFormData({...formData, zip: e.target.value})} className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Monthly Bill ($)</label>
                  <input type="number" value={formData.monthlyBill} onChange={e => setFormData({...formData, monthlyBill: parseInt(e.target.value) || 0})} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Source</label>
                  <select value={formData.source} onChange={e => setFormData({...formData, source: e.target.value as LeadSource})} className={inputCls}>
                    {Object.entries(sourceLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={formData.homeowner} onChange={e => setFormData({...formData, homeowner: e.target.checked})} className="w-4 h-4 accent-amber-500" />
                <span className="text-sm text-slate-700">Homeowner</span>
              </label>

              {/* Customer Story Notes */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare className="w-4 h-4 text-amber-500" />
                  <label className="text-sm font-semibold text-slate-700">Customer Story</label>
                  {formData.notes.length > 0 && (
                    <span className="ml-auto text-xs text-slate-400">{formData.notes.length} chars</span>
                  )}
                </div>
                <textarea
                  value={formData.notes}
                  onChange={e => setFormData({...formData, notes: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono leading-relaxed resize-y"
                  style={{ minHeight: '140px' }}
                  placeholder="Start building the customer story here…&#10;&#10;Imported RMA reports, call notes, email history, and observations will appear here."
                />
              </div>
            </form>
          )}

          {/* ── EXCEL / RMA TAB ── */}
          {tab === 'excel' && (
            <div className="space-y-5">
              <p className="text-sm text-slate-600">
                Upload the <strong>SolarEdge RMA Excel</strong> file. Each case will be extracted using the RMA spec — contact info, shipping details, parts table, and work description are all pulled into the Customer Story.
              </p>

              {/* Drop zone */}
              <label className="block cursor-pointer">
                <div className="border-2 border-dashed border-amber-300 rounded-xl p-8 text-center hover:bg-amber-50 transition-colors">
                  <div className="text-3xl mb-2">📊</div>
                  <p className="text-sm font-medium text-slate-700">{excelFileName || 'Click to select Excel file'}</p>
                  <p className="text-xs text-slate-400 mt-1">.xlsx · .xls · .csv</p>
                </div>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="sr-only"
                  onChange={e => { if (e.target.files?.[0]) handleExcelFile(e.target.files[0]); }}
                />
              </label>

              {excelError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{excelError}</div>
              )}

              {excelCases.length > 0 && (
                <div className="space-y-4">
                  {/* Case selector */}
                  {excelCases.length > 1 && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        {excelCases.length} cases found — select one:
                      </label>
                      <select
                        value={excelCaseIdx}
                        onChange={e => setExcelCaseIdx(Number(e.target.value))}
                        className={inputCls}
                      >
                        {excelCases.map((c, i) => (
                          <option key={c.caseNum} value={i}>
                            Case {c.caseNum} — {c.leadData.firstName} {c.leadData.lastName}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Preview */}
                  {(() => {
                    const c = excelCases[excelCaseIdx];
                    return (
                      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2 text-sm">
                        <p className="font-semibold text-slate-800">Case {c.caseNum}</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-600">
                          <span><strong>Name:</strong> {c.leadData.firstName} {c.leadData.lastName}</span>
                          <span><strong>Phone:</strong> {c.leadData.phone || '—'}</span>
                          <span><strong>Email:</strong> {c.leadData.email || '—'}</span>
                          <span><strong>Zip:</strong> {c.leadData.zip || '—'}</span>
                        </div>
                        <div className="mt-3">
                          <p className="text-xs font-medium text-slate-500 mb-1">Customer Story Preview:</p>
                          <pre className="text-xs text-slate-600 bg-white border border-slate-200 rounded-lg p-3 max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed">{c.report.slice(0, 600)}{c.report.length > 600 ? '\n…(truncated)' : ''}</pre>
                        </div>
                        <button
                          onClick={() => applyExcelCase(excelCaseIdx)}
                          className="w-full mt-2 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium text-sm transition-colors"
                        >
                          Use This Lead →
                        </button>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* ── EMAIL PASTE TAB ── */}
          {tab === 'email' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Paste the full <strong>SolarEdge lead email</strong> below. Contact info and notes will be parsed and pre-filled automatically.
              </p>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email Content</label>
                <textarea
                  value={emailText}
                  onChange={e => { setEmailText(e.target.value); setEmailParsed(null); setEmailError(''); }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono resize-y"
                  style={{ minHeight: '160px' }}
                  placeholder="Paste the SolarEdge lead email here…&#10;&#10;First Name: Carlos&#10;Last Name: Diaz&#10;Email: …&#10;Phone: …"
                />
              </div>

              {emailError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{emailError}</div>
              )}

              <button
                onClick={handleParseEmail}
                disabled={!emailText.trim()}
                className="w-full py-2 bg-slate-700 hover:bg-slate-800 disabled:opacity-40 text-white rounded-lg font-medium text-sm transition-colors"
              >
                Parse Email
              </button>

              {emailParsed && (
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2 text-sm">
                  <p className="font-semibold text-slate-800 text-xs uppercase tracking-wide text-amber-600">Parsed Successfully ✓</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-600">
                    <span><strong>Name:</strong> {emailParsed.firstName} {emailParsed.lastName}</span>
                    <span><strong>Phone:</strong> {emailParsed.phone || '—'}</span>
                    <span><strong>Email:</strong> {emailParsed.email || '—'}</span>
                    <span><strong>ZIP:</strong> {emailParsed.zip || '—'}</span>
                    {emailParsed.contractName && <span className="col-span-2"><strong>Contract:</strong> {emailParsed.contractName}</span>}
                    {emailParsed.hsId && <span><strong>HS ID:</strong> {emailParsed.hsId}</span>}
                    {emailParsed.notes && <span className="col-span-2"><strong>Notes:</strong> {emailParsed.notes}</span>}
                  </div>
                  <button
                    onClick={applyEmail}
                    className="w-full mt-2 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium text-sm transition-colors"
                  >
                    Use This Lead →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer — only show submit on manual tab */}
        <div className="px-6 py-4 border-t border-slate-100 shrink-0 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm">
            Cancel
          </button>
          {tab === 'manual' && (
            <button type="submit" form="lead-form" className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-medium text-sm">
              Add Lead
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Simple icon components
const SunIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const MapPin: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

export default CRMDashboard;
