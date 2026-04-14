// SolarFlow - Job Detail Component
import React, { useState, useRef } from 'react';
import {
  ArrowLeft,
  MapPin,
  Phone,
  Clock,
  AlertTriangle,
  AlertCircle,
  Play,
  Square,
  Camera,
  CheckCircle,
  Package,
  FileText,
  Send,
  X,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Wrench,
  Zap,
  Thermometer,
  User,
  Mail,
  DollarSign,
  Image,
  Save,
  Cloud,
  CloudRain,
  Sun,
  Wind,
} from 'lucide-react';
import { ContractorJob, JobStatusContractor, ServiceStatus, PhotoCategory, JobPart } from '../../types/contractor';

interface JobDetailProps {
  job: ContractorJob;
  onBack: () => void;
  onUpdateJob: (updatedJob: ContractorJob) => void;
  currentWeather?: string;
}

type DocumentationStep = 'details' | 'photos' | 'service' | 'complete';

const statusLabels: Record<JobStatusContractor, string> = {
  assigned: 'Assigned',
  en_route: 'En Route',
  in_progress: 'In Progress',
  documentation: 'Documentation',
  completed: 'Completed',
  cancelled: 'Cancelled',
  on_hold: 'On Hold',
};

const statusColors: Record<JobStatusContractor, string> = {
  assigned: 'bg-blue-100 text-blue-700',
  en_route: 'bg-yellow-100 text-yellow-700',
  in_progress: 'bg-green-100 text-green-700',
  documentation: 'bg-purple-100 text-purple-700',
  completed: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-100 text-red-700',
  on_hold: 'bg-amber-100 text-amber-700',
};

const serviceStatusLabels: Record<ServiceStatus, string> = {
  fully_operational: 'Fully Operational',
  partially_operational: 'Partially Operational',
  pending_parts: 'Pending Parts',
  could_not_complete: 'Could Not Complete',
};

const photoCategoryLabels: Record<PhotoCategory, string> = {
  before: 'Site Condition (Before)',
  serial: 'Equipment Serial Numbers',
  parts: 'Replacement Parts',
  process: 'Work Process',
  after: 'Site Condition (After)',
};

const photoCategoryDescriptions: Record<PhotoCategory, string> = {
  before: 'Take photos of the job site before starting work',
  serial: 'Document serial numbers of equipment',
  parts: 'Photos of replacement parts used',
  process: 'Document the work process',
  after: 'Final photos showing completed work',
};

