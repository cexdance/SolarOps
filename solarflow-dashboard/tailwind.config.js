/** @type {import('tailwindcss').Config} */
module.exports = {
	darkMode: ['class'],
	content: [
		'./pages/**/*.{ts,tsx}',
		'./components/**/*.{ts,tsx}',
		'./app/**/*.{ts,tsx}',
		'./src/**/*.{ts,tsx}',
	],
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px',
			},
		},
		extend: {
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				// ConexSol Brand Colors (from style-guide.md)
				primary: {
					DEFAULT: '#F5A623', // Solar Gold
					foreground: '#0D1B2A',
				},
				secondary: {
					DEFAULT: '#00B4CC', // Teal Cyan
					foreground: '#FFFFFF',
				},
				accent: {
					DEFAULT: '#F5A623', // Solar Gold
					foreground: '#0D1B2A',
				},
				destructive: {
					DEFAULT: '#EF4444', // Ember Red
					foreground: '#FFFFFF',
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))',
				},
				popover: {
					DEFAULT: '#1C2E42', // Slate Blue
					foreground: '#FFFFFF',
				},
				card: {
					DEFAULT: '#1C2E42', // Slate Blue
					foreground: '#FFFFFF',
				},
				// Semantic/Surface colors
				surface: {
					dark: '#0D1B2A',     // Deep Navy
					mid: '#1C2E42',      // Slate Blue
					light: '#2A3F56',    // Muted Steel
				},
				status: {
					success: '#22C55E',  // Leaf Green
					warning: '#F59E0B',  // Amber
					error: '#EF4444',    // Ember Red
					info: '#38BDF8',     // Sky Blue
					inactive: '#4B6280', // Graphite
				},
				// Text colors
				text: {
					primary: '#FFFFFF',
					secondary: '#A8BDD0',   // Cool Gray
					muted: '#5A7490',       // Dim Slate
				},
				// Border/Divider
				panel: {
					border: '#1E3148',
					divider: '#162737',
				},
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)',
			},
			keyframes: {
				'accordion-down': {
					from: { height: 0 },
					to: { height: 'var(--radix-accordion-content-height)' },
				},
				'accordion-up': {
					from: { height: 'var(--radix-accordion-content-height)' },
					to: { height: 0 },
				},
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
			},
		},
	},
	plugins: [require('tailwindcss-animate')],
}
