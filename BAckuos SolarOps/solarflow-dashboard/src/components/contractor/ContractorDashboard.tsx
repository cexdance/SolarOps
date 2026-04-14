// SolarFlow - Contractor Dashboard Component
import React, { useState, useRef } from 'react';
import {
  Wrench,
  MapPin,
  Phone,
  Navigation,
  Play,
  CheckCircle,
  Clock,
  User,
  ChevronRight,
  AlertTriangle,
  DollarSign,
  Calendar,
  Filter,
  List,
  Map,
  LogOut,
  GripVertical,
  Zap,
  Target,
  Car,
  ArrowRight,
  Check,
  Cloud,
  CloudRain,
  Sun,
  Wind,
  AlertCircle,
  FileText,
  Camera,
} from 'lucide-react';
import { ContractorJob, JobPriority, JobStatusContractor } from '../../types/contractor';
import JobDetail from './JobDetail';

interface ContractorDashboardProps {
  contractorName: string;
  jobs: ContractorJob[];
  onLogout: () => void;
  onUpdateJob: (job: ContractorJob) => void;
}

const priorityColors: Record<JobPriority, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-amber-100 text-amber-700 border-amber-200',
  normal: 'bg-blue-100 text-blue-700 border-blue-200',
  low: 'bg-slate-100 text-slate-700 border-slate-200',
};

const priorityLabels: Record<JobPriority, string> = {
  critical: 'Critical',
  high: 'High Priority',
  normal: 'Scheduled',
  low: 'Upcoming',
};

