/**
 * The right-click menu (Phase 22, task 27; D-1, entry `desktop-shell-details`).
 *
 * In a field: Cut, Copy, Paste and Select all. On a selection outside a field: Copy. Elsewhere:
 * no menu. Role items only. The template is a pure function of what Electron's `context-menu`
 * event hands over (`params.isEditable`, `params.selectionText`, `params.editFlags`).
 */

import { describe, expect, it } from 'vitest';

import { contextMenuTemplate } from '../../src/main/context-menu';
import type { ContextParams } from '../../src/main/context-menu';

const FLAGS_ALL = { canCut: true, canCopy: true, canPaste: true, canSelectAll: true } as const;
const FLAGS_NONE = { canCut: false, canCopy: false, canPaste: false, canSelectAll: false } as const;

function params(overrides: Partial<ContextParams>): ContextParams {
  return { isEditable: false, selectionText: '', editFlags: FLAGS_NONE, ...overrides };
}

const rolesOf = (template: readonly { role?: string }[]): (string | undefined)[] => template.map((item) => item.role);

describe('an editable target', () => {
  it('gives cut, copy, paste and selectAll in that order', () => {
    const template = contextMenuTemplate(params({ isEditable: true, editFlags: FLAGS_ALL }));
    expect(rolesOf(template)).toEqual(['cut', 'copy', 'paste', 'selectAll']);
  });

  it('enables each by its own edit flag', () => {
    const template = contextMenuTemplate(
      params({ isEditable: true, editFlags: { canCut: false, canCopy: true, canPaste: false, canSelectAll: true } }),
    );
    const enabled = Object.fromEntries(template.map((item) => [item.role, item.enabled]));
    expect(enabled).toEqual({ cut: false, copy: true, paste: false, selectAll: true });
  });

  it('is the same four items when text is also selected', () => {
    const template = contextMenuTemplate(params({ isEditable: true, selectionText: 'abc', editFlags: FLAGS_ALL }));
    expect(rolesOf(template)).toEqual(['cut', 'copy', 'paste', 'selectAll']);
  });
});

describe('a selection outside a field', () => {
  it('gives copy alone', () => {
    const template = contextMenuTemplate(params({ selectionText: 'some words', editFlags: { ...FLAGS_NONE, canCopy: true } }));
    expect(rolesOf(template)).toEqual(['copy']);
    expect(template[0]?.enabled).toBe(true);
  });

  it('white space only is not a selection', () => {
    expect(contextMenuTemplate(params({ selectionText: '  \n\t ' }))).toEqual([]);
  });
});

describe('neither', () => {
  it('gives an empty list, so no menu is popped', () => {
    expect(contextMenuTemplate(params({}))).toEqual([]);
  });
});

describe('every item', () => {
  it('is a role item with no click handler of its own', () => {
    for (const template of [
      contextMenuTemplate(params({ isEditable: true, editFlags: FLAGS_ALL })),
      contextMenuTemplate(params({ selectionText: 'x' })),
    ]) {
      for (const item of template) {
        expect(typeof item.role).toBe('string');
        expect((item as { click?: unknown }).click).toBeUndefined();
      }
    }
  });

  it('never carries zoom, quit or a developer item', () => {
    const template = contextMenuTemplate(params({ isEditable: true, selectionText: 'x', editFlags: FLAGS_ALL }));
    for (const forbidden of ['zoomIn', 'zoomOut', 'resetZoom', 'quit', 'toggleDevTools', 'reload']) {
      expect(rolesOf(template)).not.toContain(forbidden);
    }
  });
});
