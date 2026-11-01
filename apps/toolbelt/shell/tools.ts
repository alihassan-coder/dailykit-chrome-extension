/// <reference types="@toolbelt/wxt-kit/registry" />
// The tools in this build and their side-panel screens. Adding a tool: add its descriptor in wxt.config.ts
// and its panel here.
import { createSettingsStore } from '@toolbelt/core';
import { localArea } from '@toolbelt/ui';
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import registry from 'virtual:toolbelt/registry';

export type ToolEntry = (typeof registry.tools)[number];

export const tools: ToolEntry[] = registry.tools;

export const panels: Record<string, LazyExoticComponent<ComponentType>> = {
	cairn: lazy(() => import('@toolbelt/tool-cairn/panel')),
	'color-picker': lazy(() => import('@toolbelt/tool-color-picker/panel')),
	grayscale: lazy(() => import('@toolbelt/tool-grayscale/panel'))
};

export const settingsStore = createSettingsStore(localArea, tools);

/** Plain words for where a tool runs, shown in the dashboard. */
export function sitesLabel(tool: ToolEntry): string {
	if (tool.hostMatches.includes('<all_urls>')) return 'Every site';
	if (!tool.hostMatches.length) return 'Side panel only';
	const hosts = [...new Set(tool.hostMatches.map((m) => m.replace(/^https?:\/\/(\*\.)?/, '').replace(/\/.*$/, '')))];
	return hosts.join(', ');
}
