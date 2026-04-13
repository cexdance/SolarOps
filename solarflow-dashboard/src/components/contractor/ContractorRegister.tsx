// SolarFlow - Contractor Registration / Onboarding Wizard
// Supports invite-token flow (email pre-filled & locked) and open registration
import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft, ArrowRight, Check, Upload, FileText,
  AlertCircle, Eye, EyeOff, Building, User, Phone,
  Shield, ShieldCheck, CheckCircle, X, ExternalLink,
  HardHat, Thermometer, Wind, Footprints, AlertTriangle,
} from 'lucide-react';
import { RegistrationState, RegistrationStep, BusinessType } from '../../types/contractor';
import { Contractor } from '../../types/contractor';
import { markInviteUsed } from '../../lib/contractorStore';
import ConexSolTerms from './ConexSolTerms';

interface ContractorRegisterProps {
  onComplete: (contractor: Contractor) => void;
  onCancel: () => void;
  // Invite-based pre-fill
  inviteEmail?: string;
  inviteToken?: string;
  invitedBy?: string;
}

const STEPS: { id: RegistrationStep; label: string }[] = [
  { id: 'account',   label: 'Account'   },
  { id: 'w9',        label: 'Tax / W-9' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'safety',    label: 'Safety'    },
  { id: 'terms',     label: 'Terms'     },
];

// ─── Safety guide content ─────────────────────────────────────────────────────

