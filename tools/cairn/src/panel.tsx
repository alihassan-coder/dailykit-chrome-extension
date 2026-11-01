// Cairn in the side panel. The chat history port lands here next; until then this says so plainly.
import { EmptyState } from '@toolbelt/ui';

export default function CairnPanel() {
	return (
		<EmptyState
			title="Chat history is being built"
			body="Cairn will save your Claude and ChatGPT chats here, with search, tags and export. The page script that watches those sites is already running."
		/>
	);
}
