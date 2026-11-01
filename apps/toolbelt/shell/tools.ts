/// <reference types="@toolbelt/wxt-kit/registry" />
// The tools in this build, their side-panel screens and their logos. Adding a tool: add its descriptor in
// wxt.config.ts, then its panel and icon here. test/architecture.test.ts checks nothing is missing.
import { createSettingsStore } from '@toolbelt/core';
import CairnIcon from '@toolbelt/tool-cairn/icon';
import ColorPickerIcon from '@toolbelt/tool-color-picker/icon';
import GrayscaleIcon from '@toolbelt/tool-grayscale/icon';
import { localArea } from '@toolbelt/ui';
import { browser } from 'wxt/browser';
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import registry from 'virtual:toolbelt/registry';

export type ToolEntry = (typeof registry.tools)[number];

export const tools: ToolEntry[] = registry.tools;

export const panels: Record<string, LazyExoticComponent<ComponentType>> = {
	cairn: lazy(() => import('@toolbelt/tool-cairn/panel')),
	'color-picker': lazy(() => import('@toolbelt/tool-color-picker/panel')),
	grayscale: lazy(() => import('@toolbelt/tool-grayscale/panel'))
};

export const icons: Record<string, ComponentType<{ size?: number }>> = {
	cairn: CairnIcon,
	'color-picker': ColorPickerIcon,
	grayscale: GrayscaleIcon
};

/** Words people may type in the command palette to find a tool. */
export const keywords: Record<string, string[]> = {
	cairn: ['chat history', 'claude', 'chatgpt', 'save'],
	'color-picker': ['eyedropper', 'hex', 'rgb', 'contrast'],
	grayscale: ['grayscale', 'greyscale', 'monochrome', 'focus']
};

export const settingsStore = createSettingsStore(localArea, tools);

/** Plain words for where a tool runs, shown in the dashboard. */
export function sitesLabel(tool: ToolEntry): string {
	if (tool.hostMatches.includes('<all_urls>')) return 'Every site';
	if (!tool.hostMatches.length) return 'Side panel only';
	const hosts = [...new Set(tool.hostMatches.map((m) => m.replace(/^https?:\/\/(\*\.)?/, '').replace(/\/.*$/, '')))];
	return hosts.join(', ');
}

export const version = () => browser.runtime.getManifest().version;
