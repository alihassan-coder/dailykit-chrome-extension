// Edit question sets: name, ICP and questions. Changes save as you type; a set always keeps its id, so
// past analyses still point at it.
import { Button, IconButton, Select } from '@toolbelt/ui';
import { ArrowDown, ArrowUp, ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FIELD_TYPES, newId, type Field, type FieldType, type QuestionSet } from './fields.ts';

const input =
	'rounded-lg border border-line bg-surface px-2.5 py-1.5 text-base outline-none placeholder:text-muted focus:border-accent focus-visible:outline-none focus:shadow-[0_0_0_3px_var(--tb-accent-soft)]';

function FieldEditor({
	field,
	onChange,
	onRemove,
	onMove,
	first,
	last
}: {
	field: Field;
	onChange: (f: Field) => void;
	onRemove: () => void;
	onMove: (by: -1 | 1) => void;
	first: boolean;
	last: boolean;
}) {
	// Options are edited as one comma-separated line, kept as typed until the field loses focus.
	const [optionsText, setOptionsText] = useState((field.options ?? []).join(', '));
	const set = (patch: Partial<Field>) => onChange({ ...field, ...patch });

	return (
		<li className="grid min-w-0 gap-2 rounded-xl border border-line bg-surface p-3 shadow-card">
			<div className="flex items-center gap-1">
				<input
					value={field.label}
					onChange={(e) => set({ label: e.target.value })}
					placeholder="Your question"
					aria-label="Question"
					className={`${input} min-w-0 flex-1`}
				/>
				<IconButton label="Move up" disabled={first} onClick={() => onMove(-1)}>
					<ArrowUp size={16} />
				</IconButton>
				<IconButton label="Move down" disabled={last} onClick={() => onMove(1)}>
					<ArrowDown size={16} />
				</IconButton>
				<ConfirmIcon label="Remove question" onConfirm={onRemove} />
			</div>
			<Select<FieldType>
				label="Answer type"
				value={field.type}
				onChange={(type) =>
					set({
						type,
						options: type === 'choice' || type === 'multi' ? (field.options ?? []) : undefined,
						min: type === 'score' ? (field.min ?? 1) : undefined,
						max: type === 'score' ? (field.max ?? 10) : undefined
					})
				}
				options={Object.entries(FIELD_TYPES).map(([value, t]) => ({ value: value as FieldType, label: t.label }))}
			/>
			{(field.type === 'choice' || field.type === 'multi') && (
				<input
					value={optionsText}
					onChange={(e) => setOptionsText(e.target.value)}
					onBlur={() =>
						set({
							options: [
								...new Set(
									optionsText
										.split(',')
										.map((o) => o.trim())
										.filter(Boolean)
								)
							]
						})
					}
					placeholder="Options, separated by commas"
					aria-label="Options"
					className={`${input} w-full`}
				/>
			)}
			{field.type === 'score' && (
				<label className="flex items-center gap-2 text-sm text-muted">
					From
					<input
						type="number"
						value={field.min ?? 1}
						onChange={(e) => set({ min: Number(e.target.value) })}
						aria-label="Lowest score"
						className={`${input} w-20 min-w-0`}
					/>
					to
					<input
						type="number"
						value={field.max ?? 10}
						onChange={(e) => set({ max: Number(e.target.value) })}
						aria-label="Highest score"
						className={`${input} w-20 min-w-0`}
					/>
				</label>
			)}
			<textarea
				value={field.instructions ?? ''}
				onChange={(e) => set({ instructions: e.target.value || undefined })}
				placeholder={
					field.type === 'custom'
						? 'Describe the answer you want, e.g. “a two-line cold email opener”'
						: 'Extra guidance for the AI (optional)'
				}
				aria-label="Guidance"
				rows={field.type === 'custom' ? 2 : 1}
				className={`${input} w-full resize-y text-sm`}
			/>
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
	onChange: (sets: QuestionSet[], activeId: string) => void;
	onDone: () => void;
}) {
	const set = sets.find((s) => s.id === activeId) ?? sets[0]!;
	const update = (patch: Partial<QuestionSet>) =>
		onChange(
			sets.map((s) => (s.id === set.id ? { ...s, ...patch } : s)),
			set.id
		);
	const updateField = (fields: Field[]) => update({ fields });

	function addSet() {
		const fresh: QuestionSet = { id: newId(), name: 'New set', icp: '', fields: [] };
		onChange([...sets, fresh], fresh.id);
	}

	function removeSet() {
		const rest = sets.filter((s) => s.id !== set.id);
		onChange(rest, rest[0]!.id);
	}

	return (
		<div className="grid min-w-0 gap-3">
			<div className="flex min-h-9 items-center gap-1">
				<IconButton label="Back to analysis" onClick={onDone} className="-ml-1.5">
					<ChevronLeft size={18} />
				</IconButton>
				<h2 className="min-w-0 flex-1 truncate text-lg font-semibold">Question sets</h2>
				<Button icon={<Plus size={16} />} onClick={addSet}>
					New set
				</Button>
			</div>

			<Select
				label="Set to edit"
				value={set.id}
				onChange={(id) => onChange(sets, id)}
				options={sets.map((s) => ({ value: s.id, label: s.name || 'Untitled set' }))}
			/>

			<label className="grid gap-1">
				<span className="text-sm font-medium">Name</span>
				<input value={set.name} onChange={(e) => update({ name: e.target.value })} className={`${input} w-full`} />
			</label>

			<label className="grid gap-1">
				<span className="text-sm font-medium">Ideal profile (ICP)</span>
				<span className="text-xs text-muted">
					Who you are looking for. Every profile gets a 0–100 match score against this.
				</span>
				<textarea
					value={set.icp}
					onChange={(e) => update({ icp: e.target.value })}
					rows={4}
					placeholder="e.g. Heads of sales at B2B SaaS companies with 20–200 people in Europe"
					className={`${input} w-full resize-y`}
				/>
			</label>

			<div className="grid gap-2">
				<p className="text-sm font-medium">Questions</p>
				{set.fields.length === 0 && (
					<p className="text-sm text-muted">No questions yet. The analysis still scores the ICP and lists the facts.</p>
				)}
				<ol className="grid gap-2">
					{set.fields.map((f, i) => (
						<FieldEditor
							key={f.id}
							field={f}
							first={i === 0}
							last={i === set.fields.length - 1}
							onChange={(next) => updateField(set.fields.map((x) => (x.id === f.id ? next : x)))}
							onRemove={() => updateField(set.fields.filter((x) => x.id !== f.id))}
							onMove={(by) => {
								const list = [...set.fields];
								list.splice(i, 1);
								list.splice(i + by, 0, f);
								updateField(list);
							}}
						/>
					))}
				</ol>
				<Button
					icon={<Plus size={16} />}
					onClick={() => updateField([...set.fields, { id: newId(), label: '', type: 'text' }])}
				>
					Add a question
				</Button>
			</div>

			{sets.length > 1 && <ConfirmDelete name={set.name} onConfirm={removeSet} />}
		</div>
	);
}

