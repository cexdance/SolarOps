import { useState } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Upload,
  FileText,
  Shield,
  Building2,
  Mail,
  Lock,
  MapPin,
  AlertCircle,
  ChevronDown
} from 'lucide-react';
import { RegistrationData } from '../types/contractor';
import { businessTypes, insuranceRequirements, safetyProtocolText } from '../lib/contractorData';

const steps = [
  { id: 1, title: 'Account', description: 'Create your account' },
  { id: 2, title: 'Business', description: 'Business information (W-9)' },
  { id: 3, title: 'Insurance', description: 'Certificate of Insurance' },
  { id: 4, title: 'Safety', description: 'Safety protocols & terms' },
];

export default function ContractorRegistration() {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<RegistrationData>({
    step: 1,
    email: '',
    password: '',
    businessName: '',
    businessType: '',
    ein: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    insuranceExpiry: '',
    insuranceDocument: '',
    safetyAcknowledged: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [scrolledToBottom, setScrolledToBottom] = useState(false);

  const updateFormData = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (step === 1) {
      if (!formData.email) newErrors.email = 'Email is required';
      else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Invalid email format';
      if (!formData.password) newErrors.password = 'Password is required';
      else if (formData.password.length < 8) newErrors.password = 'Password must be at least 8 characters';
      if (formData.password !== formData.password) newErrors.confirmPassword = 'Passwords do not match';
    }

    if (step === 2) {
      if (!formData.businessName) newErrors.businessName = 'Business name is required';
      if (!formData.businessType) newErrors.businessType = 'Business type is required';
      if (!formData.ein) newErrors.ein = 'EIN is required';
      if (!formData.address) newErrors.address = 'Address is required';
      if (!formData.city) newErrors.city = 'City is required';
      if (!formData.state) newErrors.state = 'State is required';
      if (!formData.zip) newErrors.zip = 'ZIP code is required';
    }

    if (step === 3) {
      if (!formData.insuranceExpiry) newErrors.insuranceExpiry = 'Insurance expiry date is required';
      if (!formData.insuranceDocument) newErrors.insuranceDocument = 'Please upload your COI document';
    }

    if (step === 4) {
      if (!formData.safetyAcknowledged) newErrors.safetyAcknowledged = 'You must acknowledge the safety protocols';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 4));
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = () => {
    if (validateStep(4)) {
      alert('Registration submitted successfully! Your application is pending approval.');
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8 text-orange-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Create Your Account</h2>
              <p className="text-gray-500 mt-2">Start your contractor registration process</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => updateFormData('email', e.target.value)}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent ${errors.email ? 'border-red-500' : 'border-gray-300'}`}
                placeholder="you@company.com"
              />
              {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => updateFormData('password', e.target.value)}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent ${errors.password ? 'border-red-500' : 'border-gray-300'}`}
                placeholder="Minimum 8 characters"
              />
              {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Confirm Password</label>
              <input
                type="password"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder="Confirm your password"
              />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Building2 className="w-8 h-8 text-orange-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Business Information</h2>
              <p className="text-gray-500 mt-2">W-9 Tax Information</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Legal Business Name</label>
              <input
                type="text"
                value={formData.businessName}
                onChange={(e) => updateFormData('businessName', e.target.value)}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent ${errors.businessName ? 'border-red-500' : 'border-gray-300'}`}
                placeholder="As shown on tax return"
              />
              {errors.businessName && <p className="text-red-500 text-sm mt-1">{errors.businessName}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Business Type</label>
              <div className="relative">
                <select
                  value={formData.businessType}
                  onChange={(e) => updateFormData('businessType', e.target.value)}
                  className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent appearance-none ${errors.businessType ? 'border-red-500' : 'border-gray-300'}`}
                >
                  <option value="">Select business type</option>
                  {businessTypes.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              </div>
              {errors.businessType && <p className="text-red-500 text-sm mt-1">{errors.businessType}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">EIN (Employer Identification Number)</label>
              <input
                type="text"
                value={formData.ein}
                onChange={(e) => updateFormData('ein', e.target.value)}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent ${errors.ein ? 'border-red-500' : 'border-gray-300'}`}
                placeholder="XX-XXXXXXX"
                maxLength={10}
              />
              {errors.ein && <p className="text-red-500 text-sm mt-1">{errors.ein}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Business Address</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => updateFormData('address', e.target.value)}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent ${errors.address ? 'border-red-500' : 'border-gray-300'}`}
                placeholder="Street address"
              />
              {errors.address && <p className="text-red-500 text-sm mt-1">{errors.address}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => updateFormData('city', e.target.value)}
                  className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent ${errors.city ? 'border-red-500' : 'border-gray-300'}`}
                />
                {errors.city && <p className="text-red-500 text-sm mt-1">{errors.city}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">State</label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) => updateFormData('state', e.target.value)}
                  className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent ${errors.state ? 'border-red-500' : 'border-gray-300'}`}
                  placeholder="FL"
                />
                {errors.state && <p className="text-red-500 text-sm mt-1">{errors.state}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">ZIP Code</label>
              <input
                type="text"
                value={formData.zip}
                onChange={(e) => updateFormData('zip', e.target.value)}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent ${errors.zip ? 'border-red-500' : 'border-gray-300'}`}
                placeholder="33101"
                maxLength={5}
              />
              {errors.zip && <p className="text-red-500 text-sm mt-1">{errors.zip}</p>}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-orange-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Insurance Requirements</h2>
              <p className="text-gray-500 mt-2">Upload your Certificate of Insurance</p>
            </div>

            {/* Insurance Requirements Display */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-gray-900 mb-3">Required Coverage</h3>
              <div className="space-y-2">
                {insuranceRequirements.map((req, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600" />
                      <span className="text-gray-700">{req.name}</span>
                    </div>
                    <span className="text-sm font-medium text-gray-600">{req.amount}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Insurance Expiration Date</label>
              <input
                type="date"
                value={formData.insuranceExpiry}
                onChange={(e) => updateFormData('insuranceExpiry', e.target.value)}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent ${errors.insuranceExpiry ? 'border-red-500' : 'border-gray-300'}`}
              />
              {errors.insuranceExpiry && <p className="text-red-500 text-sm mt-1">{errors.insuranceExpiry}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Upload Certificate of Insurance</label>
              <div className={`border-2 border-dashed rounded-lg p-8 text-center ${errors.insuranceDocument ? 'border-red-500 bg-red-50' : 'border-gray-300 hover:border-orange-400'}`}>
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-2">Drag and drop your COI here</p>
                <p className="text-sm text-gray-400">PDF, JPG, or PNG (max 10MB)</p>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      updateFormData('insuranceDocument', file.name);
                    }
                  }}
                />
                <button
                  type="button"
                  className="mt-4 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600"
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.pdf,.jpg,.jpeg,.png';
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) {
                        updateFormData('insuranceDocument', file.name);
                      }
                    };
                    input.click();
                  }}
                >
                  Browse Files
                </button>
              </div>
              {formData.insuranceDocument && (
                <div className="mt-2 flex items-center gap-2 text-green-600">
                  <Check className="w-4 h-4" />
                  <span className="text-sm">{formData.insuranceDocument}</span>
                </div>
              )}
              {errors.insuranceDocument && <p className="text-red-500 text-sm mt-1">{errors.insuranceDocument}</p>}
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-orange-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Safety Protocols & Terms</h2>
              <p className="text-gray-500 mt-2">Please review and acknowledge</p>
            </div>

            <div
              className="bg-gray-50 border border-gray-200 rounded-lg p-4 h-64 overflow-y-auto"
              onScroll={(e) => {
                const target = e.target as HTMLElement;
                const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
                setScrolledToBottom(isAtBottom);
              }}
            >
              <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">{safetyProtocolText}</pre>
            </div>

            <div className={`border rounded-lg p-4 ${errors.safetyAcknowledged ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.safetyAcknowledged}
                  onChange={(e) => updateFormData('safetyAcknowledged', e.target.checked)}
                  className="mt-1 w-5 h-5 text-orange-600 rounded focus:ring-orange-500"
                  disabled={!scrolledToBottom}
                />
                <div>
                  <span className="font-medium text-gray-900">I have read and agree to the Safety Protocols & Subcontractor Agreement</span>
                  <p className="text-sm text-gray-500 mt-1">{!scrolledToBottom ? 'Please scroll to read the full document' : 'By checking this box, you acknowledge that you have read and understood all safety protocols'}</p>
                </div>
              </label>
              {errors.safetyAcknowledged && <p className="text-red-500 text-sm mt-2">{errors.safetyAcknowledged}</p>}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Conexsol Contractor Portal</h1>
          <p className="text-gray-500 mt-2">Join our network of certified solar contractors</p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className={`flex flex-col items-center ${index < steps.length - 1 ? 'flex-1' : ''}`}>
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                      currentStep > step.id
                        ? 'bg-green-500 text-white'
                        : currentStep === step.id
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {currentStep > step.id ? <Check className="w-5 h-5" /> : step.id}
                  </div>
                  <span className="text-xs mt-2 font-medium text-gray-600">{step.title}</span>
                </div>
                {index < steps.length - 1 && (
                  <div className={`w-full h-1 mx-2 ${currentStep > step.id ? 'bg-green-500' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Form Content */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {renderStepContent()}
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-6">
          <button
            onClick={handleBack}
            disabled={currentStep === 1}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium ${
              currentStep === 1
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>

          {currentStep < 4 ? (
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-3 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600"
            >
              Continue
              <ArrowRight className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="flex items-center gap-2 px-6 py-3 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600"
            >
              <Check className="w-5 h-5" />
              Submit Application
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
