// Edit question sets: name, ICP and questions. Questions are compact rows that open to edit; Alt+↑/↓ (or the
// row menu) reorders them. Changes save as you type, but only while every set is valid, so a half-written
// question never reaches storage (where it would be dropped) or an analysis. A set always keeps its id.
import {
	Badge,
	Button,
	Card,
	ConfirmDialog,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
	IconButton,
	Input,
	Label,
	Section,
	Select,
	Textarea,
	cn
} from '@toolbelt/ui';
import { ArrowDown, ArrowUp, ChevronRight, Copy, MoreHorizontal, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import {
	FIELD_TYPES,
	newId,
	validateSet,
	type Field,
	type FieldType,
	type QuestionSet,
	type SetIssue
} from './fields.ts';
import { SubHeader } from './SubHeader.tsx';

const parseOptions = (text: string) => [
	...new Set(
		text
			.split(',')
			.map((o) => o.trim())
			.filter(Boolean)
	)
];
const numberOrNaN = (v: string) => (v.trim() === '' ? NaN : Number(v));
const shown = (n: number | undefined, fallback: number) => (n === undefined ? fallback : Number.isFinite(n) ? n : '');

function FieldEditor({ field, issues, onChange }: { field: Field; issues: SetIssue[]; onChange: (f: Field) => void }) {
	// Options are edited as one comma-separated line, kept exactly as typed.
	const [optionsText, setOptionsText] = useState((field.options ?? []).join(', '));
	const set = (patch: Partial<Field>) => onChange({ ...field, ...patch });
	const id = useId();

	return (
		<div className="grid gap-2 px-3 pt-1 pb-3">
			<div className="grid gap-1">
				<Label htmlFor={`${id}-q`} className="text-sm text-muted">
					Question
				</Label>
				<Input
					id={`${id}-q`}
					value={field.label}
					onChange={(e) => set({ label: e.target.value })}
					placeholder="Your question, as you would ask a colleague"
					autoFocus={!field.label}
				/>
			</div>
			<Select<FieldType>
				label="Answer type"
				size="sm"
				value={field.type}
				onChange={(type) =>
					set({
						type,
						options: type === 'choice' || type === 'multi' ? (field.options ?? []) : undefined,
						min: type === 'score' ? (field.min ?? 1) : undefined,
						max: type === 'score' ? (field.max ?? 10) : undefined
					})
				}
				options={Object.entries(FIELD_TYPES).map(([value, t]) => ({
					value: value as FieldType,
					label: t.label,
					description: t.hint
				}))}
			/>
			{(field.type === 'choice' || field.type === 'multi') && (
				<Input
					value={optionsText}
					onChange={(e) => {
						setOptionsText(e.target.value);
						set({ options: parseOptions(e.target.value) });
					}}
					placeholder="Options, separated by commas"
					aria-label="Options"
				/>
			)}
			{field.type === 'score' && (
				<div className="flex items-center gap-2 text-sm text-muted">
					From
					<Input
						type="number"
						value={shown(field.min, 1)}
						onChange={(e) => set({ min: numberOrNaN(e.target.value) })}
						aria-label="Lowest score"
						className="tb-num w-16"
					/>
					to
					<Input
						type="number"
						value={shown(field.max, 10)}
						onChange={(e) => set({ max: numberOrNaN(e.target.value) })}
						aria-label="Highest score"
						className="tb-num w-16"
					/>
				</div>
			)}
			<Textarea
				value={field.instructions ?? ''}
				onChange={(e) => set({ instructions: e.target.value || undefined })}
				placeholder={
					field.type === 'custom'
						? 'Describe the answer you want, e.g. “a two-line cold email opener”'
						: 'Extra guidance for the AI (optional)'
				}
				aria-label="Guidance"
				rows={field.type === 'custom' ? 2 : 1}
				className="resize-y text-sm"
			/>
			{issues.length > 0 && (
				<ul className="grid gap-0.5 text-sm text-danger">
					{issues.map((i) => (
						<li key={i.message}>{i.message}</li>
					))}
				</ul>
			)}
		</div>
	);
}

function FieldRow({
	field,
	index,
	count,
	open,
	issues,
	onToggle,
	onChange,
	onMove,
	onRemove,
	rowRef
}: {
	field: Field;
	index: number;
	count: number;
	open: boolean;
	issues: SetIssue[];
	onToggle: () => void;
	onChange: (f: Field) => void;
	onMove: (by: -1 | 1) => void;
	onRemove: () => void;
	rowRef: (el: HTMLButtonElement | null) => void;
}) {
	const onKeyDown = (e: KeyboardEvent) => {
		if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
		e.preventDefault();
		const by = e.key === 'ArrowUp' ? -1 : 1;
		if (index + by >= 0 && index + by < count) onMove(by);
	};
	return (
		<li className={cn('min-w-0', open && 'bg-soft/40')}>
			<div className="flex h-11 min-w-0 items-center gap-1 pr-1.5">
				<button
					ref={rowRef}
					type="button"
					aria-expanded={open}
					onClick={onToggle}
					onKeyDown={onKeyDown}
					aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
					className="flex h-full min-w-0 flex-1 items-center gap-2 pl-3 text-left outline-none hover:bg-hover focus-visible:bg-hover"
				>
					<ChevronRight
						size={14}
						aria-hidden="true"
						className={cn('shrink-0 text-faint transition-transform', open && 'rotate-90')}
					/>
					<span className="tb-num w-4 shrink-0 text-sm text-faint">{index + 1}</span>
					<span className={cn('min-w-0 flex-1 truncate', field.label ? 'text-ink' : 'text-faint')}>
						{field.label || 'Untitled question'}
					</span>
					{issues.length > 0 && (
						<span className="flex shrink-0 items-center text-warn">
							<TriangleAlert size={14} aria-hidden="true" />
							<span className="sr-only">Needs attention: {issues[0]!.message}</span>
						</span>
					)}
					<Badge tone="outline">{FIELD_TYPES[field.type].label}</Badge>
				</button>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<IconButton label={`More for question ${index + 1}`} size="xs">
							<MoreHorizontal className="size-4" strokeWidth={1.75} aria-hidden="true" />
						</IconButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent>
						<DropdownMenuItem disabled={index === 0} onSelect={() => onMove(-1)}>
							<ArrowUp strokeWidth={1.75} aria-hidden="true" /> Move up
							<DropdownMenuShortcut>Alt ↑</DropdownMenuShortcut>
						</DropdownMenuItem>
						<DropdownMenuItem disabled={index === count - 1} onSelect={() => onMove(1)}>
							<ArrowDown strokeWidth={1.75} aria-hidden="true" /> Move down
							<DropdownMenuShortcut>Alt ↓</DropdownMenuShortcut>
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem tone="danger" onSelect={onRemove}>
							<Trash2 strokeWidth={1.75} aria-hidden="true" /> Remove question
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			{open && <FieldEditor field={field} issues={issues} onChange={onChange} />}
		</li>
	);
}

export function SetEditor({
	sets,
	activeId,
	onChange,
	onDone
}: {
	sets: QuestionSet[];
	activeId: string;
	/** Called with valid sets only. */
	onChange: (sets: QuestionSet[], activeId: string) => void;
	onDone: () => void;
}) {
	const [draft, setDraft] = useState(sets);
	const [editId, setEditId] = useState(activeId);
	const [openField, setOpenField] = useState<string | null>(null);
	const [confirm, setConfirm] = useState<null | 'leave' | 'delete-set' | { field: string }>(null);
	const rows = useRef(new Map<string, HTMLButtonElement>());
	const refocus = useRef<string | null>(null);
	const set = draft.find((s) => s.id === editId) ?? draft[0]!;
	const issues = validateSet(set);
	const otherInvalid = draft.some((s) => s.id !== set.id && validateSet(s).length > 0);

	useEffect(() => {
		if (refocus.current) rows.current.get(refocus.current)?.focus();
		refocus.current = null;
	}, [draft]);

	function commit(next: QuestionSet[], id = set.id) {
		setDraft(next);
		setEditId(id);
		if (next.every((s) => validateSet(s).length === 0)) onChange(next, id);
	}
	const update = (patch: Partial<QuestionSet>) => commit(draft.map((s) => (s.id === set.id ? { ...s, ...patch } : s)));
	const updateFields = (fields: Field[]) => update({ fields });

	function addSet(from?: QuestionSet) {
		const fresh: QuestionSet = from
			? { ...from, id: newId(), name: `${from.name} copy`, fields: from.fields.map((f) => ({ ...f, id: newId() })) }
			: { id: newId(), name: 'New set', icp: '', fields: [] };
		commit([...draft, fresh], fresh.id);
	}
	function addField() {
		const field: Field = { id: newId(), label: '', type: 'text' };
		updateFields([...set.fields, field]);
		setOpenField(field.id);
	}
	function move(i: number, by: -1 | 1) {
		const list = [...set.fields];
		const [f] = list.splice(i, 1);
		list.splice(i + by, 0, f!);
		refocus.current = f!.id;
		updateFields(list);
	}
	const invalid = issues.length > 0 || otherInvalid;
	const setIssues = issues.filter((i) => !i.fieldId);

	return (
		<div className="grid min-w-0 gap-3">
			<SubHeader
				title="Question sets"
				backLabel="Back to analysis"
				onBack={() => (invalid ? setConfirm('leave') : onDone())}
				action={
					<Button size="sm" icon={<Plus aria-hidden="true" />} onClick={() => addSet()}>
						New set
					</Button>
				}
			/>

			<div className="flex min-w-0 items-center gap-1">
				<div className="min-w-0 flex-1">
					<Select
						label="Set to edit"
						size="sm"
						value={set.id}
						onChange={(id) => setEditId(id)}
						options={draft.map((s) => ({ value: s.id, label: s.name || 'Untitled set' }))}
					/>
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<IconButton label="More for this set">
							<MoreHorizontal className="size-4" strokeWidth={1.75} aria-hidden="true" />
						</IconButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent>
						<DropdownMenuItem onSelect={() => addSet(set)}>
							<Copy strokeWidth={1.75} aria-hidden="true" /> Duplicate set
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem tone="danger" disabled={draft.length < 2} onSelect={() => setConfirm('delete-set')}>
							<Trash2 strokeWidth={1.75} aria-hidden="true" /> Delete set
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<div className="grid gap-1">
				<Label htmlFor="pl-set-name" className="text-sm text-muted">
					Name
				</Label>
				<Input
					id="pl-set-name"
					value={set.name}
					onChange={(e) => update({ name: e.target.value })}
					aria-invalid={setIssues.length > 0 || undefined}
				/>
				{setIssues.map((i) => (
					<p key={i.message} className="text-sm text-danger">
						{i.message}
					</p>
				))}
			</div>

			<div className="grid gap-1">
				<Label htmlFor="pl-set-icp" className="text-sm text-muted">
					Ideal profile (ICP)
				</Label>
				<Textarea
					id="pl-set-icp"
					value={set.icp}
					onChange={(e) => update({ icp: e.target.value })}
					rows={3}
					placeholder="e.g. Heads of sales at B2B SaaS companies with 20–200 people in Europe"
					className="resize-y"
				/>
				<p className="text-xs text-faint">
					Who you are looking for. Every profile gets a 0–100 match score against this.
				</p>
			</div>

			<Section
				title="Questions"
				count={set.fields.length}
				action={
					<Button size="xs" variant="quiet" icon={<Plus aria-hidden="true" />} onClick={addField}>
						Add
					</Button>
				}
			>
				<Card list>
					{set.fields.length === 0 ? (
						<p className="px-3 py-2.5 text-sm text-faint">
							No questions yet. The analysis still scores the ICP and lists the facts.
						</p>
					) : (
						<ol className="divide-y divide-line">
							{set.fields.map((f, i) => (
								<FieldRow
									key={f.id}
									field={f}
									index={i}
									count={set.fields.length}
									open={openField === f.id}
									issues={issues.filter((x) => x.fieldId === f.id)}
									rowRef={(el) => {
										if (el) rows.current.set(f.id, el);
										else rows.current.delete(f.id);
									}}
									onToggle={() => setOpenField((o) => (o === f.id ? null : f.id))}
									onChange={(next) => updateFields(set.fields.map((x) => (x.id === f.id ? next : x)))}
									onMove={(by) => move(i, by)}
									onRemove={() => setConfirm({ field: f.id })}
								/>
							))}
						</ol>
					)}
				</Card>
			</Section>

			{invalid && (
				<p role="status" className="text-sm text-warn">
					{issues.length ? 'Finish the marked questions to save this set.' : 'Another set has unfinished questions.'}{' '}
					Changes are saved once everything is complete.
				</p>
			)}

			<ConfirmDialog
				open={confirm === 'leave'}
				onOpenChange={(o) => !o && setConfirm(null)}
				title="Discard unfinished changes?"
				description="Some questions aren’t complete, so your latest changes haven’t been saved."
				confirmLabel="Discard changes"
				onConfirm={onDone}
			/>
			<ConfirmDialog
				open={confirm === 'delete-set'}
				onOpenChange={(o) => !o && setConfirm(null)}
				title={`Delete “${set.name || 'Untitled set'}”?`}
				description="Past analyses keep their answers. This set won’t be offered any more."
				confirmLabel="Delete set"
				onConfirm={() => {
					const rest = draft.filter((s) => s.id !== set.id);
					commit(rest, rest[0]!.id);
				}}
			/>
			<ConfirmDialog
				open={typeof confirm === 'object' && confirm !== null}
				onOpenChange={(o) => !o && setConfirm(null)}
				title="Remove this question?"
				description={
					set.fields.find((f) => typeof confirm === 'object' && confirm?.field === f.id)?.label || 'Untitled question'
				}
				confirmLabel="Remove"
				onConfirm={() => {
					if (typeof confirm === 'object' && confirm) updateFields(set.fields.filter((x) => x.id !== confirm.field));
				}}
			/>
		</div>
	);
}
