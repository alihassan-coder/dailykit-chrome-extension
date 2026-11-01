// Shared start-up for every Toolbelt page: fonts, styles, settings and theme.
import '@toolbelt/ui/fonts.css';
import '@toolbelt/ui/styles.css';
import { SettingsProvider } from '@toolbelt/ui';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { AccountGate } from './AccountGate.tsx';
import { settingsStore } from './tools.ts';

export function mount(app: ReactNode) {
	const root = document.getElementById('root');
	if (!root) throw new Error('Missing #root element');
	document.documentElement.setAttribute('data-tb-root', '');
	createRoot(root).render(
		<StrictMode>
			<SettingsProvider store={settingsStore} themeTarget={document.documentElement}>
				<AccountGate>{app}</AccountGate>
			</SettingsProvider>
		</StrictMode>
	);
}
