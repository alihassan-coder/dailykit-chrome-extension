// Browser agent's mark: a pointer, the cursor that acts for you, with a gold spark of intelligence beside it.
import { GOLD, ToolTile } from '@toolbelt/ui';

export default function AgentIcon({ size = 20 }: { size?: number }) {
	return (
		<ToolTile size={size} from="#a28bff" to="#4b2fc4">
			<path d="M5.6 4.4v10.4l2.7-2.6 1.9 4 1.9-.85-1.9-3.95h3.8Z" strokeWidth="1.1" />
			<path d="M14.9 3.1q.35 1.9 2.25 2.25-1.9.35-2.25 2.25-.35-1.9-2.25-2.25 1.9-.35 2.25-2.25Z" fill={GOLD} />
		</ToolTile>
	);
}
