import React, { useState, useEffect } from 'react';
import { AlertCircle, Clock, CheckCircle, AlertTriangle, Activity, Zap, Thermometer, Gauge, Battery } from 'lucide-react';
import { AlertSeverity, AlertType, UserRole } from '../types';

interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  occurredAt: string;
  message: string;
  customerId?: string;
  jobId?: string;
  acknowledged?: boolean;
}

interface OperationsProps {
  alerts?: Alert[];
  currentUserId?: string;
  currentUserRole?: UserRole;
}

const Operations: React.FC<OperationsProps> = ({ alerts = [] }) => {
  const [filteredAlerts, setFilteredAlerts] = useState<Alert[]>(alerts);
  const [activeFilter, setActiveFilter] = useState<'all' | AlertSeverity>('all');
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);

  useEffect(() => {
    if (activeFilter === 'all') {
      setFilteredAlerts(alerts);
    } else {
      setFilteredAlerts(alerts.filter(alert => alert.severity === activeFilter));
    }
  }, [activeFilter, alerts]);

  const getSeverityColor = (severity: AlertSeverity) => {
    switch (severity) {
      case 'info':
        return 'text-blue-600';
      case 'warning':
        return 'text-yellow-600';
      case 'critical':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getSeverityIcon = (severity: AlertSeverity) => {
    switch (severity) {
      case 'info':
        return <AlertCircle size={16} className="text-blue-600" />;
      case 'warning':
        return <AlertTriangle size={16} className="text-yellow-600" />;
      case 'critical':
        return <AlertCircle size={16} className="text-red-600" />;
      default:
        return <Activity size={16} className="text-gray-600" />;
    }
  };

  const getAlertTypeIcon = (type: AlertType) => {
    switch (type) {
      case 'inverter_offline':
        return <Activity size={16} className="text-blue-600" />;
      case 'inverter_error':
        return <AlertCircle size={16} className="text-red-600" />;
      case 'production_drop':
        return <Zap size={16} className="text-yellow-600" />;
      case 'panel_malfunction':
        return <Thermometer size={16} className="text-red-600" />;
      case 'optimizer_issue':
        return <Gauge size={16} className="text-blue-600" />;
      case 'communication_loss':
        return <Activity size={16} className="text-gray-600" />;
      case 'maintenance_due':
        return <Battery size={16} className="text-green-600" />;
      default:
        return <Activity size={16} className="text-gray-600" />;
    }
  };

  const getAlertTypeLabel = (type: AlertType) => {
    switch (type) {
      case 'inverter_offline':
        return 'Inverter Offline';
      case 'inverter_error':
        return 'Inverter Error';
      case 'production_drop':
        return 'Production Drop';
      case 'panel_malfunction':
        return 'Panel Malfunction';
      case 'optimizer_issue':
        return 'Optimizer Issue';
      case 'communication_loss':
        return 'Communication Loss';
      case 'maintenance_due':
        return 'Maintenance Due';
      default:
        return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  };

  const toggleAlertDetails = (id: string) => {
    setExpandedAlertId(expandedAlertId === id ? null : id);
  };

  const getAcknowledgedStatus = (acknowledged: boolean | undefined) => {
    if (acknowledged === undefined) return null;
    return acknowledged ? (
      <span className="flex items-center gap-1 text-xs text-green-600">
        <CheckCircle size={12} /> Acknowledged
      </span>
    ) : (
      <span className="flex items-center gap-1 text-xs text-red-600">
        <AlertCircle size={12} /> Pending
      </span>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-800">Operations</h2>
        <div className="flex space-x-2">
          <button
            className={`px-3 py-1 text-sm rounded-md ${
              activeFilter === 'all' 
                ? 'bg-blue-100 text-blue-700 font-medium' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            onClick={() => setActiveFilter('all')}
          >
            All
          </button>
          <button
            className={`px-3 py-1 text-sm rounded-md ${
              activeFilter === 'warning' 
                ? 'bg-yellow-100 text-yellow-700 font-medium' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            onClick={() => setActiveFilter('warning')}
          >
            Warnings
          </button>
          <button
            className={`px-3 py-1 text-sm rounded-md ${
              activeFilter === 'critical' 
                ? 'bg-red-100 text-red-700 font-medium' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            onClick={() => setActiveFilter('critical')}
          >
            Critical
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {filteredAlerts.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <CheckCircle size={48} className="mx-auto text-green-500 mb-2" />
            <p>No alerts at this time</p>
          </div>
        ) : (
          filteredAlerts.map((alert) => (
            <div 
              key={alert.id} 
              className={`p-4 rounded-lg border-l-4 ${
                alert.severity === 'critical' 
                  ? 'border-red-500 bg-red-50' 
                  : alert.severity === 'warning' 
                    ? 'border-yellow-500 bg-yellow-50' 
                    : 'border-blue-500 bg-blue-50'
              }`}
            >
              <div className="flex items-start">
                <div className="flex-shrink-0 mt-0.5">
                  {getSeverityIcon(alert.severity)}
                </div>
                <div className="ml-3 flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getAlertTypeIcon(alert.type)}
                      <h3 className="font-medium text-gray-900 ml-1">
                        {getAlertTypeLabel(alert.type)}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      {getAcknowledgedStatus(alert.acknowledged)}
                      <span className="text-xs text-gray-500">
                        {new Date(alert.occurredAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-gray-700">
                    {alert.message}
                  </p>
                  <div className="mt-2 flex items-center text-xs text-gray-500">
                    <Clock size={12} className="mr-1" />
                    <span>
                      {new Date(alert.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
              
              {expandedAlertId === alert.id && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-500">Alert ID</p>
                      <p className="font-mono">{alert.id}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Type</p>
                      <p>{getAlertTypeLabel(alert.type)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Severity</p>
                      <p className={getSeverityColor(alert.severity)}>{alert.severity}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Status</p>
                      <p>{alert.acknowledged ? 'Acknowledged' : 'Pending'}</p>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="mt-2 flex justify-end">
                <button 
                  onClick={() => toggleAlertDetails(alert.id)}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  {expandedAlertId === alert.id ? 'Hide Details' : 'Show Details'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Operations;
