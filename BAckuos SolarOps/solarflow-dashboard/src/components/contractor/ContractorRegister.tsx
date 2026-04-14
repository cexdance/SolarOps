// SolarFlow - Contractor Registration Component
import React, { useState, useRef } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Upload,
  FileText,
  AlertCircle,
  Eye,
  EyeOff,
  Building,
  User,
  Phone,
  MapPin,
  Shield,
  ShieldCheck,
  CheckCircle,
  X,
} from 'lucide-react';
import { RegistrationState, RegistrationStep, BusinessType } from '../../types/contractor';
import { Contractor } from '../../types/contractor';

interface ContractorRegisterProps {
  onComplete: (contractor: Contractor) => void;
  onCancel: () => void;
}

const STEPS: { id: RegistrationStep; label: string; icon: string }[] = [
  { id: 'account', label: 'Account', icon: 'User' },
  { id: 'w9', label: 'Tax Info', icon: 'Building' },
  { id: 'insurance', label: 'Insurance', icon: 'Shield' },
  { id: 'safety', label: 'Safety', icon: 'ShieldCheck' },
];

// Safety protocol text derived from PDF
const SAFETY_PROTOCOL_TEXT = `CONTRACTOR SAFETY PROTOCOL
ConexSol Applications LLC — Field Operations Manual

This document establishes the mandatory safety standards for all contractors and subcontractors performing work on behalf of ConexSol Applications LLC. Compliance with these protocols is a condition of engagement.

1. MANDATORY PERSONAL PROTECTIVE EQUIPMENT (PPE)
All field personnel must wear the following PPE at all times while on any job site:
• Safety Vest (High-Visibility) - ANSI/ISEA 107 Class 2 or higher
• Hard Hat / Helmet - ANSI Z89.1 Type I or Type II Class E rated
• Safety Gloves - Cut-resistant (ANSI A4 minimum)
• Safety Goggles / Eye Protection - ANSI Z87.1 rated
• Non-Slip Safety Footwear - ASTM F2413 Steel or composite toe

2. SERVICE-SPECIFIC PPE REQUIREMENTS
• Inverter/Electrical Work: Arc flash rated face shield, insulated rubber gloves
• Roof/Panel Work: Full-body fall arrest harness, anchor points rated 5,000 lbs
• Battery Installation: Chemical-resistant gloves, face shield, Class D fire extinguisher

3. GENERAL JOB SITE SAFETY RULES
• Lock-Out/Tag-Out: All electrical systems must be de-energized before work
• Site Inspection: Perform hazard assessment before beginning work
• Heat & Weather: Mandatory hydration breaks every 45 minutes above 85°F
• Ladder Safety: Use Type IA (300 lb rated) ladders only

4. INCIDENT REPORTING
Any accident, near-miss, injury, or property damage must be reported immediately.

By signing below, you acknowledge that you have read, understood, and agree to comply with all safety protocols outlined in this document.`;