export const ContractorDashboard: React.FC<ContractorDashboardProps> = ({
  contractorName,
  jobs,
  onLogout,
  onUpdateJob,
}) => {
  const [viewMode, setViewMode] = useState<'list' | 'map' | 'route' | 'kanban'>('list');
  const [selectedJob, setSelectedJob] = useState<ContractorJob | null>(null);
  const [showJobDetail, setShowJobDetail] = useState(false);
  const [filterPriority, setFilterPriority] = useState<JobPriority | 'all'>('all');
  const [routeOrder, setRouteOrder] = useState<string[]>([]);
  const [isRouteActive, setIsRouteActive] = useState(false);
  const [currentStop, setCurrentStop] = useState<number>(0);
  const [draggedJob, setDraggedJob] = useState<ContractorJob | null>(null);
  const [currentWeather, setCurrentWeather] = useState<string>('sunny');
  const dragOverRef = useRef<number>(-1);

  // Weather options
  const weatherOptions = [
    { id: 'sunny', icon: Sun, label: 'Sunny' },
    { id: 'cloudy', icon: Cloud, label: 'Cloudy' },
    { id: 'rainy', icon: CloudRain, label: 'Rainy' },
    { id: 'windy', icon: Wind, label: 'Windy' },
  ];

  // Handle job selection
  const handleJobClick = (job: ContractorJob) => {
    setSelectedJob(job);
    setShowJobDetail(true);
  };

  // Handle kanban card drop - move job to new status
  const handleKanbanDrop = (newStatus: JobStatusContractor) => {
    if (draggedJob && draggedJob.status !== newStatus) {
      const updatedJob: ContractorJob = {
        ...draggedJob,
        status: newStatus,
      };
      onUpdateJob(updatedJob);
    }
    setDraggedJob(null);
  };

  const handleJobUpdate = (updatedJob: ContractorJob) => {
    onUpdateJob(updatedJob);
    setSelectedJob(updatedJob);
  };

  const handleBackFromDetail = () => {
    setShowJobDetail(false);
    setSelectedJob(null);
  };

  // Initialize route order when jobs change
  React.useEffect(() => {
    if (routeOrder.length === 0 && jobs.length > 0) {
      // Default: sort by priority then scheduled time
      const sorted = [...jobs].sort((a, b) => {
        const priorityOrder: Record<JobPriority, number> = { critical: 0, high: 1, normal: 2, low: 3 };
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        return `${a.scheduledDate}${a.scheduledTime}`.localeCompare(`${b.scheduledDate}${b.scheduledTime}`);
      });
      setRouteOrder(sorted.map(j => j.id));
    }
  }, [jobs, routeOrder.length]);

  // Calculate route order based on jobs in priority order
  const orderedJobs = routeOrder
    .map(id => jobs.find(j => j.id === id))
    .filter((j): j is ContractorJob => j !== undefined)
    .filter((job) => filterPriority === 'all' || job.priority === filterPriority);

  // Optimize route based on location proximity
  const optimizeRoute = () => {
    if (orderedJobs.length <= 2) return;

    // Simple nearest neighbor optimization
    const remaining = [...orderedJobs];
    const optimized: ContractorJob[] = [];

    // Start with critical/high priority jobs first
    const criticalJobs = remaining.filter(j => j.priority === 'critical' || j.priority === 'high');
    const otherJobs = remaining.filter(j => j.priority !== 'critical' && j.priority !== 'high');

    // Add critical jobs in optimal order
    while (criticalJobs.length > 0) {
      if (optimized.length === 0) {
        optimized.push(criticalJobs.shift()!);
      } else {
        const current = optimized[optimized.length - 1];
        let nearestIdx = 0;
        let nearestDist = Infinity;
        criticalJobs.forEach((j, idx) => {
          const dist = Math.sqrt(
            Math.pow(j.latitude - current.latitude, 2) +
            Math.pow(j.longitude - current.longitude, 2)
          );
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestIdx = idx;
          }
        });
        optimized.push(criticalJobs.splice(nearestIdx, 1)[0]);
      }
    }

    // Add remaining jobs
    while (otherJobs.length > 0) {
      const current = optimized[optimized.length - 1];
      let nearestIdx = 0;
      let nearestDist = Infinity;
      otherJobs.forEach((j, idx) => {
        const dist = Math.sqrt(
          Math.pow(j.latitude - current.latitude, 2) +
          Math.pow(j.longitude - current.longitude, 2)
        );
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = idx;
        }
      });
      optimized.push(otherJobs.splice(nearestIdx, 1)[0]);
    }

    setRouteOrder(optimized.map(j => j.id));
  };

  // Drag and drop handlers
  const handleDragStart = (job: ContractorJob) => {
    setDraggedJob(job);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    dragOverRef.current = index;
  };

  const handleDragEnd = () => {
    if (draggedJob && dragOverRef.current >= 0) {
      const newOrder = [...routeOrder];
      const fromIndex = newOrder.indexOf(draggedJob.id);
      const toIndex = dragOverRef.current;

      newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, draggedJob.id);

      setRouteOrder(newOrder);
    }
    setDraggedJob(null);
    dragOverRef.current = -1;
  };

  // Start route navigation
  const startRoute = () => {
    setIsRouteActive(true);
    setCurrentStop(0);
  };

  // Complete current stop and move to next
  const completeStop = () => {
    if (currentStop < orderedJobs.length - 1) {
      setCurrentStop(currentStop + 1);
    } else {
      setIsRouteActive(false);
      setCurrentStop(0);
    }
  };

  // Calculate route stats
  const getRouteStats = () => {
    let totalDistance = 0;
    let estimatedTime = 0;

    for (let i = 0; i < orderedJobs.length; i++) {
      // Mock calculations (in real app, use actual distances)
      totalDistance += Math.random() * 15 + 5; // 5-20 miles between stops
      estimatedTime += orderedJobs[i].estimatedDuration;
    }

    return {
      totalStops: orderedJobs.length,
      totalMiles: Math.round(totalDistance),
      estMinutes: Math.round(estimatedTime + (totalDistance * 2)), // +2 min per mile for travel
    };
  };

  const routeStats = getRouteStats();

  // Sort jobs by priority and date
  const sortedJobs = [...jobs]
    .filter((job) => filterPriority === 'all' || job.priority === filterPriority)
    .sort((a, b) => {
      // Critical first
      const priorityOrder: Record<JobPriority, number> = { critical: 0, high: 1, normal: 2, low: 3 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      // Then by scheduled date/time
      return `${a.scheduledDate}${a.scheduledTime}`.localeCompare(`${b.scheduledDate}${b.scheduledTime}`);
    });

  const totalEarnings = jobs
    .filter((j) => j.status === 'completed')
    .reduce((sum, j) => sum + j.totalPay, 0);

  const todaysJobs = jobs.filter((j) => j.scheduledDate === new Date().toISOString().split('T')[0]);
  const pendingJobs = jobs.filter((j) => j.status === 'assigned' || j.status === 'en_route');

  // Kanban column categorization
  const backlogJobs = jobs.filter((j) => j.status === 'assigned');
  const routeJobs = jobs.filter((j) => j.status === 'en_route' || j.status === 'in_progress' || j.status === 'documentation');
  const holdJobs = jobs.filter((j) => j.status === 'on_hold');
  const completedJobs = jobs.filter((j) => j.status === 'completed');

  // Get weather icon
  const getWeatherIcon = () => {
    const weather = weatherOptions.find(w => w.id === currentWeather);
    const Icon = weather?.icon || Sun;
    return <Icon className="w-4 h-4" />;
  };

  const JobCard: React.FC<{ job: ContractorJob; compact?: boolean }> = ({ job, compact }) => {
    const isSelected = selectedJob?.id === job.id;

    return (
      <div
        onClick={() => setSelectedJob(isSelected ? null : job)}
        className={`
          bg-white rounded-xl border-2 transition-all cursor-pointer
          ${isSelected ? 'border-orange-500 shadow-lg' : 'border-slate-200 hover:border-slate-300'}
        `}
      >
        <div className="p-4">
          {/* Priority Badge */}
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs px-2 py-1 rounded-full border ${priorityColors[job.priority]}`}>
              {priorityLabels[job.priority]}
            </span>
            <span className="text-sm font-bold text-slate-900">${job.totalPay.toFixed(0)}</span>
          </div>

          {/* Customer & Address */}
          <h3 className="font-semibold text-slate-900 mb-1">{job.customerName}</h3>
          <p className="text-sm text-slate-500 flex items-center gap-1 mb-2">
            <MapPin className="w-3 h-3" />
            {job.address}, {job.city}
          </p>

          {/* Service & Time */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600 capitalize">{job.serviceType}</span>
            <span className="text-slate-600 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {job.scheduledTime}
            </span>
          </div>
        </div>

        {/* Expanded Details */}
        {isSelected && (
          <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
            {/* Contact */}
            <div className="flex gap-2">
              <a
                href={`tel:${job.customerPhone}`}
                className="flex-1 flex items-center justify-center gap-1 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium"
              >
                <Phone className="w-4 h-4" />
                Call
              </a>
              <a
                href={`https://maps.google.com/?q=${job.latitude},${job.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1 py-2 bg-green-50 text-green-600 rounded-lg text-sm font-medium"
              >
                <Navigation className="w-4 h-4" />
                Navigate
              </a>
            </div>

            {/* Description */}
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500 mb-1">Work Description</p>
              <p className="text-sm text-slate-700">{job.description}</p>
            </div>

            {/* Schedule Info */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-xs text-slate-500">Scheduled</p>
                <p className="font-medium">{job.scheduledDate}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Duration</p>
                <p className="font-medium">{job.estimatedDuration} min</p>
              </div>
            </div>

            {/* Pay Info */}
            <div className="bg-green-50 rounded-lg p-3">
              <p className="text-xs text-green-600 mb-1">Pay Rate</p>
              <p className="font-semibold text-green-700">
                ${job.payRate}/{job.payUnit} = ${job.totalPay.toFixed(2)}
              </p>
            </div>

            {/* Actions */}
            {job.status === 'assigned' && (
              <button
                onClick={(e) => { e.stopPropagation(); handleJobClick(job); }}
                className="w-full flex items-center justify-center gap-2 py-3 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600"
              >
                <Play className="w-5 h-5" />
                Start Work Order
              </button>
            )}
            {job.status === 'in_progress' && (
              <button
                onClick={(e) => { e.stopPropagation(); handleJobClick(job); }}
                className="w-full flex items-center justify-center gap-2 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700"
              >
                <CheckCircle className="w-5 h-5" />
                Complete Work Order
              </button>
            )}
            {job.status === 'documentation' && (
              <button
                onClick={(e) => { e.stopPropagation(); handleJobClick(job); }}
                className="w-full flex items-center justify-center gap-2 py-3 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600"
              >
                <CheckCircle className="w-5 h-5" />
                Continue Documentation
              </button>
            )}
            {job.status === 'completed' && (
              <button
                onClick={(e) => { e.stopPropagation(); handleJobClick(job); }}
                className="w-full flex items-center justify-center gap-2 py-3 bg-slate-600 text-white font-semibold rounded-lg hover:bg-slate-700"
              >
                <CheckCircle className="w-5 h-5" />
                View Completed Work Order
              </button>
            )}

            {/* View Full Details Button */}
            <button
              onClick={(e) => { e.stopPropagation(); handleJobClick(job); }}
              className="w-full flex items-center justify-center gap-1 py-2 text-sm text-slate-500 hover:text-slate-700"
            >
              View Full Details
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    );
  };

  // Kanban Card Component
  const KanbanCard: React.FC<{ job: ContractorJob; onClick: () => void }> = ({ job, onClick }) => (
    <div
      draggable
      onDragStart={() => setDraggedJob(job)}
      onClick={onClick}
      className="bg-white rounded-lg border border-slate-200 p-3 cursor-pointer hover:shadow-md transition-shadow"
    >
      {/* Priority & Pay */}
      <div className="flex items-center justify-between mb-2">
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${priorityColors[job.priority]}`}>
          {priorityLabels[job.priority]}
        </span>
        <span className="text-sm font-bold text-green-600">${job.totalPay.toFixed(0)}</span>
      </div>

      {/* Customer */}
      <h4 className="font-medium text-slate-900 text-sm truncate">{job.customerName}</h4>

      {/* Location */}
      <p className="text-xs text-slate-500 truncate mb-2">
        {job.city}, {job.state}
      </p>

      {/* Time & Duration */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {job.scheduledTime}
        </span>
        <span>{job.estimatedDuration}m</span>
      </div>

      {/* Weather */}
      <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
        {getWeatherIcon()}
        <span className="capitalize">{currentWeather}</span>
      </div>

      {/* Photo indicators */}
      <div className="mt-2 flex gap-1">
        {job.photos?.before?.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-green-600">
            <Camera className="w-3 h-3" />
            Start
          </div>
        )}
        {job.photos?.after?.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-blue-600">
            <Camera className="w-3 h-3" />
            End
          </div>
        )}
      </div>
    </div>
  );

  // Render JobDetail if a job is selected
  if (showJobDetail && selectedJob) {
    return (
      <JobDetail
        job={selectedJob}
        onBack={handleBackFromDetail}
        onUpdateJob={handleJobUpdate}
        currentWeather={currentWeather}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-slate-900 text-white px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Welcome, {contractorName}</h1>
            <p className="text-xs text-slate-400">ConexSol Contractor Portal</p>
          </div>
          <button onClick={onLogout} className="p-2 hover:bg-slate-800 rounded-lg">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Stats */}
      <div className="bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex gap-4 overflow-x-auto items-center">
          <div className="flex-shrink-0">
            <p className="text-xs text-slate-500">Today's Work Orders</p>
            <p className="text-xl font-bold text-slate-900">{todaysJobs.length}</p>
          </div>
          <div className="flex-shrink-0">
            <p className="text-xs text-slate-500">Pending</p>
            <p className="text-xl font-bold text-amber-600">{pendingJobs.length}</p>
          </div>
          <div className="flex-shrink-0">
            <p className="text-xs text-slate-500">Total Earned</p>
            <p className="text-xl font-bold text-green-600">${totalEarnings.toFixed(0)}</p>
          </div>
          <div className="flex-shrink-0 ml-auto">
            <p className="text-xs text-slate-500 mb-1">Weather</p>
            <div className="flex gap-1">
              {weatherOptions.map((weather) => {
                const Icon = weather.icon;
                return (
                  <button
                    key={weather.id}
                    onClick={() => setCurrentWeather(weather.id)}
                    className={`p-1.5 rounded-lg ${
                      currentWeather === weather.id
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                    }`}
                    title={weather.label}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* View Toggle */}
      <div className="px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="flex-1 flex rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium ${
                viewMode === 'list' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600'
              }`}
            >
              <List className="w-4 h-4" />
              List
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium ${
                viewMode === 'kanban' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600'
              }`}
            >
              <Target className="w-4 h-4" />
              Board
            </button>
            <button
              onClick={() => setViewMode('route')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium ${
                viewMode === 'route' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600'
              }`}
            >
              <Car className="w-4 h-4" />
              Route
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium ${
                viewMode === 'map' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600'
              }`}
            >
              <Map className="w-4 h-4" />
              Map
            </button>
          </div>

          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as JobPriority | 'all')}
            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
          >
            <option value="all">All</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 pb-24">
        {viewMode === 'route' ? (
          <div className="space-y-4">
            {/* Route Stats */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Target className="w-5 h-5 text-orange-500" />
                  Today's Route
                </h3>
                {!isRouteActive && (
                  <button
                    onClick={optimizeRoute}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-600 text-sm font-medium rounded-lg hover:bg-blue-100"
                  >
                    <Zap className="w-4 h-4" />
                    Optimize
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-2 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">Stops</p>
                  <p className="text-lg font-bold text-slate-900">{routeStats.totalStops}</p>
                </div>
                <div className="text-center p-2 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">Miles</p>
                  <p className="text-lg font-bold text-slate-900">{routeStats.totalMiles}</p>
                </div>
                <div className="text-center p-2 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">Est. Time</p>
                  <p className="text-lg font-bold text-slate-900">{Math.floor(routeStats.estMinutes / 60)}h {routeStats.estMinutes % 60}m</p>
                </div>
              </div>

              {!isRouteActive && orderedJobs.length > 0 && (
                <button
                  onClick={startRoute}
                  className="w-full mt-3 flex items-center justify-center gap-2 py-3 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600"
                >
                  <Play className="w-5 h-5" />
                  Start Route
                </button>
              )}

              {isRouteActive && (
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Car className="w-5 h-5 text-green-600" />
                      <span className="font-medium text-green-800">
                        Stop {currentStop + 1} of {orderedJobs.length}
                      </span>
                    </div>
                    <button
                      onClick={() => setIsRouteActive(false)}
                      className="text-sm text-green-700 hover:underline"
                    >
                      End Route
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Route List */}
            <div className="space-y-2">
              {orderedJobs.length === 0 ? (
                <div className="text-center py-12">
                  <Target className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500">No work orders for route</p>
                </div>
              ) : (
                orderedJobs.map((job, index) => (
                  <div
                    key={job.id}
                    draggable={!isRouteActive}
                    onDragStart={() => handleDragStart(job)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`
                      bg-white rounded-xl border-2 transition-all
                      ${isRouteActive && index === currentStop ? 'border-green-500 ring-2 ring-green-200' : 'border-slate-200'}
                      ${isRouteActive && index < currentStop ? 'border-green-300 bg-green-50' : ''}
                      ${draggedJob?.id === job.id ? 'opacity-50' : ''}
                      ${!isRouteActive ? 'cursor-grab active:cursor-grabbing' : ''}
                    `}
                  >
                    <div className="p-3">
                      <div className="flex items-start gap-3">
                        {/* Stop Number */}
                        <div className={`
                          w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0
                          ${isRouteActive && index === currentStop ? 'bg-green-500 text-white' : ''}
                          ${isRouteActive && index < currentStop ? 'bg-green-500 text-white' : ''}
                          ${!isRouteActive ? 'bg-slate-100 text-slate-600' : ''}
                        `}>
                          {isRouteActive && index < currentStop ? (
                            <Check className="w-5 h-5" />
                          ) : (
                            index + 1
                          )}
                        </div>

                        {/* Job Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${priorityColors[job.priority]}`}>
                              {priorityLabels[job.priority]}
                            </span>
                            <span className="text-sm font-bold text-slate-900">${job.totalPay.toFixed(0)}</span>
                          </div>
                          <h4 className="font-medium text-slate-900 truncate">{job.customerName}</h4>
                          <p className="text-sm text-slate-500 flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {job.address}, {job.city}
                          </p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {job.scheduledTime}
                            </span>
                            <span>{job.estimatedDuration} min</span>
                          </div>
                        </div>

                        {/* Drag Handle */}
                        {!isRouteActive && (
                          <div className="text-slate-300">
                            <GripVertical className="w-5 h-5" />
                          </div>
                        )}
                      </div>

                      {/* Current Stop Actions */}
                      {isRouteActive && index === currentStop && (
                        <div className="mt-3 flex gap-2">
                          <a
                            href={`https://maps.google.com/?q=${job.latitude},${job.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 flex items-center justify-center gap-1 py-2 bg-green-50 text-green-600 rounded-lg text-sm font-medium"
                          >
                            <Navigation className="w-4 h-4" />
                            Navigate
                          </a>
                          <button
                            onClick={completeStop}
                            className="flex-1 flex items-center justify-center gap-1 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium"
                          >
                            <CheckCircle className="w-4 h-4" />
                            Complete
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Connector Line */}
                    {index < orderedJobs.length - 1 && (
                      <div className="flex justify-center">
                        <ArrowRight className="w-4 h-4 text-slate-300 -rotate-90" />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {orderedJobs.length > 0 && !isRouteActive && (
              <p className="text-xs text-center text-slate-400">
                Drag stops to reorder your route
              </p>
            )}
          </div>
        ) : viewMode === 'kanban' ? (
          <div className="space-y-4">
            {/* Board */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Backlog Column */}
              <div
                className="bg-slate-100 rounded-xl p-3"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleKanbanDrop('assigned')}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-slate-700 text-sm">Backlog</h3>
                  <span className="bg-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-full">
                    {backlogJobs.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {backlogJobs.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4">No work orders</p>
                  ) : (
                    backlogJobs.map((job) => (
                      <KanbanCard key={job.id} job={job} onClick={() => handleJobClick(job)} />
                    ))
                  )}
                </div>
              </div>

              {/* Route/Active Column */}
              <div
                className="bg-orange-50 rounded-xl p-3"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleKanbanDrop('en_route')}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-orange-800 text-sm">Route</h3>
                  <span className="bg-orange-200 text-orange-700 text-xs px-2 py-0.5 rounded-full">
                    {routeJobs.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {routeJobs.length === 0 ? (
                    <p className="text-xs text-orange-400 text-center py-4">No active work</p>
                  ) : (
                    routeJobs.map((job) => (
                      <KanbanCard key={job.id} job={job} onClick={() => handleJobClick(job)} />
                    ))
                  )}
                </div>
              </div>

              {/* Hold Column */}
              <div
                className="bg-amber-50 rounded-xl p-3"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleKanbanDrop('on_hold')}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-amber-800 text-sm">Hold</h3>
                  <span className="bg-amber-200 text-amber-700 text-xs px-2 py-0.5 rounded-full">
                    {holdJobs.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {holdJobs.length === 0 ? (
                    <p className="text-xs text-amber-400 text-center py-4">No on hold</p>
                  ) : (
                    holdJobs.map((job) => (
                      <KanbanCard key={job.id} job={job} onClick={() => handleJobClick(job)} />
                    ))
                  )}
                </div>
              </div>

              {/* Completed Column */}
              <div
                className="bg-green-50 rounded-xl p-3"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleKanbanDrop('completed')}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-green-800 text-sm">Completed</h3>
                  <span className="bg-green-200 text-green-700 text-xs px-2 py-0.5 rounded-full">
                    {completedJobs.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {completedJobs.length === 0 ? (
                    <p className="text-xs text-green-400 text-center py-4">No completed</p>
                  ) : (
                    completedJobs.slice(0, 5).map((job) => (
                      <KanbanCard key={job.id} job={job} onClick={() => handleJobClick(job)} />
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : viewMode === 'list' ? (
          <div className="space-y-3">
            {sortedJobs.length === 0 ? (
              <div className="text-center py-12">
                <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No work orders assigned</p>
              </div>
            ) : (
              sortedJobs.map((job) => <JobCard key={job.id} job={job} />)
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ height: 'calc(100vh - 280px)' }}>
            {/* Map Placeholder */}
            <div className="w-full h-full bg-slate-100 flex items-center justify-center">
              <div className="text-center p-6">
                <MapPin className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                <p className="text-slate-600 font-medium">Work Order Locations Map</p>
                <p className="text-sm text-slate-500 mt-1">
                  {sortedJobs.length} work orders in your area
                </p>
                {/* Mock map pins */}
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {sortedJobs.slice(0, 5).map((job, i) => (
                    <div
                      key={job.id}
                      className={`px-2 py-1 rounded text-xs text-white ${
                        job.priority === 'critical' ? 'bg-red-500' :
                        job.priority === 'high' ? 'bg-amber-500' : 'bg-blue-500'
                      }`}
                    >
                      {job.city}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-2 py-1 safe-area-pb">
        <div className="flex justify-around">
          {[
            { id: 'list', icon: List, label: 'List' },
            { id: 'kanban', icon: Target, label: 'Board' },
            { id: 'route', icon: Car, label: 'Route' },
            { id: 'map', icon: MapPin, label: 'Map' },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = viewMode === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setViewMode(item.id as 'list' | 'map' | 'route' | 'kanban')}
                className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg min-w-[64px] ${
                  isActive ? 'text-orange-500' : 'text-slate-500'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
