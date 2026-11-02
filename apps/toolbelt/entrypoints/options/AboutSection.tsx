// About: version, build and browser, links, licences, and diagnostics to paste into a bug report.
import { Button, Logo, showError, toast, useSettings } from '@toolbelt/ui';
import { Bug, ClipboardCopy, Code, ExternalLink, FileText } from 'lucide-react';
import { browser } from 'wxt/browser';
import { tools, version } from '../../shell/tools.ts';
import { SettingsGroup, SettingsHeader, SettingsRow } from './shared.tsx';

const REPO = 'https://github.com/alihassan-coder/dailykit-chrome-extension';

function browserInfo(): string {
	const ua = navigator.userAgent;
	const m = /(Edg|Firefox|Chrome)\/(\d+)/.exec(ua);
	const name = m
		? ({ Edg: 'Edge', Firefox: 'Firefox', Chrome: 'Chrome' } as const)[m[1] as 'Edg' | 'Firefox' | 'Chrome']
		: 'Browser';
	return m ? `${name} ${m[2]}` : name;
}

function Link({ href, children }: { href: string; children: string }) {
	return (
		<a
			href={href}
			target="_blank"
			rel="noreferrer"
			className="inline-flex items-center gap-1 text-sm text-accent-ink hover:underline"
		>
			{children} <ExternalLink size={12} aria-hidden="true" />
		</a>
	);
}

export function AboutSection() {
	const { settings } = useSettings();
	const manifest = browser.runtime.getManifest();
	const enabled = tools.filter((t) => settings.tools[t.id]?.enabled).map((t) => t.id);

	async function copyDiagnostics() {
		// No keys, usernames or data: only what helps reproduce a bug.
		const text = [
			`Toolbelt ${version()} (manifest v${manifest.manifest_version})`,
			`Browser: ${navigator.userAgent}`,
			`Platform: ${navigator.platform} · language ${navigator.language}`,
			`Tools on: ${enabled.join(', ') || 'none'} (${enabled.length} of ${tools.length})`,
			`Theme: ${settings.theme.mode}, ${settings.theme.density}, text ${settings.theme.textSize}, motion ${settings.theme.motion}`
		].join('\n');
		try {
			await navigator.clipboard.writeText(text);
			toast.success('Diagnostics copied', { description: 'No keys or personal data are included.' });
		} catch (e) {
			showError(e);
		}
	}

	return (
		<section aria-labelledby="about-title" className="grid gap-5">
			<SettingsHeader id="about-title" title="About" description="Your own browser tools, in one side panel." />

			<SettingsGroup>
				<SettingsRow
					icon={<Logo size={16} />}
					label={
						<span>
							Toolbelt <span className="font-normal text-faint tb-num">{version()}</span>
						</span>
					}
					hint={`${browserInfo()} · Manifest V${manifest.manifest_version} · ${tools.length} tools in this build`}
				>
					<Button size="sm" icon={<ClipboardCopy aria-hidden="true" />} onClick={() => void copyDiagnostics()}>
						Copy diagnostics
					</Button>
				</SettingsRow>
				<SettingsRow icon={<Code />} label="Source code" hint="Open source on GitHub.">
					<Link href={REPO}>GitHub</Link>
				</SettingsRow>
				<SettingsRow icon={<Bug />} label="Report a problem" hint="Paste the diagnostics into the issue.">
					<Link href={`${REPO}/issues/new`}>New issue</Link>
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup title="Licences">
				<SettingsRow icon={<FileText />} label="Toolbelt" hint="MIT licence, © 2026 Ali Hassan.">
					<Link href={new URL('/OSS-LICENSES.txt', location.origin).href}>Third-party notices</Link>
				</SettingsRow>
				<SettingsRow
					label="Credits"
					hint="Cairn builds on the MIT-licensed Cairn extension by the Cairn contributors. Font: Inter (SIL Open Font Licence). Icons: Lucide (ISC). Memory: mem0 (Apache 2.0)."
				/>
			</SettingsGroup>
		</section>
	);
}
