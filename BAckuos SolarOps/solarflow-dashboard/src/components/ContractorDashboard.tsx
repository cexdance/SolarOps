import { useState } from 'react';
import {
  MapPin,
  Clock,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
  Navigation,
  Phone,
  Calendar,
  DollarSign,
  Filter,
  List,
  Map,
  ChevronDown
} from 'lucide-react';
import { ContractorJob } from '../types/contractor';
import { mockContractorJobs } from '../lib/contractorData';

const urgencyColors = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-blue-100 text-blue-700 border-blue-200',
};

const statusColors = {
  assigned: 'bg-gray-100 text-gray-700',
  en_route: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
};

export default function ContractorDashboard() {
  const [jobs] = useState<ContractorJob[]>(mockContractorJobs);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [filter, setFilter] = useState<'all' | 'today' | 'upcoming'>('all');
  const [selectedJob, setSelectedJob] = useState<ContractorJob | null>(null);

  const filteredJobs = jobs.filter(job => {
    if (filter === 'today') {
      return job.scheduledDate === '2026-03-01';
    }
    if (filter === 'upcoming') {
      return job.scheduledDate > '2026-03-01';
    }
    return true;
  }).sort((a, b) => {
    // Sort by urgency first
    const urgencyOrder = { high: 0, medium: 1, low: 2 };
    if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    }
    // Then by date
    return new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime();
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-slate-900 text-white px-4 py-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
              <span className="font-bold text-lg">C</span>
            </div>
            <div>
              <h1 className="font-bold">Mike Thompson</h1>
              <p className="text-xs text-slate-400">Elite Solar Solutions</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="p-2 hover:bg-slate-800 rounded-lg">
              <AlertTriangle className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center">
              <span className="text-sm">MT</span>
            </div>
          </div>
        </div>
      </header>

      {/* Stats Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{filteredJobs.length}</p>
              <p className="text-xs text-gray-500">Jobs</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">
                {filteredJobs.filter(j => j.urgency === 'high').length}
              </p>
              <p className="text-xs text-gray-500">Urgent</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(filteredJobs.reduce((sum, j) => sum + j.totalAmount, 0))}
              </p>
              <p className="text-xs text-gray-500">Potential</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg ${viewMode === 'list' ? 'bg-orange-100 text-orange-600' : 'text-gray-400'}`}
            >
              <List className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`p-2 rounded-lg ${viewMode === 'map' ? 'bg-orange-100 text-orange-600' : 'text-gray-400'}`}
            >
              <Map className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="bg-white border-b border-gray-200 px-4 py-2">
        <div className="max-w-4xl mx-auto flex gap-2">
          {(['all', 'today', 'upcoming'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-full text-sm font-medium capitalize ${
                filter === f
                  ? 'bg-slate-900 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        {viewMode === 'list' ? (
          <div className="space-y-3">
            {filteredJobs.map((job) => (
              <div
                key={job.id}
                onClick={() => setSelectedJob(job)}
                className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-gray-900">{job.id}</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${urgencyColors[job.urgency]}`}>
                      {job.urgency} priority
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[job.status]}`}>
                      {job.status.replace('_', ' ')}
                    </span>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400" />
                </div>

                {/* Customer & Address */}
                <div className="mb-3">
                  <h3 className="font-semibold text-gray-900">{job.customerName}</h3>
                  <div className="flex items-center gap-1 text-gray-500 text-sm">
                    <MapPin className="w-4 h-4" />
                    {job.address}
                  </div>
                </div>

                {/* Details */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1 text-gray-600">
                      <Calendar className="w-4 h-4" />
                      <span className="text-sm">{formatDate(job.scheduledDate)}</span>
                    </div>
                    <div className="flex items-center gap-1 text-gray-600">
                      <Clock className="w-4 h-4" />
                      <span className="text-sm">{job.scheduledTime}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">{job.serviceType}</span>
                    <span className="font-bold text-orange-600">{formatCurrency(job.totalAmount)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden" style={{ height: '60vh' }}>
            {/* Map Placeholder */}
            <div className="w-full h-full bg-gray-100 flex items-center justify-center">
              <div className="text-center">
                <MapPin className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 font-medium">Map View</p>
                <p className="text-sm text-gray-400">Google Maps integration ready</p>
                <p className="text-xs text-gray-400 mt-2">{filteredJobs.length} job locations</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Job Detail Sheet */}
      {selectedJob && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-white rounded-t-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
              <h2 className="font-bold text-lg">{selectedJob.id}</h2>
              <button
                onClick={() => setSelectedJob(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Status */}
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${urgencyColors[selectedJob.urgency]}`}>
                  {selectedJob.urgency} priority
                </span>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[selectedJob.status]}`}>
                  {selectedJob.status.replace('_', ' ')}
                </span>
              </div>

              {/* Customer */}
              <div>
                <h3 className="font-bold text-xl text-gray-900">{selectedJob.customerName}</h3>
                <div className="flex items-center gap-2 text-gray-600 mt-1">
                  <MapPin className="w-4 h-4" />
                  <span>{selectedJob.address}</span>
                </div>
              </div>

              {/* Schedule */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Date</p>
                    <p className="font-semibold">{formatDate(selectedJob.scheduledDate)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Time</p>
                    <p className="font-semibold">{selectedJob.scheduledTime}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Service Type</p>
                    <p className="font-semibold">{selectedJob.serviceType}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Amount</p>
                    <p className="font-semibold text-orange-600">{formatCurrency(selectedJob.totalAmount)}</p>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <p className="text-sm text-gray-500 mb-1">Description</p>
                <p className="text-gray-700">{selectedJob.description}</p>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-3 pt-4">
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(selectedJob.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600"
                >
                  <Navigation className="w-5 h-5" />
                  Navigate
                </a>
                <button className="flex items-center justify-center gap-2 px-4 py-3 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600">
                  <Phone className="w-5 h-5" />
                  Call
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2">
        <div className="max-w-4xl mx-auto flex items-center justify-around">
          <button className="flex flex-col items-center gap-1 text-orange-600">
            <List className="w-6 h-6" />
            <span className="text-xs font-medium">Jobs</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-gray-400">
            <MapPin className="w-6 h-6" />
            <span className="text-xs">Map</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-gray-400">
            <Calendar className="w-6 h-6" />
            <span className="text-xs">Schedule</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-gray-400">
            <DollarSign className="w-6 h-6" />
            <span className="text-xs">Earnings</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
