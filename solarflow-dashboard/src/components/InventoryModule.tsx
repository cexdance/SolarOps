// SolarFlow - Inventory Module
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { formatMoney } from '../lib/money';
import {
  Package,
  Wrench,
  Users,
  Plus,
  PackagePlus,
  Search,
  Edit,
  Trash2,
  Upload,
  Link,
  MapPin,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  X,
  ChevronDown,
  ChevronUp,
  Camera,
  ImageIcon,
} from 'lucide-react';

// ── Image uploader, URL input + optional file upload ─────────────────────
const ImageUploader: React.FC<{
  value?: string;
  onChange: (dataUrl: string | undefined) => void;
  label?: string;
  /** Hard cap applied to the file before storing. Defaults to the 1 MB cap. */
  maxBytes?: number;
}> = ({ value, onChange, label = 'Thumbnail', maxBytes }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = React.useState('');
  const [mode, setMode] = React.useState<'url' | 'file'>('url');

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Auto-downscale/recompress under the cap before storing the data URL.
    compressImageToDataUrlUnder(file, maxBytes)
      .then(onChange)
      .catch(() => {
        const reader = new FileReader();
        reader.onload = () => onChange(reader.result as string);
        reader.readAsDataURL(file);
      });
  };

  const handleUrlApply = () => {
    const trimmed = urlInput.trim();
    if (trimmed) onChange(trimmed);
  };

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <div className="flex items-start gap-3">
        {/* Preview */}
        <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 flex-shrink-0 bg-slate-50 flex items-center justify-center">
          {value
            ? <img src={value} alt="item" className="w-full h-full object-cover" onError={() => onChange(undefined)} />
            : <ImageIcon className="w-6 h-6 text-slate-300" />
          }
          {value && (
            <button
              type="button"
              onClick={() => { onChange(undefined); setUrlInput(''); }}
              className="absolute top-0.5 right-0.5 bg-black/50 rounded-full p-0.5 text-white hover:bg-black/70"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
        {/* Mode toggle + inputs */}
        <div className="flex-1 space-y-2">
          <div className="flex gap-2 text-xs">
            <button type="button" onClick={() => setMode('url')}
              className={`px-2 py-1 rounded ${mode === 'url' ? 'bg-orange-100 text-orange-600 font-medium' : 'text-slate-400 hover:text-slate-600'}`}>
              <Link className="w-3 h-3 inline mr-1" />URL
            </button>
            <button type="button" onClick={() => setMode('file')}
              className={`px-2 py-1 rounded ${mode === 'file' ? 'bg-orange-100 text-orange-600 font-medium' : 'text-slate-400 hover:text-slate-600'}`}>
              <Camera className="w-3 h-3 inline mr-1" />Upload
            </button>
          </div>
          {mode === 'url' ? (
            <div className="flex gap-2">
              <input
                type="url"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleUrlApply())}
                placeholder="https://example.com/image.jpg"
                className="flex-1 text-xs px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <button type="button" onClick={handleUrlApply}
                className="px-3 py-1.5 bg-orange-500 text-white text-xs rounded-lg hover:bg-orange-600">
                Apply
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50"
              >
                <Upload className="w-3 h-3" />
                {value ? 'Change file' : 'Choose file'}
              </button>
              <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            </>
          )}
        </div>
      </div>
    </div>
  );
};
import {
  InventoryItem,
  ToolItem,
  Provider,
  InventoryCategory,
  ToolCategory,
  UnitOfMeasure,
  ToolStatus,
  StockReceipt,
  Job,
  User,
  RMAEntry,
} from '../types';
import { loadInventory, saveInventory, deleteInventoryItem, adjustLocationQty, applyPartsToInventory, pendingStockParts } from '../lib/inventoryStore';
import { loadTools, saveTools, deleteTool, setToolAssignment } from '../lib/toolStore';
import { serviceOrderNo } from '../lib/woHelpers';
import { RmaCreateModal } from './RmaCreateModal';
import { uploadPhotoToStorage } from '../lib/photoStorage';
import { compressImageToDataUrlUnder } from '../lib/photoCompress';
import { Contractor } from '../types/contractor';

interface InventoryModuleProps {
  isMobile?: boolean;
  jobs?: Job[];
  onUpdateJob?: (job: Job) => void;
  currentUser?: User | null;
  standaloneRmas?: RMAEntry[];
  onCreateStandaloneRma?: (entry: RMAEntry) => void;
  onUpdateStandaloneRma?: (entry: RMAEntry) => void;
  contractors?: Contractor[];
}

// Demo data
const demoInventory: InventoryItem[] = [
  {
    id: 'inv-1',
    sku: 'REC-400W',
    name: 'REC Alpha Pure 400W Panel',
    category: 'panel',
    description: 'REC Alpha Pure Series 400W solar panel',
    quantity: 150,
    unitOfMeasure: 'unit',
    location: 'Warehouse A - Rack 1',
    minStockThreshold: 20,
    unitCost: 185,
    vendorId: 'prov-1',
    purchaseDate: '2025-01-15',
    createdAt: '2025-01-15',
  },
  {
    id: 'inv-2',
    sku: 'SOL-EDGE-7',
    name: 'SolarEdge Optimizer P700',
    category: 'optimizer',
    description: 'SolarEdge power optimizer for residential',
    quantity: 8,
    unitOfMeasure: 'unit',
    location: 'Warehouse A - Rack 2',
    minStockThreshold: 15,
    unitCost: 125,
    vendorId: 'prov-2',
    purchaseDate: '2025-01-20',
    createdAt: '2025-01-20',
  },
  {
    id: 'inv-3',
    sku: 'SE-HYD-10K',
    name: 'SolarEdge Hive 10K Inverter',
    category: 'inverter',
    description: 'SolarEdge 10kW hybrid inverter',
    quantity: 5,
    unitOfMeasure: 'unit',
    location: 'Warehouse A - Rack 3',
    minStockThreshold: 3,
    unitCost: 3500,
    vendorId: 'prov-2',
    purchaseDate: '2025-02-01',
    createdAt: '2025-02-01',
  },
  {
    id: 'inv-4',
    sku: 'CABLE-THHN-12',
    name: '12 AWG THHN Cable (500ft)',
    category: 'cable',
    description: 'Green 12 AWG USE-2 THHN cable',
    quantity: 12,
    unitOfMeasure: 'roll',
    location: 'Warehouse B - Cage 1',
    minStockThreshold: 5,
    unitCost: 285,
    vendorId: 'prov-3',
    purchaseDate: '2025-01-10',
    createdAt: '2025-01-10',
  },
  {
    id: 'inv-5',
    sku: 'RACK-UNIRAC',
    name: 'Unirac Flash L-Foot',
    category: 'racking',
    description: 'Unirac Flash L-Foot mounting hardware',
    quantity: 450,
    unitOfMeasure: 'unit',
    location: 'Warehouse B - Cage 2',
    minStockThreshold: 100,
    unitCost: 4.5,
    vendorId: 'prov-1',
    purchaseDate: '2025-01-25',
    createdAt: '2025-01-25',
  },
  {
    id: 'inv-6',
    sku: 'LABEL-C warning',
    name: 'Warning Labels (100pc)',
    category: 'label',
    description: 'Electrical warning labels',
    quantity: 3,
    unitOfMeasure: 'box',
    location: 'Office Supplies',
    minStockThreshold: 5,
    unitCost: 25,
    vendorId: 'prov-3',
    purchaseDate: '2025-02-05',
    createdAt: '2025-02-05',
  },
];

