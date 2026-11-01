// Data and sync: what is stored where, and a settings backup you can download and restore.
import { resolveSettings } from '@toolbelt/core';
import { Button, useSettings } from '@toolbelt/ui';
import { CloudOff, Download, HardDrive, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { tools } from '../../shell/tools.ts';

export function DataSection() {
	const { settings, update } = useSettings();
	const fileInput = useRef<HTMLInputElement>(null);
	const [message, setMessage] = useState<string | null>(null);

	function exportSettings() {
		const blob = new Blob([JSON.stringify({ app: 'toolbelt', settings }, null, 2)], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `toolbelt-settings-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(a.href);
		setMessage('Settings downloaded.');
	}

	async function importSettings(file: File) {
		try {
			const parsed = JSON.parse(await file.text()) as { app?: string; settings?: unknown };
			if (parsed.app !== 'toolbelt') throw new Error('not a Toolbelt file');
			await update(() => resolveSettings(parsed.settings, tools));
			setMessage('Settings restored.');
		} catch {
			setMessage('That file is not a Toolbelt settings backup. Nothing was changed.');
		}
	}

	return (
		<section aria-labelledby="data-title" className="grid gap-4">
			<div>
				<h2 id="data-title" className="text-xl font-semibold">
					Data and sync
				</h2>
				<p className="text-sm text-muted">Where your Toolbelt data lives, and how to back up your settings.</p>
			</div>

			<div className="grid gap-3 sm:grid-cols-2">
				<div className="grid gap-2 rounded-lg border border-line bg-surface p-4">
					<HardDrive size={18} className="text-muted" />
					<p className="font-medium">On this device</p>
					<p className="text-sm text-muted">Settings, colours, black-and-white sites and API keys.</p>
				</div>
				<div className="grid gap-2 rounded-lg border border-dashed border-line p-4">
					<CloudOff size={18} className="text-muted" />
					<p className="font-medium">Your Neon database: not connected yet</p>
					<p className="text-sm text-muted">
						Next step: create your account (username and master password), then everything syncs encrypted to your
						database and your other devices.
					</p>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-4">
				<Button icon={<Download size={16} />} onClick={exportSettings}>
					Download settings
				</Button>
				<Button icon={<Upload size={16} />} onClick={() => fileInput.current?.click()}>
					Restore settings
				</Button>
				<input
					ref={fileInput}
					type="file"
					accept="application/json"
					hidden
					onChange={(e) => {
						const file = e.target.files?.[0];
						if (file) void importSettings(file);
						e.target.value = '';
					}}
				/>
				{message && (
					<p role="status" className="text-sm text-muted">
						{message}
					</p>
				)}
			</div>
		</section>
	);
}
