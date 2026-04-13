# SolarFlow - Solar Company Management Application

A comprehensive solar company management web application built with React, TypeScript, and TailwindCSS.

## Features

### Modules Included
- **Contractor Module** - Manage contractor approvals, work orders, expenses, and payments
- **Client Module** - Customer management with PowerCare status tracking
- **Service Dispatch** - Work order creation with intelligent service rate pricing
- **Inventory Tracking** - Equipment, tools, and provider management with edit capabilities
- **Billing Module** - Contractor pay management with invoice and payment status tracking

### Key Functionality
- Service rate selection with automatic price filling
- PowerCare customer identification
- Real-time cost calculation (Base Rate + Additional Amount)
- Work order creation with linked services
- Expense reporting with image/PDF attachments
- Revert capability for invoice and payment statuses
- Clickable work orders for detailed views
- Responsive mobile-friendly design

## Getting Started

### Prerequisites
- Node.js 18+
- npm or pnpm

### Installation

1. Navigate to the project directory:
```bash
cd solarflow
```

2. Install dependencies:
```bash
npm install
# or
pnpm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to:
```
http://localhost:5173
```

### Building for Production

```bash
npm run build
```

The production build will be in the `dist` folder.

### Project Structure

```
solarflow/
├── src/
│   ├── components/       # React components
│   │   ├── admin/       # Admin module components
│   │   ├── contractor/  # Contractor module components
│   │   └── ...
│   ├── types/           # TypeScript type definitions
│   ├── data/            # Demo data
│   ├── App.tsx         # Main application
│   └── main.tsx        # Entry point
├── public/              # Static assets
├── index.html           # HTML entry
├── package.json         # Dependencies
├── vite.config.ts      # Vite configuration
├── tailwind.config.js  # TailwindCSS configuration
└── tsconfig.json       # TypeScript configuration
```

## Technology Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **TailwindCSS** - Styling
- **Vite** - Build tool
- **Lucide React** - Icons
- **Recharts** - Charts
- **React Router** - Navigation

## License

Private - All rights reserved