const demoTools: ToolItem[] = [
  {
    id: 'tool-1',
    name: 'DeWalt Hammer Drill 20V',
    category: 'drill',
    serialNumber: 'DWT-2024-001',
    status: 'available',
    location: 'Truck 1',
    purchaseDate: '2024-06-15',
    purchasePrice: 189,
    createdAt: '2024-06-15',
  },
  {
    id: 'tool-2',
    name: 'Extension Ladder 24ft',
    category: 'ladder',
    serialNumber: 'WERN-24-002',
    status: 'in_use',
    assignedTo: 'Mike Johnson',
    location: 'Job Site - Johnson Residence',
    purchaseDate: '2024-03-10',
    purchasePrice: 249,
    createdAt: '2024-03-10',
  },
  {
    id: 'tool-3',
    name: 'Milwaukee Crimper Kit',
    category: 'crimper',
    serialNumber: 'MILW-CRIMP-003',
    status: 'available',
    location: 'Tool Cage',
    purchaseDate: '2024-08-20',
    purchasePrice: 425,
    lastInspectionDate: '2025-01-15',
    createdAt: '2024-08-20',
  },
  {
    id: 'tool-4',
    name: 'Safety Harness Kit',
    category: 'ppe',
    status: 'in_use',
    assignedTo: 'John Smith',
    location: 'Job Site - Smith Commercial',
    purchaseDate: '2024-05-01',
    purchasePrice: 150,
    createdAt: '2024-05-01',
  },
  {
    id: 'tool-5',
    name: 'Fluke Electrical Tester',
    category: 'tester',
    serialNumber: 'FLUKE-117-005',
    status: 'broken',
    location: 'Tool Cage - Repair',
    purchaseDate: '2024-02-28',
    purchasePrice: 285,
    lastInspectionDate: '2024-12-01',
    notes: 'Battery compartment damaged',
    createdAt: '2024-02-28',
  },
];

const demoProviders: Provider[] = [
  {
    id: 'prov-1',
    name: 'CED Greentech',
    contactName: 'Sarah Wilson',
    email: 'swilson@cedgreentech.com',
    phone: '(561) 555-0101',
    address: '1800 NW 1st Blvd, Gainesville, FL 32609',
    website: 'https://www.cedgreentech.com',
    createdAt: '2024-01-01',
  },
  {
    id: 'prov-2',
    name: 'BayWa r.e.',
    contactName: 'Tom Anderson',
    email: 'tanderson@baywa-re.com',
    phone: '(561) 555-0202',
    address: '2450 Commerce Dr, Orlando, FL 32803',
    website: 'https://www.baywa-re.com',
    createdAt: '2024-02-15',
  },
  {
    id: 'prov-3',
    name: 'Solar Supply Inc.',
    contactName: 'Maria Garcia',
    email: 'mgarcia@solarsupply.com',
    phone: '(561) 555-0303',
    address: '8900 NW 36th Ave, Miami, FL 33147',
    createdAt: '2024-03-20',
  },
];

const categoryLabels: Record<InventoryCategory, string> = {
  panel: 'Solar Panel',
  optimizer: 'Optimizer',
  inverter: 'Inverter',
  cable: 'Cable / Wire',
  racking: 'Racking',
  label: 'Labels',
  battery: 'Battery',
  bos: 'BOS / Electrical',
};

const categoryColors: Record<InventoryCategory, string> = {
  panel: 'bg-blue-100 text-blue-700',
  optimizer: 'bg-purple-100 text-purple-700',
  inverter: 'bg-indigo-100 text-indigo-700',
  cable: 'bg-yellow-100 text-yellow-700',
  racking: 'bg-orange-100 text-orange-700',
  label: 'bg-pink-100 text-pink-700',
  battery: 'bg-green-100 text-green-700',
  bos: 'bg-red-100 text-red-700',
};

const toolCategoryLabels: Record<ToolCategory, string> = {
  drill: 'Drill',
  ladder: 'Ladder',
  crimper: 'Crimper',
  ppe: 'PPE',
  tester: 'Tester',
  other: 'Other',
};

const toolStatusColors: Record<ToolStatus, string> = {
  available: 'bg-green-100 text-green-700',
  in_use: 'bg-blue-100 text-blue-700',
  broken: 'bg-red-100 text-red-700',
  lost: 'bg-gray-100 text-gray-700',
};

const toolStatusLabels: Record<ToolStatus, string> = {
  available: 'Available',
  in_use: 'In Use',
  broken: 'Broken',
  lost: 'Lost',
};