export const JobDetail: React.FC<JobDetailProps> = ({ job, onBack, onUpdateJob, currentWeather }) => {
  const [currentStep, setCurrentStep] = useState<DocumentationStep>('details');
  const [jobStatus, setJobStatus] = useState<JobStatusContractor>(job.status);
  const [expandedSection, setExpandedSection] = useState<string>('details');

  // Sync photos when job changes (e.g., returning to job after update)
  const [photos, setPhotos] = useState(job.photos);

  // Keep photos in sync with job updates
  React.useEffect(() => {
    setPhotos(job.photos);
  }, [job.photos]);

  // Issue reporting state
  const [hasIssue, setHasIssue] = useState(false);
  const [issueDescription, setIssueDescription] = useState('');

  // Accident reporting state
  const [hasAccident, setHasAccident] = useState(false);
  const [accidentDescription, setAccidentDescription] = useState('');

  // Photos state
  const [activePhotoCategory, setActivePhotoCategory] = useState<PhotoCategory>('before');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Service notes state
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>(job.serviceStatus || 'fully_operational');
  const [operationalNotes, setOperationalNotes] = useState(job.operationalNotes || '');
  const [nextSteps, setNextSteps] = useState(job.nextSteps || '');
  const [requiresFollowUp, setRequiresFollowUp] = useState(job.requiresFollowUp || false);
  const [completionNotes, setCompletionNotes] = useState(job.completionNotes || '');

  // Parts state
  const [parts, setParts] = useState<JobPart[]>(job.parts);
  const [showAddPart, setShowAddPart] = useState(false);
  const [newPart, setNewPart] = useState({ name: '', partNumber: '', quantity: 1, unitPrice: 0 });

  // Signature state
  const [showSignature, setShowSignature] = useState(false);
  const [clientSignature, setClientSignature] = useState(job.clientSignature || '');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Invoice/Payment state
  const [laborAmount, setLaborAmount] = useState(job.laborAmount);
  const [partsAmount, setPartsAmount] = useState(job.partsAmount);
  const [markupPercent, setMarkupPercent] = useState(job.markupPercent);

  // Calculate totals
  const totalPartsCost = parts.reduce((sum, p) => sum + p.totalPrice, 0);
  const totalAmount = (laborAmount + totalPartsCost) * (1 + markupPercent / 100);

  // Start the job - no photo requirement
  const canStartJob = true;

  const handleStartJob = () => {
    const updatedJob: ContractorJob = {
      ...job,
      status: 'in_progress' as JobStatusContractor,
      startedAt: new Date().toISOString(),
      photos,
    };
    setJobStatus('in_progress');
    onUpdateJob(updatedJob);
    setCurrentStep('photos');
    setExpandedSection('photos');
  };

  // Move to documentation phase
  const handleStartDocumentation = () => {
    const updatedJob = {
      ...job,
      status: 'documentation' as JobStatusContractor,
    };
    setJobStatus('documentation');
    onUpdateJob(updatedJob);
    setCurrentStep('service');
    setExpandedSection('service');
  };

  // Handle photo capture
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotos((prev) => ({
          ...prev,
          [activePhotoCategory]: [...prev[activePhotoCategory], reader.result as string],
        }));
      };
      reader.readAsDataURL(file);
    });

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = (category: PhotoCategory, index: number) => {
    setPhotos((prev) => ({
      ...prev,
      [category]: prev[category].filter((_, i) => i !== index),
    }));
  };

  // Add part
  const handleAddPart = () => {
    if (!newPart.name) return;
    const part: JobPart = {
      id: `part-${Date.now()}`,
      ...newPart,
      totalPrice: newPart.quantity * newPart.unitPrice,
    };
    setParts([...parts, part]);
    setNewPart({ name: '', partNumber: '', quantity: 1, unitPrice: 0 });
    setShowAddPart(false);

    // Update parts amount
    const newPartsAmount = partsAmount + part.totalPrice;
    setPartsAmount(newPartsAmount);
  };

  const handleRemovePart = (index: number) => {
    const removedPart = parts[index];
    setParts(parts.filter((_, i) => i !== index));
    setPartsAmount(partsAmount - removedPart.totalPrice);
  };

  // Signature handling
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      setClientSignature(canvas.toDataURL());
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    setClientSignature('');
  };

  // Complete the job - requires after photo
  const canComplete = photos.after.length > 0;

  // Time tracking based on photos
  const getTimeOnSite = () => {
    if (job.startedAt && job.completedAt) {
      const start = new Date(job.startedAt).getTime();
      const end = new Date(job.completedAt).getTime();
      const minutes = Math.round((end - start) / 60000);
      return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    }
    if (job.startedAt) {
      const start = new Date(job.startedAt).getTime();
      const now = Date.now();
      const minutes = Math.round((now - start) / 60000);
      return `${Math.floor(minutes / 60)}h ${minutes % 60}m (ongoing)`;
    }
    return 'N/A';
  };

  const handleCompleteJob = () => {
    if (!canComplete) {
      alert('Please take "Site Condition (After)" photos before completing the job');
      return;
    }

    // Store issue and accident reports in completion notes
    let finalNotes = completionNotes;
    if (issueDescription) {
      finalNotes += `\n\n[ISSUE REPORTED]: ${issueDescription}`;
    }
    if (accidentDescription) {
      finalNotes += `\n\n[ACCIDENT REPORTED]: ${accidentDescription}`;
    }

    const updatedJob: ContractorJob = {
      ...job,
      status: 'completed',
      completedAt: new Date().toISOString(),
      photos,
      serviceStatus,
      operationalNotes,
      nextSteps,
      requiresFollowUp,
      completionNotes: finalNotes,
      parts,
      clientSignature,
      signatureDate: clientSignature ? new Date().toISOString() : undefined,
      laborAmount,
      partsAmount: totalPartsCost,
      markupPercent,
      totalAmount,
      invoiceStatus: 'pending',
      paymentStatus: 'pending',
    };

    setJobStatus('completed');
    onUpdateJob(updatedJob);
    setCurrentStep('complete');
    setExpandedSection('complete');
  };

  // Send invoice (simulated)
  const handleSendInvoice = () => {
    const updatedJob: ContractorJob = {
      ...job,
      invoiceStatus: 'sent',
      invoiceSentAt: new Date().toISOString(),
    };
    onUpdateJob(updatedJob);
    alert('Invoice sent to ' + job.customerEmail);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 rounded-lg hover:bg-slate-100"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <h1 className="font-semibold text-slate-900">Work Order #{job.id}</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[jobStatus]}`}>
                {statusLabels[jobStatus]}
              </span>
            </div>
          </div>

          {jobStatus === 'assigned' && (
            <button
              onClick={handleStartJob}
              disabled={!canStartJob}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${
                canStartJob
                  ? 'bg-green-500 text-white hover:bg-green-600'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Play className="w-4 h-4" />
              Start Job
            </button>
          )}

          {jobStatus === 'in_progress' && (
            <button
              onClick={handleStartDocumentation}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg font-medium"
            >
              <Camera className="w-4 h-4" />
              Start Documentation
            </button>
          )}
        </div>
      </header>

      <div className="p-4 pb-24">
        {/* Customer Info Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
          <h2 className="font-semibold text-slate-900 mb-3">{job.customerName}</h2>

          <div className="space-y-2 text-sm">
            <a
              href={`https://maps.google.com/?q=${job.latitude},${job.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-slate-600 hover:text-blue-600"
            >
              <MapPin className="w-4 h-4" />
              {job.address}, {job.city}, {job.state} {job.zip}
            </a>

            <a
              href={`tel:${job.customerPhone}`}
              className="flex items-center gap-2 text-slate-600 hover:text-blue-600"
            >
              <Phone className="w-4 h-4" />
              {job.customerPhone}
            </a>

            {job.customerEmail && (
              <div className="flex items-center gap-2 text-slate-600">
                <Mail className="w-4 h-4" />
                {job.customerEmail}
              </div>
            )}
          </div>
        </div>

        {/* Service Details */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Wrench className="w-4 h-4 text-orange-500" />
              Service Details
            </h3>
          </div>

          <div className="space-y-3 text-sm">
            <div>
              <p className="text-slate-500 text-xs">Service Type</p>
              <p className="font-medium text-slate-900">{job.serviceType}</p>
            </div>

            <div>
              <p className="text-slate-500 text-xs">Description</p>
              <p className="text-slate-700">{job.description}</p>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1 text-slate-600">
                <Clock className="w-4 h-4" />
                {job.scheduledTime}
              </div>
              <div className="flex items-center gap-1 text-slate-600">
                <Thermometer className="w-4 h-4" />
                Est: {job.estimatedDuration} min
              </div>
              {currentWeather && (
                <div className="flex items-center gap-1 text-slate-600 capitalize">
                  {currentWeather === 'sunny' && <Sun className="w-4 h-4 text-amber-500" />}
                  {currentWeather === 'cloudy' && <Cloud className="w-4 h-4 text-slate-500" />}
                  {currentWeather === 'rainy' && <CloudRain className="w-4 h-4 text-blue-500" />}
                  {currentWeather === 'windy' && <Wind className="w-4 h-4 text-slate-400" />}
                  <span className="text-blue-500">{currentWeather}</span>
                </div>
              )}
            </div>

            {/* Time on Site */}
            {job.startedAt && (
              <div className="mt-2 p-2 bg-blue-50 rounded-lg">
                <p className="text-xs text-blue-600">Time on Site</p>
                <p className="text-sm font-semibold text-blue-800">{getTimeOnSite()}</p>
              </div>
            )}

            {job.notes && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-yellow-800 text-xs font-medium mb-1">Notes</p>
                <p className="text-yellow-700 text-sm">{job.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Parts Information */}
        {job.parts.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-3">
              <Package className="w-4 h-4 text-blue-500" />
              Parts to Replace
            </h3>

            <div className="space-y-2">
              {job.parts.map((part) => (
                <div key={part.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                  <div>
                    <p className="font-medium text-slate-900">{part.name}</p>
                    <p className="text-xs text-slate-500">Part #: {part.partNumber}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-slate-900">${part.totalPrice}</p>
                    <p className="text-xs text-slate-500">x{part.quantity}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Documentation Section */}
        {(jobStatus === 'in_progress' || jobStatus === 'documentation' || jobStatus === 'completed') && (
          <div className="space-y-4">
            {/* Step Indicator */}
            <div className="flex items-center gap-2 mb-4">
              {['photos', 'service', 'complete'].map((step, index) => (
                <React.Fragment key={step}>
                  <div
                    className={`flex-1 h-1 rounded ${
                      currentStep === step || (step === 'photos' && jobStatus === 'in_progress') ||
                      (index === 0 && jobStatus === 'documentation') ||
                      (step === 'complete' && jobStatus === 'completed')
                        ? 'bg-orange-500' : 'bg-slate-200'
                    }`}
                  />
                </React.Fragment>
              ))}
            </div>

            {/* Photo Documentation */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Camera className="w-4 h-4 text-purple-500" />
                  Photo Documentation
                </h3>
              </div>

              {/* Category Tabs */}
              <div className="flex flex-wrap gap-2 mb-4">
                {(Object.keys(photoCategoryLabels) as PhotoCategory[]).map((category) => (
                  <button
                    key={category}
                    onClick={() => setActivePhotoCategory(category)}
                    className={`px-3 py-1.5 text-sm rounded-lg ${
                      activePhotoCategory === category
                        ? 'bg-orange-500 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {photoCategoryLabels[category]}
                    {photos[category].length > 0 && (
                      <span className="ml-1 text-xs">({photos[category].length})</span>
                    )}
                  </button>
                ))}
              </div>

              <p className="text-sm text-slate-500 mb-3">
                {photoCategoryDescriptions[activePhotoCategory]}
              </p>

              {/* Photo Grid */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                {photos[activePhotoCategory].map((photo, index) => (
                  <div key={index} className="relative aspect-square rounded-lg overflow-hidden bg-slate-100">
                    <img src={photo} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => handleRemovePhoto(activePhotoCategory, index)}
                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 hover:border-orange-500 hover:text-orange-500"
                >
                  <Camera className="w-6 h-6 mb-1" />
                  <span className="text-xs">Add</span>
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                onChange={handlePhotoCapture}
                className="hidden"
              />
            </div>

            {/* Service Report */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-green-500" />
                Service Report
              </h3>

              {/* Status Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  System Status
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(serviceStatusLabels) as ServiceStatus[]).map((status) => (
                    <button
                      key={status}
                      onClick={() => setServiceStatus(status)}
                      className={`p-3 text-sm rounded-lg border text-left ${
                        serviceStatus === status
                          ? 'border-orange-500 bg-orange-50 text-orange-700'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      {serviceStatusLabels[status]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Operational Notes */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Service Notes
                </label>
                <textarea
                  value={operationalNotes}
                  onChange={(e) => setOperationalNotes(e.target.value)}
                  placeholder="Describe what was done, findings, observations..."
                  className="w-full p-3 border border-slate-200 rounded-lg text-sm min-h-[100px]"
                />
              </div>

              {/* Add Parts */}
              <div className="mb-4">
                <button
                  onClick={() => setShowAddPart(!showAddPart)}
                  className="flex items-center gap-2 text-sm text-blue-600 font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Add Parts Used
                </button>

                {showAddPart && (
                  <div className="mt-2 p-3 bg-slate-50 rounded-lg space-y-2">
                    <input
                      type="text"
                      placeholder="Part name"
                      value={newPart.name}
                      onChange={(e) => setNewPart({ ...newPart, name: e.target.value })}
                      className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="text"
                        placeholder="Part #"
                        value={newPart.partNumber}
                        onChange={(e) => setNewPart({ ...newPart, partNumber: e.target.value })}
                        className="p-2 border border-slate-200 rounded-lg text-sm"
                      />
                      <input
                        type="number"
                        placeholder="Qty"
                        value={newPart.quantity}
                        onChange={(e) => setNewPart({ ...newPart, quantity: parseInt(e.target.value) || 1 })}
                        className="p-2 border border-slate-200 rounded-lg text-sm"
                      />
                      <input
                        type="number"
                        placeholder="Price"
                        value={newPart.unitPrice || ''}
                        onChange={(e) => setNewPart({ ...newPart, unitPrice: parseFloat(e.target.value) || 0 })}
                        className="p-2 border border-slate-200 rounded-lg text-sm"
                      />
                    </div>
                    <button
                      onClick={handleAddPart}
                      className="w-full py-2 bg-blue-500 text-white rounded-lg text-sm font-medium"
                    >
                      Add Part
                    </button>
                  </div>
                )}

                {/* Parts List */}
                {parts.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {parts.map((part, index) => (
                      <div key={part.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                        <div>
                          <p className="font-medium text-slate-900">{part.name}</p>
                          <p className="text-xs text-slate-500">{part.partNumber} x{part.quantity}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">${part.totalPrice}</span>
                          <button
                            onClick={() => handleRemovePart(index)}
                            className="p-1 text-red-500"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Next Steps */}
              {serviceStatus !== 'fully_operational' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Next Steps / Follow-up Required
                  </label>
                  <textarea
                    value={nextSteps}
                    onChange={(e) => setNextSteps(e.target.value)}
                    placeholder="Describe any follow-up actions needed..."
                    className="w-full p-3 border border-slate-200 rounded-lg text-sm min-h-[80px]"
                  />
                  <label className="flex items-center gap-2 mt-2">
                    <input
                      type="checkbox"
                      checked={requiresFollowUp}
                      onChange={(e) => setRequiresFollowUp(e.target.checked)}
                      className="w-4 h-4 text-orange-500"
                    />
                    <span className="text-sm text-slate-600">Requires follow-up visit</span>
                  </label>
                </div>
              )}

              {/* Completion Notes */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Final Notes
                </label>
                <textarea
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  placeholder="Any additional notes for the customer..."
                  className="w-full p-3 border border-slate-200 rounded-lg text-sm min-h-[80px]"
                />
              </div>
            </div>

            {/* Issue Reporting */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <label className="flex items-center gap-2 mb-3">
                <input
                  type="checkbox"
                  checked={hasIssue}
                  onChange={(e) => setHasIssue(e.target.checked)}
                  className="w-4 h-4 text-orange-500"
                />
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Report an Issue
                </h3>
              </label>

              {hasIssue && (
                <textarea
                  value={issueDescription}
                  onChange={(e) => setIssueDescription(e.target.value)}
                  placeholder="Describe any issues encountered..."
                  className="w-full p-3 border border-slate-200 rounded-lg text-sm min-h-[80px]"
                />
              )}
            </div>

            {/* Accident Reporting */}
            <div className="bg-white rounded-xl border border-red-200 p-4">
              <label className="flex items-center gap-2 mb-3">
                <input
                  type="checkbox"
                  checked={hasAccident}
                  onChange={(e) => setHasAccident(e.target.checked)}
                  className="w-4 h-4 text-red-500"
                />
                <h3 className="font-semibold text-red-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  Report an Accident
                </h3>
              </label>

              {hasAccident && (
                <textarea
                  value={accidentDescription}
                  onChange={(e) => setAccidentDescription(e.target.value)}
                  placeholder="Describe the accident in detail..."
                  className="w-full p-3 border border-red-200 rounded-lg text-sm min-h-[80px]"
                />
              )}
            </div>

            {/* Xero Invoice Link (replaces Billing Summary) */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-blue-500" />
                Invoice & Payment
              </h3>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Labor</span>
                  <span className="font-medium">${laborAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Parts</span>
                  <span className="font-medium">${totalPartsCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Markup ({markupPercent}%)</span>
                  <span className="font-medium">
                    ${((laborAmount + totalPartsCost) * markupPercent / 100).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between font-semibold text-lg pt-2 border-t">
                  <span>Total Invoice</span>
                  <span className="text-orange-600">${totalAmount.toFixed(2)}</span>
                </div>
              </div>

              <a
                href={`https://go.xero.com/Invoice/Edit/${job.invoiceId || ''}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 w-full flex items-center justify-center gap-2 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                <FileText className="w-4 h-4" />
                Open in Xero
              </a>

              {/* Contractor Pay */}
              <div className="mt-4 p-3 bg-green-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-green-800">Your Pay</span>
                  <span className="text-lg font-bold text-green-600">${job.contractorTotalPay.toFixed(2)}</span>
                </div>
                <p className="text-xs text-green-600 mt-1">
                  {job.contractorPayRate}/{job.contractorPayUnit} • Est. {job.estimatedDuration} min
                </p>
              </div>
            </div>

            {/* Client Signature */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <User className="w-4 h-4 text-blue-500" />
                  Client Signature
                </h3>
                <span className="text-xs text-slate-500">(Optional)</span>
              </div>

              {clientSignature ? (
                <div className="border border-slate-200 rounded-lg p-2">
                  <img src={clientSignature} alt="Client signature" className="max-h-24" />
                  <button
                    onClick={clearSignature}
                    className="mt-2 text-sm text-red-500"
                  >
                    Clear Signature
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowSignature(true)}
                  className="w-full py-8 border-2 border-dashed border-slate-300 rounded-lg text-slate-400"
                >
                  Tap to add signature
                </button>
              )}
            </div>

            {/* Complete Button */}
            {jobStatus !== 'completed' && (
              <button
                onClick={handleCompleteJob}
                disabled={!canComplete}
                className={`w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 ${
                  canComplete
                    ? 'bg-orange-500 text-white hover:bg-orange-600'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <CheckCircle className="w-5 h-5" />
                {canComplete ? 'Complete Job' : 'Add "After" photos to complete'}
              </button>
            )}
          </div>
        )}

        {/* Completed View */}
        {jobStatus === 'completed' && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
              <h3 className="font-semibold text-green-800">Job Completed!</h3>
              <p className="text-sm text-green-600">
                Completed at {new Date(job.completedAt || '').toLocaleString()}
              </p>
            </div>

            {/* Photo Summary */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900 mb-3">Photo Summary</h3>
              <div className="space-y-2">
                {(Object.keys(photoCategoryLabels) as PhotoCategory[]).map((category) => (
                  <div key={category} className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">{photoCategoryLabels[category]}</span>
                    <span className="text-sm font-medium">{photos[category].length} photos</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Service Summary */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900 mb-3">Service Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Status</span>
                  <span className="font-medium">{serviceStatusLabels[serviceStatus]}</span>
                </div>
                {operationalNotes && (
                  <div>
                    <p className="text-slate-600">Notes</p>
                    <p className="text-slate-900">{operationalNotes}</p>
                  </div>
                )}
                {nextSteps && (
                  <div>
                    <p className="text-slate-600">Next Steps</p>
                    <p className="text-slate-900">{nextSteps}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Invoice Actions */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900 mb-3">Invoice & Payment</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-green-600" />
                    <span className="font-medium">Invoice</span>
                  </div>
                  <span className="text-sm text-green-600">${totalAmount.toFixed(2)}</span>
                </div>

                {job.invoiceStatus === 'pending' && (
                  <button
                    onClick={handleSendInvoice}
                    className="w-full py-3 bg-blue-500 text-white rounded-lg font-medium flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    Send Invoice to Client
                  </button>
                )}

                {job.invoiceStatus === 'sent' && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
                    <p className="text-blue-700 font-medium">Invoice Sent</p>
                    <p className="text-sm text-blue-600">Sent at {new Date(job.invoiceSentAt || '').toLocaleString()}</p>
                  </div>
                )}

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-orange-500" />
                    <span className="font-medium">Contractor Pay</span>
                  </div>
                  <span className="text-sm font-bold text-orange-600">${job.contractorTotalPay.toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="text-sm text-slate-600">Payment Status</span>
                  <span className={`text-sm font-medium ${
                    job.paymentStatus === 'pending' ? 'text-yellow-600' :
                    job.paymentStatus === 'approved' ? 'text-blue-600' :
                    job.paymentStatus === 'processed' ? 'text-green-600' : 'text-slate-600'
                  }`}>
                    {job.paymentStatus?.replace('_', ' ').toUpperCase() || 'PENDING'}
                  </span>
                </div>

                {/* Google Review Link */}
                <a
                  href="https://search.google.com/local/reviews?placeid=ChIJC5iK_6nL5okRZvGfC6G8j8g"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 bg-green-500 text-white rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-green-600"
                >
                  <span className="text-lg">⭐</span>
                  Leave a Google Review
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Signature Modal */}
      {showSignature && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-4 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Client Signature</h3>
              <button onClick={() => setShowSignature(false)}>
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <canvas
              ref={canvasRef}
              width={350}
              height={150}
              className="border border-slate-200 rounded-lg w-full bg-white cursor-crosshair"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
            />

            <div className="flex gap-2 mt-4">
              <button
                onClick={clearSignature}
                className="flex-1 py-2 border border-slate-200 rounded-lg text-slate-600"
              >
                Clear
              </button>
              <button
                onClick={() => setShowSignature(false)}
                className="flex-1 py-2 bg-orange-500 text-white rounded-lg"
              >
                Save Signature
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobDetail;
