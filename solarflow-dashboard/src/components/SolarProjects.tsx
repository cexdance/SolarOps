// Solar Project Workflow — New Installation Tracker
import React, { useState, useMemo } from 'react';
import {
  Plus, ChevronLeft, ChevronDown, ChevronUp, CheckCircle2, Circle,
  Clock, XCircle, AlertTriangle, Search, Building2, MapPin,
  Phone, FileText, ClipboardCheck, Zap,
} from 'lucide-react';
import { Customer } from '../types';
import { ContractorJob } from '../types/contractor';
import { SolarProject, ProjectStep, StepStatus, StepOutcome, makeNewProject } from '../types/project';
import { loadProjects, saveProjects } from '../lib/projectStore';
import { ProjectPartsSection } from './ProjectPartsSection';
import { ProjectInstallationSection } from './ProjectInstallationSection';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<StepStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending:     { label: 'Pending',     color: 'text-slate-400',  icon: <Circle className="w-5 h-5" /> },
  in_progress: { label: 'In Progress', color: 'text-orange-500', icon: <Clock className="w-5 h-5" /> },
  complete:    { label: 'Complete',    color: 'text-green-500',  icon: <CheckCircle2 className="w-5 h-5" /> },
  failed:      { label: 'Failed',      color: 'text-red-500',    icon: <XCircle className="w-5 h-5" /> },
  na:          { label: 'N/A',         color: 'text-slate-300',  icon: <Circle className="w-5 h-5 opacity-40" /> },
};

const OUTCOME_CONFIG: Record<StepOutcome, { label: string; color: string }> = {
  pass:     { label: 'Pass',     color: 'bg-green-100 text-green-700 border-green-300' },
  fail:     { label: 'Fail',     color: 'bg-red-100 text-red-700 border-red-300' },
  comments: { label: 'Comments', color: 'bg-amber-100 text-amber-700 border-amber-300' },
};

