// About: version, the tools in this build, licences and credits.
import { Logo, ToolMark } from '@toolbelt/ui';
import { icons, tools, version } from '../../shell/tools.ts';

export function AboutSection() {
	return (
		<section aria-labelledby="about-title" className="grid gap-4">
			<div className="flex items-center gap-3">
				<Logo size={48} />
				<div>
					<h2 id="about-title" className="text-xl font-semibold">
						Toolbelt
					</h2>
					<p className="text-sm text-muted tabular-nums">Version {version()}</p>
				</div>
			</div>

			<div className="rounded-lg border border-line bg-surface px-5">
				{tools.map((t) => {
					const Icon = icons[t.id];
					return (
						<div key={t.id} className="flex items-center gap-3 border-t border-line py-3 first:border-t-0">
							<ToolMark name={t.name} icon={Icon ? <Icon size={32} /> : undefined} />
							<div className="min-w-0">
								<p className="text-lg font-semibold">{t.name}</p>
								<p className="truncate text-sm text-muted">{t.description}</p>
							</div>
						</div>
					);
				})}
			</div>

			<div className="grid gap-1 text-sm text-muted">
				<p>Toolbelt is open source under the MIT licence, © 2026 Ali Hassan.</p>
				<p>
					Cairn builds on the MIT-licensed Cairn extension by the Cairn contributors. Fonts: Schibsted Grotesk and
					Source Serif 4 (SIL Open Font Licence). Icons: Lucide (ISC).
				</p>
			</div>
		</section>
	);
}
