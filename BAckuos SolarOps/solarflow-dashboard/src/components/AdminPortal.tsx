import { useState } from 'react';
import {
  Users,
  DollarSign,
  Settings,
  Search,
  Filter,
  MoreVertical,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
  Edit,
  Trash2,
  Plus,
  ChevronDown,
  ArrowUpDown,
  Building2,
  Mail,
  Phone,
  Calendar,
  Shield,
  Download,
  Eye,
  X,
  Briefcase,
  Award,
  Clock,
  MapPin
} from 'lucide-react';
import { Contractor, ServiceRate, ContractorStatus, BusinessType } from '../types/contractor';
import { mockContractors, mockServiceRates } from '../lib/contractorData';

const statusConfig = {
  pending: { color: 'bg-amber-100 text-amber-700', icon: AlertTriangle, label: 'Pending' },
  active: { color: 'bg-green-100 text-green-700', icon: CheckCircle, label: 'Active' },
  suspended: { color: 'bg-red-100 text-red-700', icon: XCircle, label: 'Suspended' },
  rejected: { color: 'bg-gray-100 text-gray-700', icon: XCircle, label: 'Rejected' },
};

export default function AdminPortal() {
  const [contractors, setContractors] = useState<Contractor[]>(mockContractors);
  const [serviceRates, setServiceRates] = useState<ServiceRate[]>(mockServiceRates);
  const [activeTab, setActiveTab] = useState<'contractors' | 'rates'>('contractors');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingRate, setEditingRate] = useState<string | null>(null);
  const [newRate, setNewRate] = useState({ rate: '' });

  // Add Contractor Modal State
  const [showAddContractor, setShowAddContractor] = useState(false);
  const [addContractorStep, setAddContractorStep] = useState(1);
  const [newContractor, setNewContractor] = useState({
    email: '',
    password: '',
    businessName: '',
    businessType: 'llc' as BusinessType,
    ein: '',
    streetAddress: '',
    city: '',
    state: '',
    zip: '',
    insuranceProvider: '',
    policyNumber: '',
    coiExpiryDate: '',
    generalLiabilityLimit: 1000000,
    workersCompPolicy: '',
    contactName: '',
    contactPhone: '',
    skills: [] as string[],
    notes: '',
    agreedToSafety: false,
  });
  const [newSkill, setNewSkill] = useState('');

  const filteredContractors = contractors.filter(c =>
    c.businessName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleApproveContractor = (id: string) => {
    setContractors(prev => prev.map(c =>
      c.id === id ? { ...c, status: 'approved' as const } : c
    ));
  };

  const handleRejectContractor = (id: string) => {
    setContractors(prev => prev.map(c =>
      c.id === id ? { ...c, status: 'rejected' as const } : c
    ));
  };

  const handleUpdateRate = (id: string, value: number) => {
    setServiceRates(prev => prev.map(r =>
      r.id === id ? { ...r, rate: value } : r
    ));
  };

  const handleAddContractor = () => {
    const contractor: Contractor = {
      id: `contractor-${Date.now()}`,
      email: newContractor.email,
      password: newContractor.password,
      role: 'contractor',
      status: 'approved' as ContractorStatus,
      createdAt: new Date().toISOString(),
      businessName: newContractor.businessName,
      businessType: newContractor.businessType,
      ein: newContractor.ein,
      streetAddress: newContractor.streetAddress,
      city: newContractor.city,
      state: newContractor.state,
      zip: newContractor.zip,
      insuranceProvider: newContractor.insuranceProvider,
      policyNumber: newContractor.policyNumber,
      coiDocument: '',
      coiExpiryDate: newContractor.coiExpiryDate,
      generalLiabilityLimit: newContractor.generalLiabilityLimit,
      workersCompPolicy: newContractor.workersCompPolicy,
      agreedToSafety: newContractor.agreedToSafety,
      safetyAgreedDate: new Date().toISOString(),
      contactName: newContractor.contactName,
      contactPhone: newContractor.contactPhone,
      skills: newContractor.skills,
      notes: newContractor.notes,
    };
    setContractors([...contractors, contractor]);
    setShowAddContractor(false);
    setAddContractorStep(1);
    setNewContractor({
      email: '',
      password: '',
      businessName: '',
      businessType: 'llc',
      ein: '',
      streetAddress: '',
      city: '',
      state: '',
      zip: '',
      insuranceProvider: '',
      policyNumber: '',
      coiExpiryDate: '',
      generalLiabilityLimit: 1000000,
      workersCompPolicy: '',
      contactName: '',
      contactPhone: '',
      skills: [],
      notes: '',
      agreedToSafety: false,
    });
  };

  const addSkill = () => {
    if (newSkill && !newContractor.skills.includes(newSkill)) {
      setNewContractor({ ...newContractor, skills: [...newContractor.skills, newSkill] });
      setNewSkill('');
    }
  };

  const removeSkill = (skill: string) => {
    setNewContractor({ ...newContractor, skills: newContractor.skills.filter(s => s !== skill) });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-slate-900 text-white">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
              <span className="font-bold text-lg">S</span>
            </div>
            <div>
              <h1 className="font-bold">SolarFlow</h1>
              <p className="text-xs text-slate-400">Admin Portal</p>
            </div>
          </div>

          <nav className="space-y-2">
            <button
              onClick={() => setActiveTab('contractors')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg ${
                activeTab === 'contractors' ? 'bg-orange-500 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Users className="w-5 h-5" />
              Contractors
            </button>
            <button
              onClick={() => setActiveTab('rates')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg ${
                activeTab === 'rates' ? 'bg-orange-500 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <DollarSign className="w-5 h-5" />
              Service Rates
            </button>
          </nav>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center">
              <span className="text-sm">AD</span>
            </div>
            <div>
              <p className="font-medium">Admin User</p>
              <p className="text-xs text-slate-400">admin@conexsol.com</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml8">
        {/*-64 p- Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {activeTab === 'contractors' ? 'Contractor Management' : 'Service Rates'}
            </h1>
            <p className="text-gray-500 mt-1">
              {activeTab === 'contractors'
                ? 'Manage contractor applications and approvals'
                : 'Configure payment rates for contractor services'}
            </p>
          </div>
          {activeTab === 'rates' && (
            <button className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600">
              <Plus className="w-5 h-5" />
              Add Service
            </button>
          )}
          {activeTab === 'contractors' && (
            <button
              onClick={() => setShowAddContractor(true)}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600"
            >
              <Plus className="w-5 h-5" />
              Add Contractor
            </button>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Contractors</p>
                <p className="text-2xl font-bold text-gray-900">{contractors.length}</p>
              </div>
              <Users className="w-8 h-8 text-blue-500" />
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Active</p>
                <p className="text-2xl font-bold text-green-600">
                  {contractors.filter(c => c.status === 'approved').length}
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pending Review</p>
                <p className="text-2xl font-bold text-amber-600">
                  {contractors.filter(c => c.status === 'pending').length}
                </p>
              </div>
              <AlertTriangle className="w-8 h-8 text-amber-500" />
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Services</p>
                <p className="text-2xl font-bold text-gray-900">{serviceRates.length}</p>
              </div>
              <DollarSign className="w-8 h-8 text-purple-500" />
            </div>
          </div>
        </div>

        {/* Contractors Table */}
        {activeTab === 'contractors' && (
          <div className="bg-white rounded-xl border border-gray-200">
            {/* Search Bar */}
            <div className="p-4 border-b border-gray-200">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search contractors..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Contractor</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Business Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Insurance Expiry</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Applied</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredContractors.map((contractor) => {
                    const statusKey = contractor.status === 'approved' ? 'active' : contractor.status;
                    const config = statusConfig[statusKey] || statusConfig.pending;
                    const StatusIcon = config.icon;
                    return (
                      <tr key={contractor.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4">
                          <div>
                            <p className="font-semibold text-gray-900">{contractor.businessName}</p>
                            <p className="text-sm text-gray-500">{contractor.email}</p>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-gray-600 capitalize">
                          {contractor.businessType.replace('_', ' ')}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
                            <StatusIcon className="w-3 h-3" />
                            {contractor.status}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-gray-600">
                          {contractor.coiExpiryDate}
                        </td>
                        <td className="px-4 py-4 text-gray-600">
                          {contractor.createdAt}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                              <Eye className="w-4 h-4" />
                            </button>
                            {contractor.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleApproveContractor(contractor.id)}
                                  className="p-2 text-green-500 hover:text-green-700 hover:bg-green-50 rounded-lg"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleRejectContractor(contractor.id)}
                                  className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Service Rates Table */}
        {activeTab === 'rates' && (
          <div className="bg-white rounded-xl border border-gray-200">
            {/* Header */}
            <div className="p-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Contractor Pay Rates</h2>
              <p className="text-sm text-gray-500">Rates paid to contractors for each service type</p>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Service Code</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Service Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Unit</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Rate</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {serviceRates.map((rate) => (
                    <tr key={rate.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <p className="font-semibold text-gray-900">{rate.serviceCode}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-gray-900">{rate.serviceName}</p>
                        <p className="text-sm text-gray-500">{rate.description}</p>
                      </td>
                      <td className="px-4 py-4 text-gray-600 capitalize">
                        {rate.unit || 'hour'}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {editingRate === rate.id ? (
                          <input
                            type="number"
                            value={newRate.rate}
                            onChange={(e) => setNewRate(prev => ({ ...prev, rate: e.target.value }))}
                            onBlur={() => {
                              handleUpdateRate(rate.id, parseFloat(newRate.rate) || 0);
                              setEditingRate(null);
                            }}
                            className="w-24 px-2 py-1 border border-gray-300 rounded text-right"
                            autoFocus
                          />
                        ) : (
                          <button
                            onClick={() => {
                              setEditingRate(rate.id);
                              setNewRate({ rate: (rate.clientRateStandard || rate.rate || 0).toString() });
                            }}
                            className="font-semibold text-gray-900 hover:text-orange-600"
                          >
                            {formatCurrency(rate.clientRateStandard || rate.rate || 0)}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => {
                              setEditingRate(rate.id);
                              setNewRate({ rate: (rate.clientRateStandard || rate.rate || 0).toString() });
                            }}
                            className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Add Contractor Modal */}
      {showAddContractor && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
              <div>
                <h2 className="text-lg font-semibold">Add New Contractor</h2>
                <p className="text-sm text-slate-500">Step {addContractorStep} of 3</p>
              </div>
              <button onClick={() => setShowAddContractor(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step Navigation */}
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
              <div className="flex gap-2">
                {[1, 2, 3].map((step) => (
                  <button
                    key={step}
                    onClick={() => setAddContractorStep(step)}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      addContractorStep === step
                        ? 'bg-orange-500 text-white'
                        : addContractorStep > step
                        ? 'bg-green-500 text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {step === 1 && 'Profile'}
                    {step === 2 && 'Compliance'}
                    {step === 3 && 'Skills'}
                  </button>
                ))}
              </div>
            </div>

            {/* Form Content */}
            <div className="p-4 space-y-4">
              {/* Step 1: Profile */}
              {addContractorStep === 1 && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Briefcase className="w-5 h-5" />
                    Business Information
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Business Name *</label>
                      <input
                        type="text"
                        required
                        value={newContractor.businessName}
                        onChange={(e) => setNewContractor({ ...newContractor, businessName: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="ABC Solar LLC"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Business Type</label>
                      <select
                        value={newContractor.businessType}
                        onChange={(e) => setNewContractor({ ...newContractor, businessType: e.target.value as BusinessType })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        <option value="llc">LLC</option>
                        <option value="c_corp">Corporation</option>
                        <option value="sole_proprietor">Sole Proprietor</option>
                        <option value="partnership">Partnership</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">EIN</label>
                      <input
                        type="text"
                        value={newContractor.ein}
                        onChange={(e) => setNewContractor({ ...newContractor, ein: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="XX-XXXXXXX"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Contact Name *</label>
                      <input
                        type="text"
                        required
                        value={newContractor.contactName}
                        onChange={(e) => setNewContractor({ ...newContractor, contactName: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="John Doe"
                      />
                    </div>
                  </div>

                  <h3 className="font-semibold text-slate-900 flex items-center gap-2 pt-4">
                    <Mail className="w-5 h-5" />
                    Contact Information
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                      <input
                        type="email"
                        required
                        value={newContractor.email}
                        onChange={(e) => setNewContractor({ ...newContractor, email: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="contractor@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Phone *</label>
                      <input
                        type="tel"
                        required
                        value={newContractor.contactPhone}
                        onChange={(e) => setNewContractor({ ...newContractor, contactPhone: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="(555) 123-4567"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Temporary Password *</label>
                      <input
                        type="password"
                        required
                        value={newContractor.password}
                        onChange={(e) => setNewContractor({ ...newContractor, password: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="Temporary password"
                      />
                    </div>
                  </div>

                  <h3 className="font-semibold text-slate-900 flex items-center gap-2 pt-4">
                    <MapPin className="w-5 h-5" />
                    Business Address
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Street Address</label>
                      <input
                        type="text"
                        value={newContractor.streetAddress}
                        onChange={(e) => setNewContractor({ ...newContractor, streetAddress: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="123 Main St"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                      <input
                        type="text"
                        value={newContractor.city}
                        onChange={(e) => setNewContractor({ ...newContractor, city: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="Miami"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                        <input
                          type="text"
                          value={newContractor.state}
                          onChange={(e) => setNewContractor({ ...newContractor, state: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                          placeholder="FL"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">ZIP</label>
                        <input
                          type="text"
                          value={newContractor.zip}
                          onChange={(e) => setNewContractor({ ...newContractor, zip: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                          placeholder="33101"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Compliance */}
              {addContractorStep === 2 && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    Insurance Information
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Insurance Provider</label>
                      <input
                        type="text"
                        value={newContractor.insuranceProvider}
                        onChange={(e) => setNewContractor({ ...newContractor, insuranceProvider: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="ABC Insurance Co"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Policy Number</label>
                      <input
                        type="text"
                        value={newContractor.policyNumber}
                        onChange={(e) => setNewContractor({ ...newContractor, policyNumber: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="POL-123456"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">COI Expiry Date</label>
                      <input
                        type="date"
                        value={newContractor.coiExpiryDate}
                        onChange={(e) => setNewContractor({ ...newContractor, coiExpiryDate: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">General Liability Limit</label>
                      <input
                        type="number"
                        value={newContractor.generalLiabilityLimit}
                        onChange={(e) => setNewContractor({ ...newContractor, generalLiabilityLimit: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="1000000"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Workers Comp Policy</label>
                      <input
                        type="text"
                        value={newContractor.workersCompPolicy}
                        onChange={(e) => setNewContractor({ ...newContractor, workersCompPolicy: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="WC-789012"
                      />
                    </div>
                  </div>

                  <h3 className="font-semibold text-slate-900 flex items-center gap-2 pt-4">
                    <FileText className="w-5 h-5" />
                    Safety Agreement
                  </h3>
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newContractor.agreedToSafety}
                        onChange={(e) => setNewContractor({ ...newContractor, agreedToSafety: e.target.checked })}
                        className="mt-1 w-4 h-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                      />
                      <div>
                        <p className="text-sm font-medium text-slate-900">Safety Protocol Acknowledgment</p>
                        <p className="text-xs text-slate-600 mt-1">
                          I acknowledge that I have read and agree to comply with all safety protocols and requirements
                          for contractors working on behalf of ConexSol Applications LLC.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* Step 3: Skills */}
              {addContractorStep === 3 && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Award className="w-5 h-5" />
                    Skills & Certifications
                  </h3>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Add Skills</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newSkill}
                        onChange={(e) => setNewSkill(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && addSkill()}
                        className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="Type a skill and press Enter"
                      />
                      <button
                        onClick={addSkill}
                        className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
                      >
                        Add
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {newContractor.skills.map((skill) => (
                        <span
                          key={skill}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm"
                        >
                          {skill}
                          <button
                            onClick={() => removeSkill(skill)}
                            className="hover:text-orange-900"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="mt-4">
                      <p className="text-xs text-slate-500 mb-2">Suggested skills:</p>
                      <div className="flex flex-wrap gap-2">
                        {['PV Installation', 'Inverter Repair', 'Battery Storage', 'Roofing', 'Electrical', 'Inspection', 'Maintenance'].map((skill) => (
                          <button
                            key={skill}
                            onClick={() => {
                              if (!newContractor.skills.includes(skill)) {
                                setNewContractor({ ...newContractor, skills: [...newContractor.skills, skill] });
                              }
                            }}
                            className="px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200"
                          >
                            + {skill}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                    <textarea
                      value={newContractor.notes}
                      onChange={(e) => setNewContractor({ ...newContractor, notes: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Additional notes about this contractor..."
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 flex gap-3">
              {addContractorStep > 1 && (
                <button
                  onClick={() => setAddContractorStep(addContractorStep - 1)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-lg font-medium text-slate-600 hover:bg-slate-50"
                >
                  Back
                </button>
              )}
              {addContractorStep < 3 ? (
                <button
                  onClick={() => setAddContractorStep(addContractorStep + 1)}
                  className="flex-1 py-2.5 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={handleAddContractor}
                  disabled={!newContractor.businessName || !newContractor.email || !newContractor.contactName}
                  className="flex-1 py-2.5 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create Contractor
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