function sectionProgress(steps: ProjectStep[]) {
  const total = steps.filter(s => s.status !== 'na').length;
  const done  = steps.filter(s => s.status === 'complete').length;
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

function projectOverallProgress(project: SolarProject) {
  const allSteps = project.sections.flatMap(s => s.steps);
  return sectionProgress(allSteps);
}

// ── Step row ─────────────────────────────────────────────────────────────────

const StepRow: React.FC<{
  step: ProjectStep;
  index: number;
  onChange: (updated: ProjectStep) => void;
}> = ({ step, index, onChange }) => {
  const [open, setOpen] = useState(false);
  const cfg = STATUS_CONFIG[step.status];

  const setStatus = (status: StepStatus) => onChange({ ...step, status, completedAt: status === 'complete' ? new Date().toISOString() : step.completedAt });
  const setOutcome = (outcome: StepOutcome) => onChange({ ...step, outcome });
  const setNotes = (notes: string) => onChange({ ...step, notes });
  const setDate = (date: string) => onChange({ ...step, date });

  return (
    <div className={`border border-slate-200 rounded-xl overflow-hidden ${step.status === 'complete' ? 'bg-green-50/40' : step.status === 'failed' ? 'bg-red-50/40' : 'bg-white'}`}>
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50/80 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        {/* Step number */}
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
          step.status === 'complete' ? 'bg-green-500 text-white' :
          step.status === 'failed'   ? 'bg-red-500 text-white' :
          step.status === 'in_progress' ? 'bg-orange-500 text-white' :
          'bg-slate-200 text-slate-500'
        }`}>
          {index + 1}
        </div>

        {/* Label */}
        <span className={`flex-1 text-sm font-medium ${step.status === 'complete' ? 'text-slate-500 line-through decoration-green-400' : 'text-slate-800'}`}>
          {step.label}
        </span>

        {/* Outcome badge */}
        {step.hasOutcome && step.outcome && (
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${OUTCOME_CONFIG[step.outcome].color}`}>
            {OUTCOME_CONFIG[step.outcome].label}
          </span>
        )}

        {/* Status icon */}
        <span className={cfg.color}>{cfg.icon}</span>

        {/* Date preview */}
        {step.date && (
          <span className="text-xs text-slate-400 hidden sm:block">{step.date}</span>
        )}

        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </div>

      {/* Expanded editor */}
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-3 bg-white">
          {/* Status + Date */}
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-36">
              <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
              <select
                value={step.status}
                onChange={e => setStatus(e.target.value as StepStatus)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="complete">Complete</option>
                <option value="failed">Failed / Revision Needed</option>
                <option value="na">N/A</option>
              </select>
            </div>
            <div className="flex-1 min-w-36">
              <label className="block text-xs font-medium text-slate-500 mb-1">Date</label>
              <input
                type="date"
                value={step.date ?? ''}
                onChange={e => setDate(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            {step.hasOutcome && (
              <div className="flex-1 min-w-36">
                <label className="block text-xs font-medium text-slate-500 mb-1">Outcome</label>
                <div className="flex gap-2">
                  {(['pass', 'fail', 'comments'] as StepOutcome[]).map(o => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setOutcome(o)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                        step.outcome === o
                          ? OUTCOME_CONFIG[o].color
                          : 'border-slate-200 text-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      {OUTCOME_CONFIG[o].label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
            <textarea
              value={step.notes ?? ''}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Add notes, comments, or revision details…"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
            />
          </div>

          {/* Quick action buttons */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setStatus('complete'); setOpen(false); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white text-xs font-medium rounded-lg hover:bg-green-600"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Mark Complete
            </button>
            <button
              type="button"
              onClick={() => { setStatus('in_progress'); setOpen(false); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-100 text-orange-600 text-xs font-medium rounded-lg hover:bg-orange-200"
            >
              <Clock className="w-3.5 h-3.5" /> In Progress
            </button>
            {step.status !== 'pending' && (
              <button
                type="button"
                onClick={() => { setStatus('pending'); onChange({ ...step, status: 'pending', outcome: undefined }); setOpen(false); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-500 text-xs font-medium rounded-lg hover:bg-slate-200"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Project detail view ───────────────────────────────────────────────────────

const ProjectDetail: React.FC<{
  project: SolarProject;
  contractorJobs: ContractorJob[];
  onBack: () => void;
  onChange: (updated: SolarProject) => void;
  onDelete: () => void;
}> = ({ project, contractorJobs, onBack, onChange, onDelete }) => {
  const progress = projectOverallProgress(project);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (id: string) => setCollapsedSections(prev => ({ ...prev, [id]: !prev[id] }));

  const updateStep = (sectionId: string, stepId: string, updated: ProjectStep) => {
    onChange({
      ...project,
      updatedAt: new Date().toISOString(),
      sections: project.sections.map(sec =>
        sec.id !== sectionId ? sec : {
          ...sec,
          steps: sec.steps.map(s => s.id !== stepId ? s : updated),
        }
      ),
    });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-slate-900 truncate">{project.customerName}</h1>
            <p className="text-xs text-slate-500 truncate">{project.address}, {project.city}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-sm font-bold text-slate-900">{progress}%</div>
            <div className="text-xs text-slate-500">complete</div>
          </div>
        </div>
        {/* Progress bar */}
        <div className="h-1 bg-slate-100">
          <div
            className="h-1 bg-orange-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Client info card */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Client Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="flex items-start gap-2">
              <Building2 className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium text-slate-800">{project.customerName}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <div className="text-slate-600">{project.address}<br />{project.city}, {project.state} {project.zip}</div>
            </div>
            {project.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-slate-400" />
                <span className="text-slate-600">{project.phone}</span>
              </div>
            )}
            {project.systemType && (
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-slate-400" />
                <span className="text-slate-600">{project.systemType}</span>
              </div>
            )}
          </div>
          {/* Project notes */}
          <div className="mt-3 pt-3 border-t border-slate-100">
            <label className="block text-xs font-medium text-slate-500 mb-1">Project Notes</label>
            <textarea
              value={project.notes ?? ''}
              onChange={e => onChange({ ...project, notes: e.target.value, updatedAt: new Date().toISOString() })}
              rows={2}
              placeholder="General project notes…"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
            />
          </div>
        </div>

        {/* Section 1 — Permit */}
        {project.sections.map(section => {
          const pct = sectionProgress(section.steps);
          const collapsed = collapsedSections[section.id] ?? false;
          return (
            <div key={section.id} className="space-y-2">
              {/* Collapsible section header */}
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center justify-between py-1 group"
              >
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4 text-orange-500" />
                  <h2 className="font-semibold text-slate-800">Section 1 — {section.title}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-slate-500 font-medium">{pct}%</span>
                  {collapsed ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
                </div>
              </button>

              {!collapsed && section.steps.map((step, idx) => (
                <StepRow
                  key={step.id}
                  step={step}
                  index={idx}
                  onChange={updated => updateStep(section.id, step.id, updated)}
                />
              ))}
            </div>
          );
        })}

        {/* Section 2 — Parts */}
        {(() => {
          const sec2Collapsed = collapsedSections['parts'] ?? false;
          const partsCount = (project.parts ?? []).length;
          const receivedCount = (project.parts ?? []).filter(p => p.status === 'received').length;
          return (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => toggleSection('parts')}
                className="w-full flex items-center justify-between py-1"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-orange-500" />
                  <h2 className="font-semibold text-slate-800">Section 2 — Parts & Materials</h2>
                </div>
                <div className="flex items-center gap-2">
                  {partsCount > 0 && (
                    <span className="text-xs text-slate-500">{receivedCount}/{partsCount} received</span>
                  )}
                  {sec2Collapsed ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
                </div>
              </button>
              {!sec2Collapsed && (
                <ProjectPartsSection
                  parts={project.parts ?? []}
                  onChange={parts => onChange({ ...project, parts, updatedAt: new Date().toISOString() })}
                />
              )}
            </div>
          );
        })()}

        {/* Section 3 — Installation */}
        {(() => {
          const sec3Collapsed = collapsedSections['installation'] ?? false;
          return (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => toggleSection('installation')}
                className="w-full flex items-center justify-between py-1"
              >
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-orange-500" />
                  <h2 className="font-semibold text-slate-800">Section 3 — Installation</h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{project.installationProgress ?? 0}%</span>
                  {sec3Collapsed ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
                </div>
              </button>
              {!sec3Collapsed && (
                <ProjectInstallationSection
                  scheduleEntries={project.scheduleEntries ?? []}
                  linkedContractorJobIds={project.linkedContractorJobIds ?? []}
                  installationProgress={project.installationProgress ?? 0}
                  contractorJobs={contractorJobs}
                  onChange={data => onChange({ ...project, ...data, updatedAt: new Date().toISOString() })}
                />
              )}
            </div>
          );
        })()}

        {/* Danger zone */}
        <div className="pt-4 border-t border-slate-200">
          <button
            onClick={() => { if (confirm('Delete this project?')) onDelete(); }}
            className="text-xs text-red-400 hover:text-red-600"
          >
            Delete project
          </button>
        </div>
      </div>
    </div>
  );
};

// ── New project modal ─────────────────────────────────────────────────────────

const NewProjectModal: React.FC<{
  customers: Customer[];
  onCreate: (project: SolarProject) => void;
  onClose: () => void;
}> = ({ customers, onCreate, onClose }) => {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Customer | null>(null);

  const filtered = useMemo(() =>
    search.length < 1 ? customers.slice(0, 10) :
    customers.filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.address?.toLowerCase().includes(search.toLowerCase()) ||
      c.clientId?.toLowerCase().includes(search.toLowerCase())
    ).slice(0, 15),
  [customers, search]);

  const handleCreate = () => {
    if (!selected) return;
    const proj = makeNewProject({
      customerId:    selected.id,
      customerName:  selected.name,
      address:       selected.address ?? '',
      city:          selected.city ?? '',
      state:         selected.state ?? 'FL',
      zip:           selected.zip ?? '',
      phone:         selected.phone,
      solarEdgeSiteId: selected.solarEdgeSiteId,
      systemType:    selected.systemType,
    });
    onCreate(proj);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">New Solar Project</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <XCircle className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search client by name, address, or ID…"
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {/* Customer list */}
          <div className="max-h-64 overflow-y-auto space-y-1">
            {filtered.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelected(c)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                  selected?.id === c.id
                    ? 'border-orange-400 bg-orange-50'
                    : 'border-slate-100 hover:bg-slate-50'
                }`}
              >
                <div className="font-medium text-slate-800 text-sm">{c.name}</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {c.address && `${c.address}, `}{c.city} {c.state}
                  {c.clientId && <span className="ml-2 text-slate-300">{c.clientId}</span>}
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-center py-6 text-sm text-slate-400">No clients found</p>
            )}
          </div>

          {/* Selected preview */}
          {selected && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm">
              <div className="font-semibold text-orange-800">{selected.name}</div>
              <div className="text-orange-600 text-xs mt-0.5">
                {selected.address}, {selected.city}, {selected.state} {selected.zip}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 pt-0 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!selected}
            className="flex-1 py-2.5 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Project
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Project list / dashboard ──────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: SolarProject['status'] }> = ({ status }) => {
  const map = {
    active:    'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    on_hold:   'bg-amber-100 text-amber-700',
    cancelled: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status]}`}>
      {status.replace('_', ' ')}
    </span>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

export interface SolarProjectsProps {
  customers: Customer[];
  contractorJobs?: ContractorJob[];
  isMobile?: boolean;
}

export const SolarProjects: React.FC<SolarProjectsProps> = ({ customers, contractorJobs = [], isMobile: _isMobile }) => {
  const [projects, setProjects] = useState<SolarProject[]>(() => loadProjects());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState('');

  const persist = (updated: SolarProject[]) => {
    setProjects(updated);
    saveProjects(updated);
  };

  const selectedProject = projects.find(p => p.id === selectedId) ?? null;

  const filtered = projects.filter(p =>
    p.customerName.toLowerCase().includes(search.toLowerCase()) ||
    p.address.toLowerCase().includes(search.toLowerCase())
  );

  if (selectedProject) {
    return (
      <ProjectDetail
        project={selectedProject}
        contractorJobs={contractorJobs}
        onBack={() => setSelectedId(null)}
        onChange={updated => persist(projects.map(p => p.id === updated.id ? updated : p))}
        onDelete={() => { persist(projects.filter(p => p.id !== selectedProject.id)); setSelectedId(null); }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Solar Projects</h1>
            <p className="text-xs text-slate-500">{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-xl hover:bg-orange-600 shadow-sm"
          >
            <Plus className="w-4 h-4" /> New Project
          </button>
        </div>
        {/* Search */}
        <div className="max-w-3xl mx-auto px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search projects…"
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>
      </div>

      {/* Project list */}
      <div className="max-w-3xl mx-auto px-4 py-4 space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-16">
            <ClipboardCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No projects yet</p>
            <p className="text-slate-400 text-sm mt-1">Click "New Project" to get started</p>
          </div>
        )}

        {filtered.map(project => {
          const progress = projectOverallProgress(project);
          const permitSection = project.sections.find(s => s.id === 'permit');
          const nextStep = permitSection?.steps.find(s => s.status !== 'complete' && s.status !== 'na');

          return (
            <button
              key={project.id}
              type="button"
              onClick={() => setSelectedId(project.id)}
              className="w-full text-left bg-white rounded-xl border border-slate-200 p-4 hover:border-orange-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-semibold text-slate-900 truncate">{project.customerName}</h3>
                    <StatusBadge status={project.status} />
                  </div>
                  <p className="text-xs text-slate-500 truncate">{project.address}, {project.city}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-xl font-bold text-slate-800">{progress}<span className="text-sm font-normal text-slate-400">%</span></span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-orange-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {/* Next step */}
              {nextStep && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Clock className="w-3 h-3 text-orange-400 flex-shrink-0" />
                  <span>Next: <span className="font-medium text-slate-700">{nextStep.label}</span></span>
                </div>
              )}
              {progress === 100 && (
                <div className="flex items-center gap-1 text-xs text-green-600 font-medium">
                  <CheckCircle2 className="w-3 h-3" /> All steps complete
                </div>
              )}

              {/* Step summary dots */}
              {permitSection && (
                <div className="flex gap-0.5 mt-2 flex-wrap">
                  {permitSection.steps.map(s => (
                    <div
                      key={s.id}
                      className={`w-2 h-2 rounded-full ${
                        s.status === 'complete'    ? 'bg-green-400' :
                        s.status === 'failed'      ? 'bg-red-400' :
                        s.status === 'in_progress' ? 'bg-orange-400' :
                        'bg-slate-200'
                      }`}
                      title={s.label}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {showNew && (
        <NewProjectModal
          customers={customers}
          onCreate={proj => persist([proj, ...projects])}
          onClose={() => setShowNew(false)}
        />
      )}
    </div>
  );
};
