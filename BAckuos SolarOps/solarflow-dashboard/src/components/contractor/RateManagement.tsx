// SolarFlow - Admin Service Rate Management Component
import React, { useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  DollarSign,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ServiceRate } from '../../types/contractor';

interface RateManagementProps {
  rates: ServiceRate[];
  onSaveRates: (rates: ServiceRate[]) => void;
}

export const RateManagement: React.FC<RateManagementProps> = ({ rates, onSaveRates }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const [editForm, setEditForm] = useState<Partial<ServiceRate>>({});
  const [addForm, setAddForm] = useState({
    serviceCode: '',
    serviceName: '',
    unit: 'hour' as const,
    rate: 0,
    description: '',
    estimatedHours: 1,
    laborCost: 0,
    partsCost: 0,
    clientRateStandard: 0,
    clientRateRecurring: 0,
    isPowercareEligible: false,
    powercareLaborCost: 0,
    powercareClientRate: 0,
  });

  const handleEdit = (rate: ServiceRate) => {
    setEditingId(rate.id);
    setEditForm({ ...rate });
  };

  const handleSaveEdit = () => {
    if (!editingId || !editForm.serviceName || (!editForm.rate && !editForm.clientRateStandard)) return;

    const updated = rates.map((r) =>
      r.id === editingId ? { ...r, ...editForm } : r
    );
    onSaveRates(updated);
    setEditingId(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleAdd = () => {
    if (!addForm.serviceCode || !addForm.serviceName) return;

    const newRate: ServiceRate = {
      id: `sr-${Date.now()}`,
      serviceCode: addForm.serviceCode,
      serviceName: addForm.serviceName,
      unit: addForm.unit,
      rate: addForm.rate,
      description: addForm.description,
      estimatedHours: addForm.estimatedHours,
      laborCost: addForm.laborCost,
      partsCost: addForm.partsCost,
      clientRateStandard: addForm.clientRateStandard,
      clientRateRecurring: addForm.clientRateRecurring,
      isPowercareEligible: addForm.isPowercareEligible,
      powercareLaborCost: addForm.powercareLaborCost,
      powercareClientRate: addForm.powercareClientRate,
      active: true,
    };

    onSaveRates([...rates, newRate]);
    setAddForm({
      serviceCode: '',
      serviceName: '',
      unit: 'hour',
      rate: 0,
      description: '',
      estimatedHours: 1,
      laborCost: 0,
      partsCost: 0,
      clientRateStandard: 0,
      clientRateRecurring: 0,
      isPowercareEligible: false,
      powercareLaborCost: 0,
      powercareClientRate: 0,
    });
    setShowAddForm(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleDelete = (id: string) => {
    const updated = rates.filter((r) => r.id !== id);
    onSaveRates(updated);
  };

  const handleToggleActive = (id: string) => {
    const updated = rates.map((r) =>
      r.id === id ? { ...r, active: !r.active } : r
    );
    onSaveRates(updated);
  };

  const formatCurrency = (value: number | undefined) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0);
  };

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Service Rate Tabulator</h1>
          <p className="text-slate-500 mt-1">Manage contractor pay rates by service type</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-1 text-sm text-green-600">
              <Check className="w-4 h-4" /> Saved
            </span>
          )}
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>Add Service</span>
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Total Services</p>
          <p className="text-2xl font-bold text-slate-900">{rates.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Active Rates</p>
          <p className="text-2xl font-bold text-green-600">{rates.filter((r) => r.active).length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Avg Client Rate</p>
          <p className="text-2xl font-bold text-blue-600">
            ${Math.round(rates.reduce((sum, r) => sum + (r.clientRateStandard || r.rate || 0), 0) / rates.length || 0)}
          </p>
        </div>
      </div>

      {/* Rates Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-2 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider w-8">
                </th>
                <th className="text-left px-2 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Code
                </th>
                <th className="text-left px-2 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Service Name
                </th>
                <th className="text-center px-2 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Unit
                </th>
                <th className="text-center px-2 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Est Hrs
                </th>
                <th className="text-right px-2 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Labor $
                </th>
                <th className="text-right px-2 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Parts $
                </th>
                <th className="text-right px-2 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Client $
                </th>
                <th className="text-center px-2 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Powercare
                </th>
                <th className="text-center px-2 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-right px-2 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rates.map((rate) => (
                <React.Fragment key={rate.id}>
                  <tr className={`hover:bg-slate-50 ${!rate.active ? 'opacity-50' : ''} ${expandedRow === rate.id ? 'bg-orange-50' : ''}`}>
                    {editingId === rate.id ? (
                      <>
                        <td className="px-2 py-2"></td>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={editForm.serviceCode || ''}
                            onChange={(e) => setEditForm({ ...editForm, serviceCode: e.target.value })}
                            className="w-20 px-2 py-1 text-xs border border-slate-200 rounded"
                            placeholder="CODE"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={editForm.serviceName || ''}
                            onChange={(e) => setEditForm({ ...editForm, serviceName: e.target.value })}
                            className="w-full px-2 py-1 text-xs border border-slate-200 rounded"
                            placeholder="Service name"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <select
                            value={editForm.unit || 'hour'}
                            onChange={(e) => setEditForm({ ...editForm, unit: e.target.value as any })}
                            className="px-1 py-1 text-xs border border-slate-200 rounded w-full"
                          >
                            <option value="hour">Hour</option>
                            <option value="flat">Flat</option>
                            <option value="panel">Panel</option>
                            <option value="kw">kW</option>
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            step="0.5"
                            value={editForm.estimatedHours || 0}
                            onChange={(e) => setEditForm({ ...editForm, estimatedHours: parseFloat(e.target.value) })}
                            className="w-12 px-2 py-1 text-xs border border-slate-200 rounded text-center"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            value={editForm.laborCost || 0}
                            onChange={(e) => setEditForm({ ...editForm, laborCost: parseFloat(e.target.value) })}
                            className="w-16 px-2 py-1 text-xs border border-slate-200 rounded text-right"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            value={editForm.partsCost || 0}
                            onChange={(e) => setEditForm({ ...editForm, partsCost: parseFloat(e.target.value) })}
                            className="w-16 px-2 py-1 text-xs border border-slate-200 rounded text-right"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            value={editForm.clientRateStandard || 0}
                            onChange={(e) => setEditForm({ ...editForm, clientRateStandard: parseFloat(e.target.value) })}
                            className="w-16 px-2 py-1 text-xs border border-slate-200 rounded text-right"
                          />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={editForm.isPowercareEligible || false}
                            onChange={(e) => setEditForm({ ...editForm, isPowercareEligible: e.target.checked })}
                            className="w-4 h-4 rounded border-slate-300"
                          />
                        </td>
                        <td className="px-2 py-2"></td>
                        <td className="px-2 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={handleSaveEdit}
                              className="p-1 text-green-600 hover:bg-green-50 rounded"
                            >
                              <Save className="w-4 h-4" />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-2 py-3">
                          <button
                            onClick={() => setExpandedRow(expandedRow === rate.id ? null : rate.id)}
                            className="p-1 hover:bg-slate-100 rounded"
                          >
                            {expandedRow === rate.id ? (
                              <ChevronUp className="w-4 h-4 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-400" />
                            )}
                          </button>
                        </td>
                        <td className="px-2 py-3">
                          <span className="text-xs font-mono text-slate-600">{rate.serviceCode}</span>
                        </td>
                        <td className="px-2 py-3">
                          <div>
                            <p className="text-sm font-medium text-slate-900">{rate.serviceName}</p>
                          </div>
                        </td>
                        <td className="px-2 py-3 text-center">
                          <span className="text-xs text-slate-600 capitalize">{rate.unit || 'hour'}</span>
                        </td>
                        <td className="px-2 py-3 text-center">
                          <span className="text-xs text-slate-600">{rate.estimatedHours || '-'}</span>
                        </td>
                        <td className="px-2 py-3 text-right">
                          <span className="text-xs font-medium text-slate-900">
                            ${(rate.laborCost || 0).toLocaleString()}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-right">
                          <span className="text-xs text-slate-600">
                            ${(rate.partsCost || 0).toLocaleString()}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-right">
                          <span className="text-xs font-semibold text-slate-900">
                            ${(rate.clientRateStandard || 0).toLocaleString()}
                          </span>
                          {rate.clientRateRecurring && rate.clientRateRecurring !== rate.clientRateStandard && (
                            <span className="text-xs text-green-600 block">
                              Rec: ${rate.clientRateRecurring}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-3 text-center">
                          {rate.isPowercareEligible ? (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                              ${rate.powercareClientRate || 0}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-2 py-3 text-center">
                          <button
                            onClick={() => handleToggleActive(rate.id)}
                            className={`text-xs px-2 py-1 rounded-full ${
                              rate.active
                                ? 'bg-green-100 text-green-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {rate.active ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="px-2 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleEdit(rate)}
                              className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(rate.id)}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                  {/* Expanded Row Details */}
                  {expandedRow === rate.id && !editingId && (
                    <tr className="bg-orange-50">
                      <td colSpan={11} className="px-4 py-4">
                        <div className="grid grid-cols-4 gap-6">
                          <div>
                            <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Description</h4>
                            <p className="text-sm text-slate-700">{rate.description || 'No description'}</p>
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Cost Breakdown</h4>
                            <div className="space-y-1 text-sm">
                              <div className="flex justify-between">
                                <span className="text-slate-500">Labor Cost:</span>
                                <span className="font-medium">${(rate.laborCost || 0).toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-500">Parts Cost:</span>
                                <span className="font-medium">${(rate.partsCost || 0).toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between border-t pt-1">
                                <span className="text-slate-500">Total Cost:</span>
                                <span className="font-semibold">${((rate.laborCost || 0) + (rate.partsCost || 0)).toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Client Pricing</h4>
                            <div className="space-y-1 text-sm">
                              <div className="flex justify-between">
                                <span className="text-slate-500">Standard:</span>
                                <span className="font-medium">${(rate.clientRateStandard || 0).toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-500">Recurring:</span>
                                <span className="font-medium text-green-600">${(rate.clientRateRecurring || 0).toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Powercare (Manufacturer)</h4>
                            <div className="space-y-1 text-sm">
                              <div className="flex justify-between">
                                <span className="text-slate-500">Eligible:</span>
                                <span className={`font-medium ${rate.isPowercareEligible ? 'text-green-600' : 'text-slate-400'}`}>
                                  {rate.isPowercareEligible ? 'Yes' : 'No'}
                                </span>
                              </div>
                              {rate.isPowercareEligible && (
                                <>
                                  <div className="flex justify-between">
                                    <span className="text-slate-500">Labor Cost:</span>
                                    <span className="font-medium">${(rate.powercareLaborCost || 0).toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-500">Client Rate:</span>
                                    <span className="font-medium">${(rate.powercareClientRate || 0).toLocaleString()}</span>
                                  </div>
                                </>
                              )}
                              {rate.seCompensation ? (
                                <div className="flex justify-between border-t pt-1">
                                  <span className="text-slate-500">SE Comp:</span>
                                  <span className="font-medium text-blue-600">${rate.seCompensation.toLocaleString()}</span>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {rates.length === 0 && (
          <div className="p-8 text-center text-slate-500">
            <DollarSign className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p>No service rates configured</p>
            <button
              onClick={() => setShowAddForm(true)}
              className="mt-2 text-orange-500 hover:underline"
            >
              Add your first service rate
            </button>
          </div>
        )}
      </div>

      {/* Add Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add Service Rate</h2>
              <button onClick={() => setShowAddForm(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Service Code</label>
                  <input
                    type="text"
                    value={addForm.serviceCode}
                    onChange={(e) => setAddForm({ ...addForm, serviceCode: e.target.value.toUpperCase() })}
                    placeholder="PV-MAINT"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Unit</label>
                  <select
                    value={addForm.unit}
                    onChange={(e) => setAddForm({ ...addForm, unit: e.target.value as any })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="hour">Hour</option>
                    <option value="flat">Flat Rate</option>
                    <option value="panel">Per Panel</option>
                    <option value="kw">Per kW</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Est. Hours</label>
                  <input
                    type="number"
                    step="0.5"
                    value={addForm.estimatedHours}
                    onChange={(e) => setAddForm({ ...addForm, estimatedHours: parseFloat(e.target.value) || 0 })}
                    placeholder="1"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Service Name</label>
                <input
                  type="text"
                  value={addForm.serviceName}
                  onChange={(e) => setAddForm({ ...addForm, serviceName: e.target.value })}
                  placeholder="PV System Maintenance"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Labor Cost ($)</label>
                  <input
                    type="number"
                    value={addForm.laborCost || ''}
                    onChange={(e) => setAddForm({ ...addForm, laborCost: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Parts Cost ($)</label>
                  <input
                    type="number"
                    value={addForm.partsCost || ''}
                    onChange={(e) => setAddForm({ ...addForm, partsCost: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Client Rate - Standard ($)</label>
                  <input
                    type="number"
                    value={addForm.clientRateStandard || ''}
                    onChange={(e) => setAddForm({ ...addForm, clientRateStandard: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Client Rate - Recurring ($)</label>
                  <input
                    type="number"
                    value={addForm.clientRateRecurring || ''}
                    onChange={(e) => setAddForm({ ...addForm, clientRateRecurring: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="checkbox"
                    id="powercareEligible"
                    checked={addForm.isPowercareEligible}
                    onChange={(e) => setAddForm({ ...addForm, isPowercareEligible: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                  />
                  <label htmlFor="powercareEligible" className="text-sm font-medium text-slate-700">
                    Powercare Eligible (Manufacturer Warranty)
                  </label>
                </div>

                {addForm.isPowercareEligible && (
                  <div className="grid grid-cols-2 gap-3 pl-6">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Powercare Labor Cost ($)</label>
                      <input
                        type="number"
                        value={addForm.powercareLaborCost || ''}
                        onChange={(e) => setAddForm({ ...addForm, powercareLaborCost: parseFloat(e.target.value) || 0 })}
                        placeholder="0"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Powercare Client Rate ($)</label>
                      <input
                        type="number"
                        value={addForm.powercareClientRate || ''}
                        onChange={(e) => setAddForm({ ...addForm, powercareClientRate: parseFloat(e.target.value) || 0 })}
                        placeholder="0"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Description (Optional)</label>
                <textarea
                  value={addForm.description}
                  onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                  placeholder="Brief description..."
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 flex gap-3">
              <button
                onClick={() => setShowAddForm(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-lg font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                className="flex-1 py-2.5 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600"
              >
                Add Service
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
