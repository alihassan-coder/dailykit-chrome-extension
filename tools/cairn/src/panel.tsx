// Cairn in the side panel. The chat history port lands here next; until then the panel says plainly what is
// coming and what already works on the page.
import { Badge, Card, Section, StatusDot } from '@toolbelt/ui';
import CairnIcon from './icon.tsx';

const COMING = [
	{ title: 'Every chat, saved on this device', meta: 'Claude, ChatGPT' },
	{ title: 'Search across all your chats', meta: 'Full text' },
	{ title: 'Tags, pins and export', meta: 'Markdown, JSON' },
	{ title: 'Context and usage at a glance', meta: 'Per chat' }
];

export default function CairnPanel() {
	return (
		<div className="grid min-w-0 gap-3">
			<div className="flex min-w-0 items-start gap-2.5 px-0.5">
				<CairnIcon size={32} />
				<div className="grid min-w-0 gap-0.5">
					<div className="flex items-center gap-1.5">
						<p className="text-lg font-semibold text-ink">Chat history is on its way</p>
						<Badge tone="accent">Soon</Badge>
					</div>
					<p className="text-sm text-muted">
						Cairn will keep your Claude and ChatGPT chats here: private, searchable, yours.
					</p>
				</div>
			</div>

			<Section title="Working now">
				<Card list>
					<div className="flex h-8 min-w-0 items-center gap-2 px-3">
						<StatusDot tone="ok" />
						<span className="min-w-0 flex-1 truncate text-base text-ink">Save chat button on claude.ai</span>
						<span className="shrink-0 text-sm text-faint">Bottom right</span>
					</div>
				</Card>
			</Section>

			<Section title="Coming next" count={COMING.length}>
				<Card list>
					{COMING.map((item) => (
						<div key={item.title} className="flex h-8 min-w-0 items-center gap-2 px-3">
							<StatusDot tone="idle" />
							<span className="min-w-0 flex-1 truncate text-base text-muted">{item.title}</span>
							<span className="shrink-0 text-sm text-faint">{item.meta}</span>
						</div>
					))}
				</Card>
			</Section>
		</div>
	);
}