export const InventoryModule: React.FC<InventoryModuleProps> = ({ jobs = [], onUpdateJob, currentUser, standaloneRmas = [], onCreateStandaloneRma, onUpdateStandaloneRma, contractors = [] }) => {
  const [activeTab, setActiveTab] = useState<'equipment' | 'tools' | 'providers'>('equipment');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [showToolModal, setShowToolModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editingTool, setEditingTool] = useState<ToolItem | null>(null);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);

  // Use state for inventory/tools/providers to allow editing
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>(() => loadInventory());

  const updateInventory = (items: InventoryItem[]) => {
    setInventoryItems(items);
    saveInventory(items);
  };

  // Re-hydrate when sync writes fresh inventory to localStorage. Without this the
  // list is a one-shot snapshot taken at mount: a warehouse tab left open all day
  // never sees another device's items, and its next save pushes that stale array
  // up. Both the pull cycle and the Realtime handler fire this event.
  useEffect(() => {
    const onRemoteUpdate = (e: Event) => {
      const keys = (e as CustomEvent<{ keys: string[] }>).detail?.keys ?? [];
      if (keys.includes('solarops_inventory')) setInventoryItems(loadInventory());
      if (keys.includes('solarops_tools')) setToolItems(loadTools());
    };
    window.addEventListener('solarflow-remote-update', onRemoteUpdate as EventListener);
    return () => window.removeEventListener('solarflow-remote-update', onRemoteUpdate as EventListener);
  }, []);

  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const toggleItemExpand = (id: string) => setExpandedItems(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const isAdmin = currentUser?.role === 'admin';
  const [editingReceipt, setEditingReceipt] = useState<{ itemId: string; receipt: StockReceipt } | null>(null);

  // Admin edit of a receiving-history entry. Adjusts the item quantity by the
  // change in this receipt's quantity, and stamps editedAt/editedBy.
  const applyReceiptEdit = (itemId: string, updated: StockReceipt) => {
    updateInventory(inventoryItems.map(i => {
      if (i.id !== itemId) return i;
      const old = (i.receipts ?? []).find(r => r.id === updated.id);
      const qtyDelta = (updated.quantity ?? 0) - (old?.quantity ?? 0);
      return {
        ...i,
        quantity: Math.max(0, i.quantity + qtyDelta),
        receipts: (i.receipts ?? []).map(r => r.id === updated.id ? updated : r),
      };
    }));
    setEditingReceipt(null);
  };
  // Tools were `useState(demoTools)` with nothing behind it: every edit, status
  // change and assignment was lost on reload and no other device ever saw one.
  // Seed from the demo set only when the store is genuinely empty.
  const [toolItems, setToolItems] = useState<ToolItem[]>(() => {
    const stored = loadTools();
    if (stored.length > 0) return stored;
    saveTools(demoTools);
    return demoTools;
  });

  const updateTools = (tools: ToolItem[]) => {
    setToolItems(tools);
    saveTools(tools);
  };
  const [providerItems, setProviderItems] = useState<Provider[]>(demoProviders);

  // Jobs carrying contractor-logged parts that came from stock and have not been
  // applied yet. The office-confirm queue.
  const pendingPulls = useMemo(
    () => jobs
      .map(job => ({ job, parts: pendingStockParts(job.contractorParts) }))
      .filter(({ parts }) => parts.length > 0),
    [jobs],
  );

  /**
   * Confirm one job's field pulls: decrement stock and stamp the parts, in a
   * single pass. `applyPartsToInventory` is idempotent, so a double click is a
   * no-op rather than a double decrement.
   */
  const applyPulls = (job: Job) => {
    const res = applyPartsToInventory(
      inventoryItems,
      job.contractorParts ?? [],
      currentUser?.email ?? currentUser?.name ?? 'office',
    );
    if (res.appliedCount === 0) return;
    updateInventory(res.items);
    // Write the stamps back, otherwise the queue re-offers the same pull and the
    // only thing stopping a second decrement is the guard we just relied on.
    onUpdateJob?.({ ...job, contractorParts: res.parts });
  };

  // Filter inventory
  const filteredInventory = inventoryItems.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.partNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    const matchesCategory = filterCategory === 'all' || item.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // Filter tools
  const filteredTools = toolItems.filter((tool) => {
    const matchesSearch =
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.serialNumber?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === 'all' || tool.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // Filter providers
  const filteredProviders = providerItems.filter((provider) =>
    provider.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    provider.contactName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Calculate totals
  const totalInventoryValue = inventoryItems.reduce(
    (sum, item) => sum + item.quantity * item.unitCost,
    0
  );
  const lowStockItems = inventoryItems.filter(
    (item) => item.quantity <= item.minStockThreshold
  );
  const toolsInUse = toolItems.filter((tool) => tool.status === 'in_use').length;
  const toolsAvailable = toolItems.filter((tool) => tool.status === 'available').length;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">Inventory</h1>
          <div className="flex gap-2">
            {activeTab === 'equipment' && (
              <>
                <button
                  onClick={() => setShowReceiveModal(true)}
                  title="Quickly receive stock with a provenance photo (invoice / RMA label)"
                  className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
                >
                  <PackagePlus className="w-4 h-4" />
                  Receive Stock
                </button>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600"
                >
                  <Plus className="w-4 h-4" />
                  Add Item
                </button>
              </>
            )}
            {activeTab === 'tools' && (
              <button
                onClick={() => setShowToolModal(true)}
                className="flex items-center gap-2 px-3 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600"
              >
                <Plus className="w-4 h-4" />
                Add Tool
              </button>
            )}
            {activeTab === 'providers' && (
              <button
                onClick={() => setShowProviderModal(true)}
                className="flex items-center gap-2 px-3 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600"
              >
                <Plus className="w-4 h-4" />
                Add Provider
              </button>
            )}
          </div>
        </div>

        {/* Search & Filter */}
        <div className="mt-4 flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            {activeTab === 'equipment' && (
              <>
                <option value="all">All Categories</option>
                <option value="panel">Panels</option>
                <option value="optimizer">Optimizers</option>
                <option value="inverter">Inverters</option>
                <option value="cable">Cables</option>
                <option value="racking">Racking</option>
                <option value="label">Labels</option>
                <option value="battery">Batteries</option>
              </>
            )}
            {activeTab === 'tools' && (
              <>
                <option value="all">All Tools</option>
                <option value="drill">Drills</option>
                <option value="ladder">Ladders</option>
                <option value="crimper">Crimpers</option>
                <option value="ppe">PPE</option>
                <option value="tester">Testers</option>
              </>
            )}
            {activeTab === 'providers' && (
              <option value="all">All Providers</option>
            )}
          </select>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-1 bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('equipment')}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'equipment'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Equipment ({demoInventory.length})
          </button>
          <button
            onClick={() => setActiveTab('tools')}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'tools'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tools ({toolItems.length})
          </button>
          <button
            onClick={() => setActiveTab('providers')}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'providers'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Providers ({demoProviders.length})
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {activeTab === 'equipment' && (
          <>
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-green-500" />
                <span className="text-xs text-slate-500">Total Value</span>
              </div>
              <p className="text-lg font-bold text-slate-900">
                {formatMoney(totalInventoryValue, { decimals: 0 })}
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-4 h-4 text-blue-500" />
                <span className="text-xs text-slate-500">Items</span>
              </div>
              <p className="text-lg font-bold text-slate-900">{demoInventory.length}</p>
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-xs text-slate-500">Low Stock</span>
              </div>
              <p className="text-lg font-bold text-slate-900">{lowStockItems.length}</p>
            </div>
          </>
        )}
        {activeTab === 'tools' && (
          <>
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <Wrench className="w-4 h-4 text-slate-500" />
                <span className="text-xs text-slate-500">Total Tools</span>
              </div>
              <p className="text-lg font-bold text-slate-900">{toolItems.length}</p>
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-xs text-slate-500">Available</span>
              </div>
              <p className="text-lg font-bold text-green-600">{toolsAvailable}</p>
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-4 h-4 text-blue-500" />
                <span className="text-xs text-slate-500">In Use</span>
              </div>
              <p className="text-lg font-bold text-blue-600">{toolsInUse}</p>
            </div>
          </>
        )}
        {activeTab === 'providers' && (
          <div className="col-span-3 bg-white rounded-xl p-4 border border-slate-200">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-slate-500" />
              <span className="text-xs text-slate-500">Active Providers</span>
            </div>
            <p className="text-lg font-bold text-slate-900">{demoProviders.length}</p>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-4 pb-24">
        {/* Equipment Tab */}
        {activeTab === 'equipment' && (
          <div className="space-y-3">
            {/* Field pulls awaiting confirmation. Contractors record what they
                took and from where; stock only moves when the office applies it
                here, so a mistaken field entry can never corrupt inventory. */}
            {pendingPulls.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <h3 className="font-semibold text-amber-900 text-sm">
                    Field pulls awaiting confirmation ({pendingPulls.length})
                  </h3>
                </div>
                {pendingPulls.map(({ job, parts }) => (
                  <div key={job.id} className="bg-white rounded-lg border border-amber-200 p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-sm font-semibold text-slate-800">
                        {serviceOrderNo(job.woNumber)} · {job.clientName}
                      </span>
                      <button
                        onClick={() => applyPulls(job)}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg transition-colors"
                      >
                        Apply to stock
                      </button>
                    </div>
                    <ul className="space-y-0.5">
                      {parts.map(p => (
                        <li key={p.id} className="text-xs text-slate-600">
                          {p.quantity} x {p.name}
                          <span className="text-slate-400"> from {p.fromLocation}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            {filteredInventory.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-xl border border-slate-200 p-4"
              >
                <div className="flex items-start gap-3 mb-2">
                  {/* Thumbnail */}
                  <div className="w-14 h-14 rounded-lg overflow-hidden border border-slate-100 flex-shrink-0 bg-slate-50 flex items-center justify-center">
                    {item.imageUrl
                      ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                      : <Package className="w-6 h-6 text-slate-300" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-slate-900 truncate">{item.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${categoryColors[item.category]}`}>
                        {categoryLabels[item.category]}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      SKU: {item.sku}
                      {item.partNumber && <span className="ml-2 text-slate-400">| P/N: {item.partNumber}</span>}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-slate-900">
                      {item.quantity} <span className="text-xs font-normal text-slate-500">{item.unitOfMeasure}</span>
                    </p>
                    {item.quantity <= item.minStockThreshold && (
                      <span className="text-xs text-amber-600 flex items-center gap-1 justify-end">
                        <AlertTriangle className="w-3 h-3" /> Low Stock
                      </span>
                    )}
                  </div>
                </div>
                {/* Where the stock actually sits. One chip per location holding
                    units, so the same part in the locker and in a contractor's
                    van reads at a glance instead of as one opaque total. */}
                {Object.entries(item.stockByLocation ?? {}).filter(([, n]) => n > 0).length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {Object.entries(item.stockByLocation ?? {})
                      .filter(([, n]) => n > 0)
                      .sort((a, b) => b[1] - a[1])
                      .map(([loc, n]) => (
                        <span key={loc} className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                          {loc}: <span className="font-semibold text-slate-800">{n}</span>
                        </span>
                      ))}
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3 text-slate-500">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {item.location}
                    </span>
                    <span className="flex items-center gap-1">
                      <DollarSign className="w-3 h-3" />
                      ${item.unitCost}/unit
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-700">
                      Total: {formatMoney(item.quantity * item.unitCost, { decimals: 0 })}
                    </span>
                    <button
                      onClick={() => toggleItemExpand(item.id)}
                      title="Receiving history"
                      className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1"
                    >
                      {(item.receipts?.length ?? 0) > 0 && (
                        <span className="text-xs font-medium">{item.receipts!.length}</span>
                      )}
                      {expandedItems.has(item.id)
                        ? <ChevronUp className="w-4 h-4" />
                        : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => {
                        setEditingItem(item);
                        setShowEditModal(true);
                      }}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${item.name}"?`)) {
                          // Tombstones the item so the delete reaches other devices.
                          setInventoryItems(deleteInventoryItem(item.id));
                        }
                      }}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Receiving history (chevron) */}
                {expandedItems.has(item.id) && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="text-xs font-medium text-slate-600 mb-2">Receiving history</p>
                    {(item.receipts?.length ?? 0) === 0 ? (
                      <p className="text-xs text-slate-400">No receiving history recorded for this item.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {[...(item.receipts ?? [])].reverse().map((r) => (
                          <div key={r.id} className="flex items-center gap-2 text-xs flex-wrap bg-slate-50 rounded-lg px-2 py-1.5">
                            <span className="font-semibold text-emerald-700">+{r.quantity}</span>
                            <span className="text-slate-500">{new Date(r.receivedAt).toLocaleDateString()}</span>
                            <span className="flex items-center gap-1 text-slate-500">
                              <MapPin className="w-3 h-3" />{r.location ?? item.location}
                            </span>
                            {r.alarmBadge && (
                              <span className="px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 font-medium">Alarm: {r.alarmBadge}</span>
                            )}
                            {r.receivedBy && (
                              <span className="flex items-center gap-1 text-slate-500">
                                <Users className="w-3 h-3" />{r.receivedBy}
                              </span>
                            )}
                            {r.rmaNumber && (
                              <span className="px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 font-medium">RMA {r.rmaNumber}</span>
                            )}
                            {r.provenanceImage && (
                              <a href={r.provenanceImage} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline">
                                <ImageIcon className="w-3 h-3" />
                                {r.provenanceType === 'rma_label' ? 'RMA label' : r.provenanceType === 'invoice' ? 'Invoice' : 'Photo'}
                              </a>
                            )}
                            {r.note && <span className="text-slate-400 italic truncate">{r.note}</span>}
                            {r.editedAt && (
                              <span className="text-amber-600 italic">
                                edited {new Date(r.editedAt).toLocaleDateString()}{r.editedBy ? ` by ${r.editedBy}` : ''}
                              </span>
                            )}
                            {isAdmin && (
                              <button
                                onClick={() => setEditingReceipt({ itemId: item.id, receipt: r })}
                                title="Edit entry (admin only)"
                                className="ml-auto p-1 text-blue-600 hover:bg-blue-50 rounded"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {filteredInventory.length === 0 && (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No items found</p>
              </div>
            )}
          </div>
        )}

        {/* Tools Tab */}
        {activeTab === 'tools' && (
          <div className="space-y-3">
            {filteredTools.map((tool) => (
              <div
                key={tool.id}
                className="bg-white rounded-xl border border-slate-200 p-4"
              >
                <div className="flex items-start gap-3 mb-2">
                  {/* Thumbnail */}
                  <div className="w-14 h-14 rounded-lg overflow-hidden border border-slate-100 flex-shrink-0 bg-slate-50 flex items-center justify-center">
                    {tool.imageUrl
                      ? <img src={tool.imageUrl} alt={tool.name} className="w-full h-full object-cover" />
                      : <Wrench className="w-6 h-6 text-slate-300" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-slate-900 truncate">{tool.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${toolStatusColors[tool.status]}`}>
                        {toolStatusLabels[tool.status]}
                      </span>
                    </div>
                    {tool.serialNumber && (
                      <p className="text-xs text-slate-500">SN: {tool.serialNumber}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-sm font-medium text-slate-700">
                      ${tool.purchasePrice}
                    </span>
                    {/* Check-out / check-in. Persisted and synced, so the office
                        can see who is holding a tool from any device. */}
                    <select
                      value={tool.assignedContractorId ?? ''}
                      onChange={e => {
                        const id = e.target.value || null;
                        const name = contractors.find(c => c.id === id)?.businessName;
                        updateTools(toolItems.map(t =>
                          t.id === tool.id ? setToolAssignment(t, id, name) : t
                        ));
                      }}
                      className="text-xs px-2 py-1 border border-slate-200 rounded-lg bg-white max-w-[9rem]"
                    >
                      <option value="">Available</option>
                      {contractors.map(c => (
                        <option key={c.id} value={c.id}>{c.businessName || c.contactName}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        setEditingTool(tool);
                        setShowEditModal(true);
                      }}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${tool.name}"?`)) setToolItems(deleteTool(tool.id));
                      }}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3 text-slate-500">
                    <span className="flex items-center gap-1">
                      <Wrench className="w-3 h-3" />
                      {toolCategoryLabels[tool.category]}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {tool.location}
                    </span>
                  </div>
                  {tool.assignedTo && (
                    <span className="text-xs text-blue-600">Assigned to: {tool.assignedTo}</span>
                  )}
                </div>
              </div>
            ))}
            {filteredTools.length === 0 && (
              <div className="text-center py-12">
                <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No tools found</p>
              </div>
            )}
          </div>
        )}

        {/* Providers Tab */}
        {activeTab === 'providers' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredProviders.map((provider) => (
              <div
                key={provider.id}
                className="bg-white rounded-xl border border-slate-200 p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-slate-900">{provider.name}</h3>
                  <button
                    onClick={() => {
                      setEditingProvider(provider);
                      setShowEditModal(true);
                    }}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-2 text-sm">
                  <p className="text-slate-600 flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-400" />
                    {provider.contactName}
                  </p>
                  <p className="text-slate-600 flex items-center gap-2">
                    <span className="w-4 h-4 text-slate-400 flex items-center justify-center text-xs">📧</span>
                    {provider.email}
                  </p>
                  <p className="text-slate-600 flex items-center gap-2">
                    <span className="w-4 h-4 text-slate-400 flex items-center justify-center text-xs">📞</span>
                    {provider.phone}
                  </p>
                  <p className="text-slate-500 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    {provider.address}
                  </p>
                </div>
              </div>
            ))}
            {filteredProviders.length === 0 && (
              <div className="col-span-2 text-center py-12">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No providers found</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Item Modal */}
      {showAddModal && (
        <AddInventoryModal
          onClose={() => setShowAddModal(false)}
          onAdd={(item) => {
            updateInventory([...inventoryItems, item]);
            setShowAddModal(false);
          }}
        />
      )}

      {/* Receive Stock Modal */}
      {showReceiveModal && (
        <ReceiveStockModal
          items={inventoryItems}
          jobs={jobs}
          currentUser={currentUser}
          contractors={contractors}
          standaloneRmas={standaloneRmas}
          onCreateStandaloneRma={onCreateStandaloneRma}
          onUpdateStandaloneRma={onUpdateStandaloneRma}
          onClose={() => setShowReceiveModal(false)}
          onReceive={(updatedItems) => {
            updateInventory(updatedItems);
            setShowReceiveModal(false);
          }}
          onUpdateJob={onUpdateJob}
        />
      )}

      {/* Edit receiving entry (admin only) */}
      {editingReceipt && isAdmin && (
        <ReceiptEditModal
          receipt={editingReceipt.receipt}
          editorName={currentUser?.name ?? currentUser?.email}
          onClose={() => setEditingReceipt(null)}
          onSave={(updated) => applyReceiptEdit(editingReceipt.itemId, updated)}
        />
      )}

      {/* Add Tool Modal */}
      {showToolModal && (
        <AddToolModal onClose={() => setShowToolModal(false)} />
      )}

      {/* Add Provider Modal */}
      {showProviderModal && (
        <AddProviderModal onClose={() => setShowProviderModal(false)} />
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <EditItemModal
          item={editingItem}
          tool={editingTool}
          provider={editingProvider}
          onClose={() => {
            setShowEditModal(false);
            setEditingItem(null);
            setEditingTool(null);
            setEditingProvider(null);
          }}
          onSaveInventory={(item) => {
            updateInventory(inventoryItems.map(i => i.id === item.id ? item : i));
            setShowEditModal(false);
            setEditingItem(null);
          }}
          onSaveTool={(tool) => {
            updateTools(toolItems.map(t => t.id === tool.id ? tool : t));
            setShowEditModal(false);
            setEditingTool(null);
          }}
          onSaveProvider={(provider) => {
            setProviderItems(providerItems.map(p => p.id === provider.id ? provider : p));
            setShowEditModal(false);
            setEditingProvider(null);
          }}
        />
      )}
    </div>
  );
};

// Add Inventory Modal
// ── Receive Stock, quick add into stock with a provenance photo + open-RMA match ──
// ── Warehouse / location options (shared, locally persisted) ─────────────────────
// Pictures attached to a receiving entry are capped at 1.2 MB before storage.
const RECEIPT_PHOTO_MAX_BYTES = Math.round(1.2 * 1024 * 1024);
const STD_WAREHOUSES = ['985', 'Conexsol Van', 'Office'];
const CUSTOM_WAREHOUSES_KEY = 'solarops:custom-warehouses';

function loadCustomWarehouses(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_WAREHOUSES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Persist a newly-typed warehouse so it shows up in the dropdown next time. */
function addCustomWarehouse(name: string) {
  const n = name.trim();
  if (!n || STD_WAREHOUSES.includes(n)) return;
  const list = loadCustomWarehouses();
  if (list.includes(n)) return;
  try {
    localStorage.setItem(CUSTOM_WAREHOUSES_KEY, JSON.stringify([...list, n]));
  } catch {
    /* ignore storage quota / private-mode errors */
  }
}

// ── Admin edit of a single receiving-history entry ──────────────────────────────
interface ReceiptEditModalProps {
  receipt: StockReceipt;
  editorName?: string;
  onClose: () => void;
  onSave: (updated: StockReceipt) => void;
}

const ReceiptEditModal: React.FC<ReceiptEditModalProps> = ({ receipt, editorName, onClose, onSave }) => {
  const [qty, setQty] = useState(String(receipt.quantity));
  const [location, setLocation] = useState(receipt.location ?? '');
  const [receivedDate, setReceivedDate] = useState(receipt.receivedAt.slice(0, 10));
  const [note, setNote] = useState(receipt.note ?? '');
  const [image, setImage] = useState<string | undefined>(receipt.provenanceImage);
  const [provType, setProvType] = useState<'invoice' | 'rma_label' | 'other'>(receipt.provenanceType ?? 'other');
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Warehouse dropdown: standard + locally-saved custom + this receipt's own
  // location (so an unusual one stays selectable). "__add__" reveals an input.
  const [whTick, setWhTick] = useState(0);
  const [addingWh, setAddingWh] = useState(false);
  const [newWh, setNewWh] = useState('');
  const warehouseOptions = useMemo(() => {
    const set = new Set<string>([...STD_WAREHOUSES, ...loadCustomWarehouses()]);
    if (receipt.location) set.add(receipt.location);
    return Array.from(set);
  }, [receipt.location, whTick]);

  const confirmNewWarehouse = () => {
    const n = newWh.trim();
    if (!n) return;
    addCustomWarehouse(n);
    setLocation(n);
    setNewWh('');
    setAddingWh(false);
    setWhTick(t => t + 1);
  };

  const save = async () => {
    setErr(null);
    const q = parseInt(qty, 10);
    if (!q || q <= 0) { setErr('Quantity must be greater than 0.'); return; }
    const receivedAt = receivedDate === receipt.receivedAt.slice(0, 10)
      ? receipt.receivedAt
      : new Date(receivedDate + 'T12:00:00').toISOString();

    // Upload a freshly-attached photo to Storage and keep only the URL. The
    // ImageUploader already capped it at 1.2 MB; on upload failure we fall back
    // to the (already-compressed) data URL so the edit is never lost.
    let provenanceUrl: string | undefined = image;
    if (image && image.startsWith('data:')) {
      setSaving(true);
      try {
        const blob = await (await fetch(image)).blob();
        const { url } = await uploadPhotoToStorage(blob, 'stock-receipt', receipt.id);
        provenanceUrl = url;
      } catch {
        provenanceUrl = image;
      } finally {
        setSaving(false);
      }
    }

    onSave({
      ...receipt,
      quantity: q,
      location: location.trim() || undefined,
      receivedAt,
      note: note.trim() || undefined,
      provenanceImage: provenanceUrl || undefined,
      provenanceType: provenanceUrl ? provType : undefined,
      editedAt: new Date().toISOString(),
      editedBy: editorName || 'admin',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Edit receiving entry</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          {err && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-xs">
              <AlertTriangle className="w-3.5 h-3.5" /> {err}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Quantity</span>
              <input type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Date received</span>
              <input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </label>
          </div>
          <div className="block">
            <span className="text-sm font-medium text-slate-700">Warehouse / location</span>
            {addingWh ? (
              <div className="mt-1 flex gap-2">
                <input
                  autoFocus
                  value={newWh}
                  onChange={e => setNewWh(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmNewWarehouse(); } if (e.key === 'Escape') { setAddingWh(false); setNewWh(''); } }}
                  placeholder="New warehouse name"
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                />
                <button type="button" onClick={confirmNewWarehouse} className="px-3 py-2 rounded-lg bg-orange-500 text-white text-sm hover:bg-orange-600">Add</button>
                <button type="button" onClick={() => { setAddingWh(false); setNewWh(''); }} className="px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-100">Cancel</button>
              </div>
            ) : (
              <select
                value={location}
                onChange={e => { if (e.target.value === '__add__') { setAddingWh(true); } else { setLocation(e.target.value); } }}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="">Select…</option>
                {warehouseOptions.map(w => <option key={w} value={w}>{w}</option>)}
                <option value="__add__">+ Add new warehouse…</option>
              </select>
            )}
          </div>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Note</span>
            <input value={note} onChange={e => setNote(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </label>
          {/* Provenance photo (auto-compressed to a 1.2 MB max) */}
          <div className="space-y-2">
            <ImageUploader value={image} onChange={setImage} maxBytes={RECEIPT_PHOTO_MAX_BYTES} label="Photo (invoice / RMA label)" />
            {image && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-500">Type:</span>
                {(['invoice', 'rma_label', 'other'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setProvType(t)} className={`px-2 py-1 rounded-full text-xs ${provType === t ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {t === 'rma_label' ? 'RMA label' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Created {new Date(receipt.receivedAt).toLocaleString()}{receipt.receivedBy ? ` by ${receipt.receivedBy}` : ''}.
            {receipt.editedAt && ` Last edited ${new Date(receipt.editedAt).toLocaleString()}${receipt.editedBy ? ` by ${receipt.editedBy}` : ''}.`}
          </p>
        </div>
        <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
};

interface ReceiveStockModalProps {
  items: InventoryItem[];
  jobs: Job[];
  currentUser?: User | null;
  contractors?: Contractor[];
  standaloneRmas?: RMAEntry[];
  onCreateStandaloneRma?: (entry: RMAEntry) => void;
  onUpdateStandaloneRma?: (entry: RMAEntry) => void;
  onClose: () => void;
  onReceive: (updatedItems: InventoryItem[]) => void;
  onUpdateJob?: (job: Job) => void;
}

const RECEIVE_CATEGORIES: InventoryCategory[] = ['panel', 'optimizer', 'inverter', 'cable', 'racking', 'label', 'battery', 'bos'];

type WarehouseType = '' | '985' | 'conexsol_van' | 'office' | 'contractor' | 'pickup';
const WAREHOUSE_LABELS: Record<Exclude<WarehouseType, '' | 'contractor' | 'pickup'>, string> = {
  '985': '985',
  conexsol_van: 'Conexsol Van',
  office: 'Office',
};

const ReceiveStockModal: React.FC<ReceiveStockModalProps> = ({ items, jobs, currentUser, contractors = [], standaloneRmas = [], onCreateStandaloneRma, onUpdateStandaloneRma, onClose, onReceive, onUpdateJob }) => {
  const [showCreateRma, setShowCreateRma] = useState(false);
  const [mode, setMode] = useState<'existing' | 'new'>(items.length ? 'existing' : 'new');
  const [existingId, setExistingId] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState<InventoryCategory>('bos');
  const [warehouse, setWarehouse] = useState<WarehouseType>('');
  const [contractorId, setContractorId] = useState('');
  const [pickupLocation, setPickupLocation] = useState('');
  const [alarmBadge, setAlarmBadge] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [qty, setQty] = useState('1');
  const [image, setImage] = useState<string | undefined>(undefined);
  const [provType, setProvType] = useState<'invoice' | 'rma_label' | 'other'>('invoice');
  const [rmaKey, setRmaKey] = useState('');
  const [markReceived, setMarkReceived] = useState(true);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);

  // Open RMAs across all service orders, awaiting a replacement-part delivery.
  const openRmas = useMemo(() => {
    const out: { key: string; kind: 'job' | 'standalone'; jobId?: string; entry: RMAEntry; label: string }[] = [];
    for (const j of jobs) {
      for (const e of (j.rmaEntries ?? [])) {
        const s = e.rmaStatus ?? e.status;
        if (s === 'paid' || s === 'received') continue; // already closed / delivered
        out.push({
          key: `job::${j.id}::${e.id}`,
          kind: 'job',
          jobId: j.id,
          entry: e,
          label: `${e.rmaNumber} · ${e.manufacturer} ${e.partDescription}`,
        });
      }
    }
    for (const e of standaloneRmas) {
      const s = e.rmaStatus ?? e.status;
      if (s === 'paid' || s === 'received') continue;
      out.push({
        key: `sa::${e.id}`,
        kind: 'standalone',
        entry: e,
        label: `${e.rmaNumber} · ${e.manufacturer} ${e.partDescription}${e.linkedJobId ? '' : ' (unlinked)'}`,
      });
    }
    return out;
  }, [jobs, standaloneRmas]);

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q));
  }, [items, itemSearch]);

  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setErr(null);
    const q = parseInt(qty, 10);
    if (!q || q <= 0) { setErr('Enter a quantity greater than 0.'); return; }
    if (mode === 'existing' && !existingId) { setErr('Pick the item this delivery goes into.'); return; }
    if (mode === 'new' && (!name.trim() || !sku.trim())) { setErr('A new item needs at least a name and SKU.'); return; }
    if (!warehouse) { setErr('Select a warehouse / location.'); return; }
    if (warehouse === 'contractor' && !contractorId) { setErr('Select the contractor.'); return; }
    if (warehouse === 'pickup' && !pickupLocation.trim()) { setErr('Enter the pickup location.'); return; }

    setSaving(true);
    const sel = rmaKey ? openRmas.find(r => r.key === rmaKey) : undefined;
    const receiptId = `rcpt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Upload the provenance image to Storage and keep only the URL. Storing the
    // base64 data URL inline overflows the localStorage quota and silently loses
    // the whole item on save.
    let provenanceUrl: string | undefined = image && !image.startsWith('data:') ? image : undefined;
    if (image && image.startsWith('data:')) {
      try {
        const blob = await (await fetch(image)).blob();
        const { url } = await uploadPhotoToStorage(blob, 'stock-receipt', receiptId);
        provenanceUrl = url ?? undefined;
      } catch {
        provenanceUrl = undefined;
      }
    }
    setSaving(false);

    const selectedContractor = contractors.find(c => c.id === contractorId);
    const receiptLocation =
      warehouse === 'contractor'
        ? `Contractor: ${selectedContractor?.businessName || selectedContractor?.email || 'unknown'}`
        : warehouse === 'pickup'
          ? `Pickup${pickupLocation.trim() ? ': ' + pickupLocation.trim() : ''}`
          : WAREHOUSE_LABELS[warehouse as Exclude<WarehouseType, '' | 'contractor' | 'pickup'>] ?? 'Unassigned';

    const receipt: StockReceipt = {
      id: receiptId,
      receivedAt: new Date().toISOString(),
      quantity: q,
      location: receiptLocation,
      contractorId: warehouse === 'contractor' ? contractorId : undefined,
      alarmBadge: warehouse === 'pickup' ? (alarmBadge.trim() || undefined) : undefined,
      provenanceImage: provenanceUrl,
      provenanceType: provType,
      rmaEntryId: sel?.entry.id,
      rmaNumber: sel?.entry.rmaNumber,
      jobId: sel?.jobId,
      note: note.trim() || undefined,
      receivedBy: currentUser?.name ?? currentUser?.email ?? undefined,
    };

    let updatedItems: InventoryItem[];
    if (mode === 'existing') {
      if (!existingId) { setErr('Pick the item this delivery goes into.'); return; }
      // Stock lands in the location it was received into (a contractor's van
      // included), not in one flat pile. `adjustLocationQty` recomputes the total.
      updatedItems = items.map(i =>
        i.id === existingId
          ? { ...adjustLocationQty(i, receiptLocation, q), receipts: [...(i.receipts ?? []), receipt] }
          : i,
      );
    } else {
      if (!name.trim() || !sku.trim()) { setErr('A new item needs at least a name and SKU.'); return; }
      const newItem: InventoryItem = {
        id: `inv-${Date.now()}`,
        sku: sku.trim(),
        name: name.trim(),
        category,
        description: '',
        quantity: q,
        stockByLocation: { [receiptLocation]: q },
        unitOfMeasure: 'unit',
        location: receiptLocation,
        minStockThreshold: 0,
        unitCost: parseFloat(unitCost) || 0,
        purchaseDate: new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString(),
        receipts: [receipt],
      };
      updatedItems = [...items, newItem];
    }

    onReceive(updatedItems);

    // Match the requested RMA to this delivery → mark it received.
    if (sel && markReceived) {
      if (sel.kind === 'job' && onUpdateJob) {
        const job = jobs.find(j => j.id === sel.jobId);
        if (job) {
          const updatedEntries = (job.rmaEntries ?? []).map(e =>
            e.id === sel.entry.id ? { ...e, status: 'received' as const } : e,
          );
          onUpdateJob({ ...job, rmaEntries: updatedEntries });
        }
      } else if (sel.kind === 'standalone' && onUpdateStandaloneRma) {
        onUpdateStandaloneRma({ ...sel.entry, status: 'received' });
      }
    }
  };

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-100 sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            <PackagePlus className="w-5 h-5 text-emerald-600" />
            <h3 className="font-semibold text-slate-900">Receive Stock</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-4">
          {err && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-xs">
              <AlertTriangle className="w-3.5 h-3.5" /> {err}
            </div>
          )}

          {/* Existing vs new */}
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-sm">
            <button type="button" onClick={() => setMode('existing')} className={`px-3 py-1.5 rounded-md ${mode === 'existing' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>Existing item</button>
            <button type="button" onClick={() => setMode('new')} className={`px-3 py-1.5 rounded-md ${mode === 'new' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>New item</button>
          </div>

          {mode === 'existing' ? (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Item</label>
              <input value={itemSearch} onChange={e => setItemSearch(e.target.value)} placeholder="Search name or SKU…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              <select
                value={existingId}
                onChange={e => setExistingId(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="">Select an item…</option>
                {filteredItems.map(i => <option key={i.id} value={i.id}>{i.name} · {i.sku} (qty {i.quantity})</option>)}
              </select>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <label className="block col-span-2">
                <span className="text-sm font-medium text-slate-700">Name</span>
                <input value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">SKU</span>
                <input value={sku} onChange={e => setSku(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Category</span>
                <select value={category} onChange={e => setCategory(e.target.value as InventoryCategory)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
                  {RECEIVE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Unit cost ($)</span>
                <input type="number" value={unitCost} onChange={e => setUnitCost(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              </label>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Warehouse / location</span>
              <select value={warehouse} onChange={e => setWarehouse(e.target.value as WarehouseType)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">Select…</option>
                <option value="985">985</option>
                <option value="conexsol_van">Conexsol Van</option>
                <option value="office">Office</option>
                <option value="contractor">Contractor</option>
                <option value="pickup">Pickup</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Quantity received</span>
              <input type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </label>
          </div>

          {warehouse === 'contractor' && (
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Contractor</span>
              <select value={contractorId} onChange={e => setContractorId(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">Select contractor…</option>
                {contractors.map(c => <option key={c.id} value={c.id}>{c.businessName || c.email}</option>)}
              </select>
              {contractors.length === 0 && <span className="text-xs text-slate-400">No contractors found.</span>}
            </label>
          )}

          {warehouse === 'pickup' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Pickup location</span>
                <input value={pickupLocation} onChange={e => setPickupLocation(e.target.value)} placeholder="Address / site" className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Alarm badge</span>
                <input value={alarmBadge} onChange={e => setAlarmBadge(e.target.value)} placeholder="Badge / access code" className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              </label>
            </div>
          )}

          {/* Provenance photo */}
          <div className="space-y-2">
            <ImageUploader value={image} onChange={setImage} label="Provenance photo (invoice / RMA label)" />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-500">Type:</span>
              {(['invoice', 'rma_label', 'other'] as const).map(t => (
                <button key={t} type="button" onClick={() => setProvType(t)} className={`px-2 py-1 rounded-full text-xs ${provType === t ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {t === 'rma_label' ? 'RMA label' : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Open RMA match */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-700">Match an open RMA (optional)</label>
              {onCreateStandaloneRma && (
                <button type="button" onClick={() => setShowCreateRma(true)} className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700">
                  <Plus className="w-3.5 h-3.5" /> New RMA
                </button>
              )}
            </div>
            <select value={rmaKey} onChange={e => setRmaKey(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">No RMA, regular stock</option>
              {openRmas.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
            {openRmas.length === 0 && <p className="text-xs text-slate-400">No open RMAs found.</p>}
            {rmaKey && (
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={markReceived} onChange={e => setMarkReceived(e.target.checked)} />
                Mark this RMA as received (matched by this delivery)
              </label>
            )}
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Note (optional)</span>
            <input value={note} onChange={e => setNote(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </label>
        </div>

        <div className="p-4 border-t border-slate-100 flex justify-end gap-2 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
          <button onClick={submit} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60">
            <PackagePlus className="w-4 h-4" /> {saving ? 'Saving…' : 'Receive'}
          </button>
        </div>
      </div>
    </div>
    {showCreateRma && onCreateStandaloneRma && (
      <RmaCreateModal
        jobs={jobs}
        currentUserName={currentUser?.name ?? currentUser?.email}
        onClose={() => setShowCreateRma(false)}
        onCreate={(entry) => { onCreateStandaloneRma(entry); setRmaKey(`sa::${entry.id}`); }}
      />
    )}
    </>
  );
};

interface AddInventoryModalProps {
  onClose: () => void;
  onAdd: (item: InventoryItem) => void;
}

const AddInventoryModal: React.FC<AddInventoryModalProps> = ({ onClose, onAdd }) => {
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    partNumber: '',
    category: 'panel' as InventoryCategory,
    description: '',
    quantity: 0,
    unitOfMeasure: 'unit' as UnitOfMeasure,
    location: '',
    minStockThreshold: 10,
    unitCost: 0,
    purchaseDate: new Date().toISOString().split('T')[0],
    imageUrl: undefined as string | undefined,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newItem: InventoryItem = {
      id: `inv-${Date.now()}`,
      sku: formData.sku,
      partNumber: formData.partNumber || undefined,
      name: formData.name,
      category: formData.category,
      description: formData.description,
      quantity: formData.quantity,
      unitOfMeasure: formData.unitOfMeasure,
      location: formData.location,
      minStockThreshold: formData.minStockThreshold,
      unitCost: formData.unitCost,
      purchaseDate: formData.purchaseDate,
      createdAt: new Date().toISOString(),
      imageUrl: formData.imageUrl,
    };
    onAdd(newItem);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center">
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-lg p-4 md:p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Add Inventory Item</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="e.g., REC Alpha Pure 400W Panel"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">SKU</label>
              <input
                type="text"
                required
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="e.g., REC-400W"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Part Number</label>
              <input
                type="text"
                value={formData.partNumber}
                onChange={(e) => setFormData({ ...formData, partNumber: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="e.g., UFO-CL-01-A1"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value as InventoryCategory })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="panel">Solar Panel</option>
              <option value="optimizer">Optimizer</option>
              <option value="inverter">Inverter</option>
              <option value="cable">Cable / Wire</option>
              <option value="racking">Racking</option>
              <option value="bos">BOS / Electrical</option>
              <option value="label">Labels</option>
              <option value="battery">Battery</option>
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
              <input
                type="number"
                required
                min="0"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Unit Cost ($)</label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={formData.unitCost}
                onChange={(e) => setFormData({ ...formData, unitCost: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
              <input
                type="text"
                required
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="e.g., Warehouse A - Rack 1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Min Stock</label>
              <input
                type="number"
                required
                min="0"
                value={formData.minStockThreshold}
                onChange={(e) => setFormData({ ...formData, minStockThreshold: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Purchase Date</label>
            <input
              type="date"
              required
              value={formData.purchaseDate}
              onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
            />
          </div>
          <ImageUploader
            value={formData.imageUrl}
            onChange={(url) => setFormData({ ...formData, imageUrl: url })}
          />
          <button
            type="submit"
            className="w-full py-3 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600"
          >
            Add Item
          </button>
        </form>
      </div>
    </div>
  );
};

// Add Tool Modal
interface AddToolModalProps {
  onClose: () => void;
}

const AddToolModal: React.FC<AddToolModalProps> = ({ onClose }) => {
  const [formData, setFormData] = useState({
    name: '',
    category: 'drill' as ToolCategory,
    serialNumber: '',
    status: 'available' as ToolStatus,
    location: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    purchasePrice: 0,
    notes: '',
    imageUrl: undefined as string | undefined,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center">
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-lg p-4 md:p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Add Tool</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="e.g., DeWalt Hammer Drill 20V"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as ToolCategory })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="drill">Drill</option>
                <option value="ladder">Ladder</option>
                <option value="crimper">Crimper</option>
                <option value="ppe">PPE</option>
                <option value="tester">Tester</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as ToolStatus })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="available">Available</option>
                <option value="in_use">In Use</option>
                <option value="broken">Broken</option>
                <option value="lost">Lost</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Serial Number</label>
              <input
                type="text"
                value={formData.serialNumber}
                onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Price</label>
              <input
                type="number"
                required
                min="0"
                value={formData.purchasePrice}
                onChange={(e) => setFormData({ ...formData, purchasePrice: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
              <input
                type="text"
                required
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="e.g., Tool Cage"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Purchase Date</label>
              <input
                type="date"
                required
                value={formData.purchaseDate}
                onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
            />
          </div>
          <ImageUploader
            value={formData.imageUrl}
            onChange={(url) => setFormData({ ...formData, imageUrl: url })}
          />
          <button
            type="submit"
            className="w-full py-3 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600"
          >
            Add Tool
          </button>
        </form>
      </div>
    </div>
  );
};

// Add Provider Modal
interface AddProviderModalProps {
  onClose: () => void;
}

const AddProviderModal: React.FC<AddProviderModalProps> = ({ onClose }) => {
  const [formData, setFormData] = useState({
    name: '',
    contactName: '',
    email: '',
    phone: '',
    address: '',
    website: '',
    notes: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center">
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-lg p-4 md:p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Add Provider</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="e.g., CED Greentech"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Contact Name</label>
            <input
              type="text"
              required
              value={formData.contactName}
              onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
              <input
                type="tel"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
            <input
              type="text"
              required
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Website (Optional)</label>
            <input
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="https://"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
            />
          </div>
          <button
            type="submit"
            className="w-full py-3 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600"
          >
            Add Provider
          </button>
        </form>
      </div>
    </div>
  );
};

// Edit Item Modal
interface EditItemModalProps {
  item: InventoryItem | null;
  tool: ToolItem | null;
  provider: Provider | null;
  onClose: () => void;
  onSaveInventory: (item: InventoryItem) => void;
  onSaveTool: (tool: ToolItem) => void;
  onSaveProvider: (provider: Provider) => void;
}

const EditItemModal: React.FC<EditItemModalProps> = ({
  item,
  tool,
  provider,
  onClose,
  onSaveInventory,
  onSaveTool,
  onSaveProvider,
}) => {
  const [formData, setFormData] = useState<any>({});

  // Initialize form data based on what we're editing
  React.useEffect(() => {
    if (item) {
      setFormData({ ...item });
    } else if (tool) {
      setFormData({ ...tool });
    } else if (provider) {
      setFormData({ ...provider });
    }
  }, [item, tool, provider]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (item) {
      onSaveInventory(formData as InventoryItem);
    } else if (tool) {
      onSaveTool(formData as ToolItem);
    } else if (provider) {
      onSaveProvider(formData as Provider);
    }
  };

  const getTitle = () => {
    if (item) return 'Edit Inventory Item';
    if (tool) return 'Edit Tool';
    if (provider) return 'Edit Provider';
    return 'Edit Item';
  };

  const renderFormFields = () => {
    if (item) {
      return (
        <>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
            <input
              type="text"
              required
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">SKU</label>
              <input
                type="text"
                required
                value={formData.sku || ''}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <select
                value={formData.category || 'panel'}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="panel">Panel</option>
                <option value="inverter">Inverter</option>
                <option value="optimizer">Optimizer</option>
                <option value="racking">Racking</option>
                <option value="cable">Cable</option>
                <option value="label">Label</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
              <input
                type="number"
                required
                value={formData.quantity || 0}
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Unit of Measure</label>
              <select
                value={formData.unitOfMeasure || 'unit'}
                onChange={(e) => setFormData({ ...formData, unitOfMeasure: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="unit">Unit</option>
                <option value="box">Box</option>
                <option value="roll">Roll</option>
                <option value="ft">Feet</option>
                <option value="kit">Kit</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
              <input
                type="text"
                required
                value={formData.location || ''}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Min Stock</label>
              <input
                type="number"
                required
                value={formData.minStockThreshold || 0}
                onChange={(e) => setFormData({ ...formData, minStockThreshold: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Unit Cost ($)</label>
              <input
                type="number"
                required
                value={formData.unitCost || 0}
                onChange={(e) => setFormData({ ...formData, unitCost: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Purchase Date</label>
              <input
                type="date"
                required
                value={formData.purchaseDate || ''}
                onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
          <ImageUploader
            value={formData.imageUrl}
            onChange={(url) => setFormData({ ...formData, imageUrl: url })}
          />
        </>
      );
    }

    if (tool) {
      return (
        <>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
            <input
              type="text"
              required
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <select
                value={formData.category || 'drill'}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="drill">Drill</option>
                <option value="ladder">Ladder</option>
                <option value="meter">Meter</option>
                <option value="tool">Tool</option>
                <option value="safety">Safety</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select
                value={formData.status || 'available'}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="available">Available</option>
                <option value="in_use">In Use</option>
                <option value="maintenance">Maintenance</option>
                <option value="retired">Retired</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Serial Number</label>
              <input
                type="text"
                value={formData.serialNumber || ''}
                onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
              <input
                type="text"
                required
                value={formData.location || ''}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Purchase Price ($)</label>
              <input
                type="number"
                value={formData.purchasePrice || 0}
                onChange={(e) => setFormData({ ...formData, purchasePrice: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Purchase Date</label>
              <input
                type="date"
                value={formData.purchaseDate || ''}
                onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Assigned To</label>
            <input
              type="text"
              value={formData.assignedTo || ''}
              onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Leave empty if not assigned"
            />
          </div>
          <ImageUploader
            value={formData.imageUrl}
            onChange={(url) => setFormData({ ...formData, imageUrl: url })}
          />
        </>
      );
    }

    if (provider) {
      return (
        <>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
            <input
              type="text"
              required
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Contact Name</label>
            <input
              type="text"
              required
              value={formData.contactName || ''}
              onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={formData.email || ''}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
              <input
                type="tel"
                required
                value={formData.phone || ''}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
            <input
              type="text"
              required
              value={formData.address || ''}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Lead Time (days)</label>
              <input
                type="number"
                value={formData.leadTimeDays || 0}
                onChange={(e) => setFormData({ ...formData, leadTimeDays: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Min Order ($)</label>
              <input
                type="number"
                value={formData.minimumOrder || 0}
                onChange={(e) => setFormData({ ...formData, minimumOrder: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
        </>
      );
    }

    return null;
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center">
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-lg p-4 md:p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{getTitle()}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {renderFormFields()}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 border border-slate-200 text-slate-600 font-semibold rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-3 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default InventoryModule;