const SAFETY_SECTIONS = [
  {
    id: 'intro',
    icon: ShieldCheck,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    title: 'Our Commitment to Safety',
    content: `ConexSol Applications LLC operates under a zero-compromise safety culture. Every contractor who works under our brand represents our commitment to the well-being of our team, our clients, and the public.

This guide reflects OSHA 29 CFR 1926 (Construction Industry Standards) and OSHA 29 CFR 1910 (General Industry) standards applicable to photovoltaic system installation and maintenance in Florida.

Compliance with this guide is a mandatory condition of engagement. Non-compliance may result in immediate removal from the job site and termination of your contractor agreement.`,
  },
  {
    id: 'ppe',
    icon: HardHat,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    title: '1. Personal Protective Equipment (PPE)',
    content: `All field personnel must wear the following PPE at all times while on any job site. No exceptions.

MANDATORY FOR ALL JOBS:
• Hard Hat / Helmet — ANSI Z89.1 Type II, Class E rated. Required at all times when working on or near structures under construction or maintenance.
• High-Visibility Safety Vest — ANSI/ISEA 107 Class 2 minimum. Required when working near vehicle traffic or at commercial sites.
• Safety Glasses / Eye Protection — ANSI Z87.1 rated. Required during all drilling, cutting, or electrical work.
• Cut-Resistant Gloves — ANSI A4 minimum. Required when handling panels, racking, or wire management.
• Non-Slip Safety Footwear — See Section 5 for detailed footwear requirements.
• Sunscreen SPF 30+ — Required for all outdoor work. Reapply every 2 hours.

ELECTRICAL WORK — ADDITIONAL REQUIREMENTS:
• Arc flash rated face shield (minimum 8 cal/cm² for DC systems)
• Insulated rubber gloves (ASTM D120 Class 00 minimum for PV voltages)
• Voltage-rated tools only — non-insulated tools are prohibited near live circuits

BATTERY INSTALLATION — ADDITIONAL REQUIREMENTS:
• Chemical-resistant gloves (nitrile or neoprene, minimum 8 mil)
• Full face shield (not just safety glasses)
• Class D fire extinguisher within reach of work area
• Do NOT allow open flames or sparks within 10 feet of battery systems`,
  },
  {
    id: 'footwear',
    icon: Footprints,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    title: '2. Footwear Requirements',
    content: `Footwear is your primary defense against slips, punctures, and falls — particularly on residential and commercial roofing systems.

GENERAL REQUIREMENTS (ALL SITES):
• ASTM F2413-18 rated footwear — Steel toe or composite toe with electrical hazard (EH) protection
• Slip-resistant outsoles (ASTM F2913) — No smooth leather soles, dress shoes, or sneakers
• Ankle support — High-top work boots are strongly recommended

METAL ROOF REQUIREMENTS — CRITICAL:
Metal standing-seam, corrugated, and tin roofing surfaces present extreme slip hazards, especially when wet or in morning dew conditions.

• Rubber-soled boots with deep lug pattern are REQUIRED — standard leather soles are prohibited
• Soft-compound rubber soles (e.g., Vibram, Crepe, or equivalent) provide superior grip on metal surfaces
• Test grip before committing to a surface — approach metal roof panels cautiously and test traction on a low-pitch section before proceeding
• In wet conditions, ground-level operations are preferred — roof work on metal surfaces in rain or immediately after rain is prohibited unless emergency conditions require it and a full fall-arrest system is in use
• Check boot soles before every metal roof job — replace boots if outsole compound has hardened or worn smooth`,
  },
  {
    id: 'roofs',
    icon: Wind,
    color: 'text-sky-600',
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    title: '3. Roof Work & Fall Protection',
    content: `Falls are the #1 cause of fatalities in construction (OSHA 29 CFR 1926.502). All roof work requires a documented fall protection plan before work begins.

FALL PROTECTION — MANDATORY FOR ANY ROOF WORK:
• Full-body fall arrest harness (ANSI Z359.11) — required on any roof with pitch > 4:12 OR any roof edge within 6 feet
• Anchor points rated at minimum 5,000 lbs per person — inspect anchor condition before each use
• Self-retracting lanyard (SRL) or shock-absorbing lanyard — maximum free-fall of 6 feet
• Do not anchor to PV racking or conduit — these are NOT rated as fall arrest anchor points
• Roof bracket systems are acceptable only when properly installed and load-tested

METAL ROOF — HEIGHTENED PRECAUTIONS:
Metal roofing panels can deflect, shift, or become disconnected from substrate when subjected to body weight in the wrong locations. Thermal expansion also causes surface movement.
• Step only on structural members (rafters/purlins) or installed panel ridges — never on flat panel faces
• Identify rafter locations from inside before roof work begins
• Use a roof walk board or foam-padded plank across panel spans when possible
• Never work on metal roofs alone — a spotter on the ground is required

WIND CONDITIONS:
Florida is subject to high-wind events, afternoon thunderstorms, and seasonal tropical weather. Wind significantly increases fall risk on elevated surfaces.

• WIND SPEED LIMITS:
  – Above 20 mph (sustained): Increase anchor density; limit work near roof edges
  – Above 30 mph (sustained): Panel handling (carrying large surfaces) is prohibited — panels become sails
  – Above 40 mph (sustained): All elevated rooftop work must cease
  – Gusts exceeding 45 mph at any time: Evacuate roof immediately
• Check National Weather Service (weather.gov) or a weather app before every job with rooftop work
• If lightning is within 10 miles, ground all personnel — metal roofing, racking, and conduit are conductors
• Never work on roofs during or immediately after rain — surfaces remain hazardous for 30–60 minutes after precipitation`,
  },
  {
    id: 'heat',
    icon: Thermometer,
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
    title: '4. Heat Illness Prevention — Florida Critical',
    content: `Florida's heat and humidity create life-threatening conditions for outdoor workers. Heat stroke kills. ConexSol enforces mandatory heat illness prevention protocols aligned with OSHA's Heat Illness Prevention standard.

HEAT INDEX RISK LEVELS:
• 91–103°F (High Risk) — Mandatory 10-minute break every 60 minutes in shade; 8 oz water every 20 minutes
• 103–115°F (Very High Risk) — Mandatory 15-minute break every 45 minutes; work at reduced pace; buddy system required
• Above 115°F / Heat Index (Extreme Risk) — Limit strenuous work; reduce crew density on rooftops; consider postponing non-emergency roof work

SIGNS OF HEAT EXHAUSTION — STOP WORK:
• Heavy sweating, weakness, cold/pale/clammy skin
• Weak pulse, nausea or fainting
• Action: Move to shade, cool with water, drink fluids, call supervisor

SIGNS OF HEAT STROKE — CALL 911 IMMEDIATELY:
• High body temperature (103°F+), hot/red/dry skin — sweating stops
• Rapid strong pulse, confusion or unconsciousness
• This is a medical emergency — cool the person down immediately while waiting for EMS
  – Apply ice packs to neck, armpits, and groin
  – Do NOT give fluids to an unconscious person

ROOFTOP-SPECIFIC HEAT HAZARDS:
• Metal roofing surfaces can reach 170°F+ in direct Florida sun — contact burns occur in seconds
• Dark-colored rooftop surfaces (asphalt shingles, TPO membranes) can reach 160°F+
• Never set tools, equipment, or bags directly on hot metal surfaces — they will become too hot to handle
• Wear long sleeves — UV reflected off panel glass can cause sunburn within 30 minutes
• Start rooftop work early (before 10am) — schedule critical roof tasks in the morning hours
• Acclimation protocol: New crew members or those returning from time off must not perform full-intensity rooftop work for at least 3 days — reduce workload by 50% on days 1-3

HYDRATION:
• Drink 1 cup (8 oz) of water every 20 minutes — do not wait until you're thirsty
• Electrolyte supplements (Gatorade, Pedialyte packets) are encouraged on days above 90°F
• Avoid alcohol the night before and morning of any outdoor work day
• Caffeinated beverages increase dehydration — limit coffee/energy drinks on hot days`,
  },
  {
    id: 'electrical',
    icon: AlertTriangle,
    color: 'text-yellow-600',
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    title: '5. Electrical Safety & Lock-Out / Tag-Out',
    content: `PV systems generate live DC voltage whenever panels are exposed to light — there is NO off switch for a solar array. DC voltages can exceed 600V on string systems.

LOCK-OUT / TAG-OUT (LOTO) — OSHA 29 CFR 1910.147:
• De-energize ALL circuits before working on electrical components
• Cover panels with opaque tarps or blankets before disconnecting DC wiring
• Lock the main AC disconnect in the OFF position and apply your personal lockout tag
• Verify zero energy with a calibrated meter before touching any conductor
• NEVER assume a circuit is de-energized — verify with your own meter

ADDITIONAL ELECTRICAL RULES:
• Do not work on inverters or combiners in wet conditions — even drizzle creates electrocution risk
• Do not use uninsulated tools near live terminals
• If you discover damaged wiring, exposed conductors, or arc damage: stop work, document, and notify the office immediately
• Two-person rule: All work on live conductors (where LOTO is not feasible) requires a second qualified person on-site

INCIDENT REPORTING:
Any electrical shock — no matter how minor it feels — must be reported immediately. Delayed cardiac effects from electrical exposure can occur hours after contact. Seek medical evaluation after any electrical contact.`,
  },
  {
    id: 'general',
    icon: Shield,
    color: 'text-slate-600',
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    title: '6. General Job Site Rules',
    content: `SITE ASSESSMENT — BEFORE EVERY JOB:
• Perform a visual hazard assessment upon arrival — identify trip hazards, overhead lines, unstable surfaces
• Check weather forecast — plan roof work around heat index and wind
• Notify office if you identify site conditions not covered by the work order

LADDER SAFETY:
• Use Type IA ladders (300 lb capacity) minimum — Type II residential ladders are prohibited
• Three-point contact at all times when climbing
• Never carry materials with both hands while on a ladder — use a tool bag or rope haul
• Ladder must extend 3 feet above the roof edge

TOOLS & EQUIPMENT:
• Inspect all tools before each use — damaged tools must be tagged out and replaced
• Power tools must be double-insulated or have ground fault protection (GFCI) on 120V circuits
• Store tools secured on roof — never leave tools on sloped surfaces unattended

COMMUNICATION:
• Always have your phone charged and accessible on the job site
• Notify your dispatcher before starting roof work and when you descend
• If you're working alone and experience an incident: call 911 first, then call the office
• Emergency contact for ConexSol field operations: on-call dispatcher number is in your ContractorDashboard

ZERO TOLERANCE ITEMS — IMMEDIATE DISMISSAL:
• Working on a roof without fall protection where required
• Performing electrical work while impaired or without LOTO
• Ignoring heat illness symptoms in yourself or a team member
• Falsifying job documentation, photos, or safety checklists`,
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export const ContractorRegister: React.FC<ContractorRegisterProps> = ({
  onComplete,
  onCancel,
  inviteEmail,
  inviteToken,
  invitedBy,
}) => {
  const [currentStep, setCurrentStep] = useState<RegistrationStep>('account');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [safetyScrolled, setSafetyScrolled] = useState(false);
  const [safetySignature, setSafetySignature] = useState('');
  const [sunbizLookupDone, setSunbizLookupDone] = useState(false);
  const [sunbizVerified, setSunbizVerified] = useState(false);
  const [sunbizEntityNumber, setSunbizEntityNumber] = useState('');
  const safetyRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState<RegistrationState>({
    currentStep: 'account',
    email: inviteEmail ?? '',
    password: '',
    businessName: '',
    businessType: 'sole_proprietor',
    ein: '',
    streetAddress: '',
    city: '',
    state: 'FL',
    zip: '',
    insuranceProvider: '',
    policyNumber: '',
    coiDocument: '',
    coiExpiryDate: '',
    generalLiabilityLimit: 1000000,
    workersCompPolicy: '',
    agreedToSafety: false,
    w9Document: '',
    oshaDocument: '',
    oshaVerified: undefined as 'link' | 'upload' | undefined,
    termsAcceptedAt: '',
    termsVersion: '',
    contactName: '',
    contactPhone: '',
  });

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);

  const handleNext = () => {
    setError('');

    if (currentStep === 'account') {
      if (!formData.email || !formData.password || !formData.contactName || !formData.contactPhone) {
        setError('Please fill in all required fields.');
        return;
      }
      if (formData.password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
    }

    if (currentStep === 'w9') {
      if (!formData.businessName || !formData.ein || !formData.streetAddress || !formData.city || !formData.zip) {
        setError('Please fill in all required W-9 fields.');
        return;
      }
      if (!/^\d{2}-\d{7}$/.test(formData.ein) && !/^\d{3}-\d{2}-\d{4}$/.test(formData.ein)) {
        setError('EIN format: XX-XXXXXXX   SSN format: XXX-XX-XXXX');
        return;
      }
    }

    if (currentStep === 'insurance') {
      if (!formData.insuranceProvider || !formData.policyNumber || !formData.coiExpiryDate) {
        setError('Please fill in all insurance fields.');
        return;
      }
    }

    if (currentStep === 'safety') {
      if (!safetyScrolled) {
        setError('Please scroll through and read the entire safety guide before signing.');
        return;
      }
      if (!safetySignature || safetySignature.trim().length < 3) {
        setError('Please type your full legal name as your electronic signature.');
        return;
      }
      if (safetySignature.trim().toLowerCase() !== formData.contactName.trim().toLowerCase()) {
        setError(`Signature must match your contact name: "${formData.contactName}"`);
        return;
      }

      // Advance to terms step
      setCurrentStep('terms');
      return;
    }

    if (currentStep === 'terms') {
      // Complete registration — called after T&C acceptance via ConexSolTerms onAccept
      const contractor: Contractor = {
        id: `contractor-${Date.now()}`,
        email: formData.email,
        password: formData.password,
        role: 'contractor',
        status: 'pending',
        createdAt: new Date().toISOString(),

        // Invite tracking
        inviteToken: inviteToken,
        inviteEmail: inviteEmail,
        invitedBy: invitedBy,

        businessName: formData.businessName,
        businessType: formData.businessType,
        ein: formData.ein,
        streetAddress: formData.streetAddress,
        city: formData.city,
        state: formData.state,
        zip: formData.zip,

        sunbizVerified,
        sunbizVerifiedAt: sunbizVerified ? new Date().toISOString() : undefined,
        sunbizEntityNumber: sunbizEntityNumber || undefined,

        insuranceProvider: formData.insuranceProvider,
        policyNumber: formData.policyNumber,
        coiDocument: formData.coiDocument,
        coiExpiryDate: formData.coiExpiryDate,
        generalLiabilityLimit: formData.generalLiabilityLimit,
        workersCompPolicy: formData.workersCompPolicy,

        agreedToSafety: true,
        safetyAgreedDate: new Date().toISOString(),
        safetySignature: safetySignature.trim(),

        w9Document: formData.w9Document || undefined,
        oshaDocument: formData.oshaDocument || undefined,
        oshaVerified: formData.oshaVerified,
        termsAcceptedAt: formData.termsAcceptedAt || undefined,
        termsVersion: formData.termsVersion || undefined,

        contactName: formData.contactName,
        contactPhone: formData.contactPhone,
        skills: [],
      };

      // Mark invite used if applicable
      if (inviteToken) {
        markInviteUsed(inviteToken, contractor.id);
      }

      onComplete(contractor);
      return;
    }

    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex].id);
    }
  };

  const handleBack = () => {
    setError('');
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex].id);
    }
  };

  const handleSafetyScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (nearBottom && !safetyScrolled) setSafetyScrolled(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setFormData({ ...formData, coiDocument: file.name });
  };

  const handleSunbizSearch = () => {
    const query = encodeURIComponent(formData.businessName);
    const url = `https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults?inquiryType=EntityName&inquiryDirectionType=ForwardList&searchNameOrder=&masterFileNumber=&inquiryTypeCode=ENM&searchTerm=${query}&listNameOrder=`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setSunbizLookupDone(true);
  };

  // ── Render steps ─────────────────────────────────────────────────────────────

  const renderStep = () => {
    switch (currentStep) {

      // ── STEP 1: Account ────────────────────────────────────────────────────
      case 'account':
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Create Your Account</h2>
              {inviteEmail ? (
                <p className="text-sm text-emerald-700 mt-1 flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4" />
                  You were invited by <strong>{invitedBy ?? 'ConexSol'}</strong> — email pre-filled below
                </p>
              ) : (
                <p className="text-sm text-slate-500 mt-1">Your login credentials for the contractor portal.</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => !inviteEmail && setFormData({ ...formData, email: e.target.value })}
                readOnly={!!inviteEmail}
                placeholder="you@company.com"
                className={`w-full px-4 py-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                  inviteEmail ? 'bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed' : 'border-slate-200'
                }`}
              />
              {inviteEmail && (
                <p className="text-xs text-slate-400 mt-1">Email locked to your invite — cannot be changed.</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="At least 8 characters"
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  <User className="w-3.5 h-3.5 inline mr-1 text-slate-400" />
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.contactName}
                  onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                  placeholder="Your legal name"
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  <Phone className="w-3.5 h-3.5 inline mr-1 text-slate-400" />
                  Phone <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={formData.contactPhone}
                  onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                  placeholder="555-123-4567"
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
          </div>
        );

      // ── STEP 2: W-9 + SunBiz ──────────────────────────────────────────────
      case 'w9':
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Tax Information (W-9)</h2>
              <p className="text-sm text-slate-500 mt-1">
                Required for 1099 filing. Must match your IRS records exactly.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Legal Business Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.businessName}
                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                placeholder="As shown on your tax return"
                className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            {/* SunBiz Verification */}
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <Building className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-blue-900">Florida Business Registry Verification</p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    We cross-reference your business name against the Florida Division of Corporations (sunbiz.org) to verify your registration status.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSunbizSearch}
                disabled={!formData.businessName}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Search {formData.businessName || 'your business'} on SunBiz
              </button>

              {sunbizLookupDone && (
                <div className="space-y-2 pt-1 border-t border-blue-200">
                  <p className="text-xs text-blue-800 font-medium">
                    After searching SunBiz, confirm your verification below:
                  </p>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sunbizVerified}
                      onChange={e => setSunbizVerified(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded border-blue-400 accent-blue-600"
                    />
                    <span className="text-xs text-blue-900">
                      I confirm my business is registered and <strong>Active</strong> on the Florida Division of Corporations registry (sunbiz.org)
                    </span>
                  </label>
                  {sunbizVerified && (
                    <div>
                      <label className="block text-xs font-medium text-blue-800 mb-1">
                        FDOC Document / Entity Number (optional but recommended)
                      </label>
                      <input
                        type="text"
                        value={sunbizEntityNumber}
                        onChange={e => setSunbizEntityNumber(e.target.value)}
                        placeholder="e.g. L24000012345"
                        className="w-full px-3 py-1.5 border border-blue-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                      />
                    </div>
                  )}
                  {sunbizVerified && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold">
                      <CheckCircle className="w-3.5 h-3.5" />
                      SunBiz Verified
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Business Type</label>
                <select
                  value={formData.businessType}
                  onChange={(e) => setFormData({ ...formData, businessType: e.target.value as BusinessType })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="sole_proprietor">Sole Proprietor</option>
                  <option value="llc">LLC</option>
                  <option value="c_corp">C Corporation</option>
                  <option value="s_corp">S Corporation</option>
                  <option value="partnership">Partnership</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  EIN or SSN <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.ein}
                  onChange={(e) => setFormData({ ...formData, ein: e.target.value })}
                  placeholder={formData.businessType === 'sole_proprietor' ? 'XXX-XX-XXXX' : 'XX-XXXXXXX'}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Business Address <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.streetAddress}
                onChange={(e) => setFormData({ ...formData, streetAddress: e.target.value })}
                placeholder="Street address"
                className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="col-span-2 sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">City <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="City"
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                <select
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {['FL','GA','TX','CA','NY','NC','SC','TN','AL','MS'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">ZIP <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={formData.zip}
                  onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                  placeholder="33101"
                  maxLength={5}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            <div className="text-xs text-slate-400 flex items-start gap-1.5 pt-1">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              This information is used solely for IRS 1099-NEC reporting and will not be shared with third parties.
            </div>

            {/* W-9 Document Upload */}
            <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-sm font-semibold text-slate-700 mb-1">W-9 Document</p>
              <p className="text-xs text-slate-500 mb-3">Upload your signed W-9 form (PDF or image). Required before first payment.</p>
              {formData.w9Document ? (
                <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span className="text-sm text-green-700 font-medium flex-1">W-9 uploaded</span>
                  <button type="button" onClick={() => setFormData(f => ({ ...f, w9Document: '' }))}
                    className="text-xs text-red-500 hover:underline">Remove</button>
                </div>
              ) : (
                <label className="flex flex-col items-center gap-2 p-4 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-orange-400 transition-colors">
                  <Upload className="w-5 h-5 text-slate-400" />
                  <span className="text-sm text-slate-500">Click to upload W-9</span>
                  <input type="file" accept=".pdf,image/*" className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = ev => setFormData(f => ({ ...f, w9Document: ev.target?.result as string }));
                      reader.readAsDataURL(file);
                    }} />
                </label>
              )}
            </div>
          </div>
        );

      // ── STEP 3: Insurance ─────────────────────────────────────────────────
      case 'insurance':
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Insurance Documentation</h2>
              <p className="text-sm text-slate-500 mt-1">
                ConexSol requires proof of General Liability and Workers' Compensation insurance before any field work.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  <Shield className="w-3.5 h-3.5 inline mr-1 text-slate-400" />
                  Insurance Provider <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.insuranceProvider}
                  onChange={(e) => setFormData({ ...formData, insuranceProvider: e.target.value })}
                  placeholder="e.g. Nationwide, Zurich"
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  GL Policy Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.policyNumber}
                  onChange={(e) => setFormData({ ...formData, policyNumber: e.target.value })}
                  placeholder="GL-XXXX-XXXXX"
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Workers' Comp Policy
                </label>
                <input
                  type="text"
                  value={formData.workersCompPolicy}
                  onChange={(e) => setFormData({ ...formData, workersCompPolicy: e.target.value })}
                  placeholder="WC-XXXX-XXXXX"
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  COI Expiry Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formData.coiExpiryDate}
                  onChange={(e) => setFormData({ ...formData, coiExpiryDate: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                General Liability Limit
              </label>
              <select
                value={formData.generalLiabilityLimit}
                onChange={(e) => setFormData({ ...formData, generalLiabilityLimit: parseInt(e.target.value) })}
                className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value={500000}>$500,000</option>
                <option value={1000000}>$1,000,000</option>
                <option value={2000000}>$2,000,000</option>
                <option value={5000000}>$5,000,000+</option>
              </select>
              <p className="text-xs text-slate-400 mt-1">Minimum $1,000,000 required. Commercial jobs may require $2M+.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Certificate of Insurance (COI)
              </label>
              <label className="flex items-center gap-3 px-4 py-3 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer hover:border-orange-300 hover:bg-orange-50 transition-colors">
                <Upload className="w-5 h-5 text-slate-400" />
                <div className="flex-1">
                  {formData.coiDocument ? (
                    <span className="text-sm text-emerald-700 font-medium flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4" /> {formData.coiDocument}
                    </span>
                  ) : (
                    <span className="text-sm text-slate-500">Upload COI (PDF or image)</span>
                  )}
                </div>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileUpload} className="hidden" />
              </label>
              <p className="text-xs text-slate-400 mt-1">
                ConexSol must be listed as an Additional Insured on your policy.
              </p>
            </div>
          </div>
        );

      // ── STEP 4: Safety ────────────────────────────────────────────────────
      case 'safety':
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Safety Acknowledgment</h2>
              <p className="text-sm text-slate-500 mt-1">
                Read the full safety guide below — scroll to the bottom to unlock your signature.
              </p>
            </div>

            {/* Safety document scroll area */}
            <div
              ref={safetyRef}
              onScroll={handleSafetyScroll}
              className="h-72 overflow-y-auto border border-slate-200 rounded-xl bg-white"
            >
              <div className="p-5 space-y-5">
                {/* Header */}
                <div className="text-center pb-4 border-b border-slate-200">
                  <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <ShieldCheck className="w-6 h-6 text-orange-600" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900">CONTRACTOR SAFETY GUIDE</h3>
                  <p className="text-xs text-slate-500 mt-1">ConexSol Applications LLC — Field Operations Manual</p>
                  <p className="text-xs text-slate-400 mt-0.5">OSHA 29 CFR 1926 / 29 CFR 1910 Compliant · Effective January 2026</p>
                </div>

                {/* Sections */}
                {SAFETY_SECTIONS.map((section) => {
                  const Icon = section.icon;
                  return (
                    <div key={section.id} className={`rounded-xl border ${section.border} ${section.bg} p-4`}>
                      <div className="flex items-center gap-2 mb-3">
                        <Icon className={`w-4 h-4 flex-shrink-0 ${section.color}`} />
                        <h4 className={`text-sm font-bold ${section.color}`}>{section.title}</h4>
                      </div>
                      <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                        {section.content}
                      </div>
                    </div>
                  );
                })}

                {/* Footer */}
                <div className="text-center pt-4 border-t border-slate-200 space-y-1">
                  <p className="text-xs font-semibold text-slate-700">End of Safety Guide</p>
                  <p className="text-xs text-slate-400">
                    This document is reviewed and updated annually. Last revision: January 2026.
                  </p>
                </div>
              </div>
            </div>

            {/* OSHA Certification */}
            <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-blue-600" />
                <p className="text-sm font-semibold text-blue-800">OSHA 30-Hour Construction Certification</p>
              </div>
              <p className="text-xs text-blue-700 mb-3">Required within 90 days of onboarding. Complete the course or upload your existing certificate.</p>
              <div className="space-y-2">
                <a
                  href="https://www.careersafeonline.com/courses/osha-30-hour-construction"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Complete OSHA 30-Hour Course Online
                </a>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-blue-200" />
                  <span className="text-xs text-blue-500">or</span>
                  <div className="flex-1 h-px bg-blue-200" />
                </div>
                {formData.oshaDocument ? (
                  <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span className="text-sm text-green-700 font-medium flex-1">OSHA certificate uploaded</span>
                    <button type="button" onClick={() => setFormData(f => ({ ...f, oshaDocument: '', oshaVerified: undefined }))}
                      className="text-xs text-red-500 hover:underline">Remove</button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-blue-300 rounded-lg cursor-pointer hover:border-blue-500 transition-colors">
                    <Upload className="w-4 h-4 text-blue-400" />
                    <span className="text-sm text-blue-600 font-medium">Upload existing OSHA certificate</span>
                    <input type="file" accept=".pdf,image/*" className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = ev => setFormData(f => ({ ...f, oshaDocument: ev.target?.result as string, oshaVerified: 'upload' }));
                        reader.readAsDataURL(file);
                      }} />
                  </label>
                )}
              </div>
            </div>

            {/* Scroll progress indicator */}
            {!safetyScrolled && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                Scroll to the bottom of the safety guide to enable signing.
              </div>
            )}

            {/* Signature */}
            {safetyScrolled && (
              <div className="space-y-3 border-t border-slate-200 pt-4">
                <div className="flex items-start gap-2 px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-800">
                    You have read the full safety guide. Please sign below to confirm your acknowledgment.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Electronic Signature — Type your full legal name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={safetySignature}
                    onChange={e => setSafetySignature(e.target.value)}
                    placeholder={formData.contactName || 'Your full legal name'}
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg text-base font-medium italic focus:outline-none focus:ring-2 focus:ring-orange-500"
                    style={{ fontFamily: 'Georgia, serif' }}
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Must match exactly: <strong>{formData.contactName}</strong>
                  </p>
                </div>

                <div className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
                  By signing, you acknowledge that you have read, understood, and agree to comply with all
                  safety protocols in this guide. This constitutes a legally binding electronic agreement
                  under the ESIGN Act. Signed: {new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}.
                </div>
              </div>
            )}
          </div>
        );

      case 'terms':
        return (
          <div className="space-y-4">
            <div className="overflow-y-auto max-h-[60vh] rounded-xl border border-slate-200">
              <ConexSolTerms
                onAccept={() => {
                  setFormData(f => ({ ...f, termsAcceptedAt: new Date().toISOString(), termsVersion: 'v2026.1' }));
                  handleNext();
                }}
                onDecline={() => setError('You must accept the terms to continue.')}
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <div className="overflow-hidden" style={{ height: 64, width: 220 }}>
            <img
              src="/conexsol-logo.png"
              alt="Conexsol"
              className="brightness-0 invert"
              style={{ width: 220, height: 'auto', marginTop: -53 }}
            />
          </div>
          <p className="text-slate-400 text-sm tracking-wide">Contractor Onboarding</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Step progress */}
          <div className="px-6 pt-6 pb-4 border-b border-slate-100">
            <div className="flex items-center">
              {STEPS.map((step, idx) => {
                const isDone = idx < currentStepIndex;
                const isCurrent = idx === currentStepIndex;
                return (
                  <React.Fragment key={step.id}>
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        isDone ? 'bg-emerald-500 text-white'
                          : isCurrent ? 'bg-orange-500 text-white ring-4 ring-orange-100'
                          : 'bg-slate-100 text-slate-400'
                      }`}>
                        {isDone ? <Check className="w-3.5 h-3.5" /> : idx + 1}
                      </div>
                      <span className={`text-xs font-medium hidden sm:block ${
                        isCurrent ? 'text-slate-900' : isDone ? 'text-emerald-600' : 'text-slate-400'
                      }`}>
                        {step.label}
                      </span>
                    </div>
                    {idx < STEPS.length - 1 && (
                      <div className={`flex-1 h-px mx-2 ${isDone ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Step content */}
          <div className="p-6">
            {renderStep()}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 mt-4 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-6">
              <button
                type="button"
                onClick={currentStepIndex === 0 ? onCancel : handleBack}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                {currentStepIndex === 0 ? 'Cancel' : 'Back'}
              </button>

              <button
                type="button"
                onClick={handleNext}
                className="flex items-center gap-2 px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg text-sm transition-colors cursor-pointer"
              >
                {currentStep === 'terms' ? (
                  <>
                    <FileText className="w-4 h-4" />
                    Submit Application
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-slate-500 mt-4">
          Your application will be reviewed within 1–2 business days.
        </p>
      </div>
    </div>
  );
};