export const ContractorRegister: React.FC<ContractorRegisterProps> = ({ onComplete, onCancel }) => {
  const [currentStep, setCurrentStep] = useState<RegistrationStep>('account');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [termsScrolled, setTermsScrolled] = useState(false);
  const termsRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState<RegistrationState>({
    currentStep: 'account',
    email: '',
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
    contactName: '',
    contactPhone: '',
  });

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);

  const handleNext = () => {
    setError('');

    // Validation
    if (currentStep === 'account') {
      if (!formData.email || !formData.password) {
        setError('Please fill in all fields');
        return;
      }
      if (formData.password.length < 6) {
        setError('Password must be at least 6 characters');
        return;
      }
    }

    if (currentStep === 'w9') {
      if (!formData.businessName || !formData.ein || !formData.contactName) {
        setError('Please fill in all required fields');
        return;
      }
    }

    if (currentStep === 'insurance') {
      if (!formData.insuranceProvider || !formData.policyNumber || !formData.coiExpiryDate) {
        setError('Please fill in all insurance information');
        return;
      }
    }

    // Move to next step
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex].id);
    } else {
      // Complete registration
      const contractor: Contractor = {
        id: `contractor-${Date.now()}`,
        email: formData.email,
        password: formData.password,
        role: 'contractor',
        status: 'pending',
        createdAt: new Date().toISOString(),

        businessName: formData.businessName,
        businessType: formData.businessType,
        ein: formData.ein,
        streetAddress: formData.streetAddress,
        city: formData.city,
        state: formData.state,
        zip: formData.zip,

        insuranceProvider: formData.insuranceProvider,
        policyNumber: formData.policyNumber,
        coiDocument: formData.coiDocument,
        coiExpiryDate: formData.coiExpiryDate,
        generalLiabilityLimit: formData.generalLiabilityLimit,
        workersCompPolicy: formData.workersCompPolicy,

        agreedToSafety: formData.agreedToSafety,
        safetyAgreedDate: new Date().toISOString(),

        contactName: formData.contactName,
        contactPhone: formData.contactPhone,
        skills: [],
      };
      onComplete(contractor);
    }
  };

  const handleBack = () => {
    setError('');
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex].id);
    }
  };

  const handleTermsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    const isAtBottom = Math.abs(element.scrollHeight - element.scrollTop - element.clientHeight) < 50;
    if (isAtBottom && !termsScrolled) {
      setTermsScrolled(true);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // In production, this would upload to storage
      // For demo, we'll just store the filename
      setFormData({ ...formData, coiDocument: file.name });
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'account':
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Create Your Account</h2>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="you@company.com"
                className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="At least 6 characters"
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Contact Name</label>
                <input
                  type="text"
                  value={formData.contactName}
                  onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                  placeholder="Full name"
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={formData.contactPhone}
                  onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                  placeholder="555-123-4567"
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
          </div>
        );

      case 'w9':
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Tax Information (W-9)</h2>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Business Name</label>
              <input
                type="text"
                value={formData.businessName}
                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                placeholder="As shown on tax return"
                className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Business Type</label>
                <select
                  value={formData.businessType}
                  onChange={(e) => setFormData({ ...formData, businessType: e.target.value as BusinessType })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="sole_proprietor">Sole Proprietor</option>
                  <option value="llc">LLC</option>
                  <option value="c_corp">C Corporation</option>
                  <option value="s_corp">S Corporation</option>
                  <option value="partnership">Partnership</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">EIN / SSN</label>
                <input
                  type="text"
                  value={formData.ein}
                  onChange={(e) => setFormData({ ...formData, ein: e.target.value })}
                  placeholder="XX-XXXXXXX"
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Street Address</label>
              <input
                type="text"
                value={formData.streetAddress}
                onChange={(e) => setFormData({ ...formData, streetAddress: e.target.value })}
                placeholder="Business address"
                className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="City"
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  placeholder="FL"
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ZIP</label>
                <input
                  type="text"
                  value={formData.zip}
                  onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                  placeholder="33101"
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
          </div>
        );

      case 'insurance':
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Insurance Information</h2>

            {/* Required Insurance Info */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800">Minimum Requirements</p>
                  <ul className="text-sm text-amber-700 mt-1 space-y-1">
                    <li>• General Liability: $1,000,000 minimum</li>
                    <li>• Workers Compensation: Required in Florida</li>
                  </ul>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Insurance Provider</label>
              <input
                type="text"
                value={formData.insuranceProvider}
                onChange={(e) => setFormData({ ...formData, insuranceProvider: e.target.value })}
                placeholder="Insurance company name"
                className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Policy Number</label>
                <input
                  type="text"
                  value={formData.policyNumber}
                  onChange={(e) => setFormData({ ...formData, policyNumber: e.target.value })}
                  placeholder="Policy #"
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">COI Expiration Date</label>
                <input
                  type="date"
                  value={formData.coiExpiryDate}
                  onChange={(e) => setFormData({ ...formData, coiExpiryDate: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">General Liability Limit</label>
                <select
                  value={formData.generalLiabilityLimit}
                  onChange={(e) => setFormData({ ...formData, generalLiabilityLimit: parseInt(e.target.value) })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value={1000000}>$1,000,000</option>
                  <option value={2000000}>$2,000,000</option>
                  <option value={3000000}>$3,000,000</option>
                  <option value={5000000}>$5,000,000</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Workers Comp Policy #</label>
                <input
                  type="text"
                  value={formData.workersCompPolicy}
                  onChange={(e) => setFormData({ ...formData, workersCompPolicy: e.target.value })}
                  placeholder="WC Policy #"
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            {/* COI Upload */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Certificate of Insurance (COI)</label>
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-orange-400 transition-colors">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="coi-upload"
                />
                <label htmlFor="coi-upload" className="cursor-pointer">
                  {formData.coiDocument ? (
                    <div className="flex items-center justify-center gap-2 text-green-600">
                      <CheckCircle className="w-6 h-6" />
                      <span className="font-medium">{formData.coiDocument}</span>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                      <p className="text-sm text-slate-600">Click to upload COI (PDF, JPG, PNG)</p>
                      <p className="text-xs text-slate-400 mt-1">Max file size: 10MB</p>
                    </>
                  )}
                </label>
              </div>
            </div>
          </div>
        );

      case 'safety':
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-slate-900 mb-2">Safety Protocols</h2>
            <p className="text-sm text-slate-500 mb-4">
              Please read and acknowledge the safety protocols before proceeding.
            </p>

            {/* Terms Scroll Box */}
            <div
              ref={termsRef}
              onScroll={handleTermsScroll}
              className="bg-slate-50 border border-slate-200 rounded-lg p-4 h-64 overflow-y-auto text-sm text-slate-600 whitespace-pre-wrap"
            >
              {SAFETY_PROTOCOL_TEXT}
            </div>

            <label className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={formData.agreedToSafety}
                onChange={(e) => setFormData({ ...formData, agreedToSafety: e.target.checked })}
                disabled={!termsScrolled}
                className="mt-1 w-5 h-5 rounded text-orange-500 disabled:opacity-50"
              />
              <div>
                <p className="font-medium text-slate-900">
                  I have read and agree to the Safety Protocols
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {!termsScrolled
                    ? 'Scroll to the bottom to enable this option'
                    : 'By checking this box, you acknowledge compliance with all safety requirements'}
                </p>
              </div>
            </label>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 text-white px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <button onClick={onCancel} className="p-2 hover:bg-slate-800 rounded-lg">
            <X className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-bold">Contractor Registration</h1>
          <div className="w-10" />
        </div>
      </header>

      {/* Progress Steps */}
      <div className="bg-white border-b border-slate-200 px-4 py-4">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between">
            {STEPS.map((step, index) => {
              const isActive = step.id === currentStep;
              const isCompleted = STEPS.findIndex((s) => s.id === currentStep) > index;

              return (
                <React.Fragment key={step.id}>
                  <div className="flex flex-col items-center">
                    <div
                      className={`
                        w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                        ${isActive ? 'bg-orange-500 text-white' : isCompleted ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-500'}
                      `}
                    >
                      {isCompleted ? <Check className="w-4 h-4" /> : index + 1}
                    </div>
                    <span className={`text-xs mt-1 ${isActive ? 'text-orange-600 font-medium' : 'text-slate-500'}`}>
                      {step.label}
                    </span>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 ${isCompleted ? 'bg-green-500' : 'bg-slate-200'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* Form Content */}
      <div className="flex-1 px-4 py-6">
        <div className="max-w-lg mx-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <span className="text-sm text-red-700">{error}</span>
            </div>
          )}

          {renderStep()}
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="bg-white border-t border-slate-200 px-4 py-4">
        <div className="max-w-lg mx-auto flex gap-3">
          {currentStepIndex > 0 && (
            <button
              onClick={handleBack}
              className="flex-1 py-3 border border-slate-200 rounded-lg font-medium text-slate-600 hover:bg-slate-50"
            >
              <ArrowLeft className="w-5 h-5 inline mr-2" />
              Back
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={currentStep === 'safety' && (!formData.agreedToSafety || !termsScrolled)}
            className={`
              flex-1 py-3 rounded-lg font-medium transition-colors
              ${currentStep === 'safety' && (!formData.agreedToSafety || !termsScrolled)
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-orange-500 text-white hover:bg-orange-600'
              }
            `}
          >
            {currentStep === 'safety' ? 'Submit Application' : 'Continue'}
            {currentStep !== 'safety' && <ArrowRight className="w-5 h-5 inline ml-2" />}
          </button>
        </div>
      </div>
    </div>
  );
};