/** Deleting asks twice: the first press turns the button into "Delete?" for three seconds. */
function useConfirm(onConfirm: () => void): [boolean, () => void] {
	const [armed, setArmed] = useState(false);
	useEffect(() => {
		if (!armed) return;
		const t = setTimeout(() => setArmed(false), 3000);
		return () => clearTimeout(t);
	}, [armed]);
	return [armed, () => (armed ? onConfirm() : setArmed(true))];
}

function ConfirmIcon({ label, onConfirm }: { label: string; onConfirm: () => void }) {
	const [armed, press] = useConfirm(onConfirm);
	return armed ? (
		<Button variant="danger" className="min-h-8 px-2.5 text-sm" onClick={press}>
			Remove?
		</Button>
	) : (
		<IconButton label={label} onClick={press}>
			<Trash2 size={16} />
		</IconButton>
	);
}

function ConfirmDelete({ name, onConfirm }: { name: string; onConfirm: () => void }) {
	const [armed, press] = useConfirm(onConfirm);
	return (
		<Button
			variant={armed ? 'danger' : 'quiet'}
			icon={<Trash2 size={16} />}
			onClick={press}
			className="justify-self-start"
		>
			{armed ? `Delete “${name}”? Press again` : `Delete “${name}”`}
		</Button>
	);
}

