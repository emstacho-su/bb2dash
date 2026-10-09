/**
 * The right-click menu (Phase 22, task 27; D-1, entry `desktop-shell-details`).
 *
 * In a field: Cut, Copy, Paste and Select all, each enabled by its edit flag. On a selection outside a
 * field: Copy. Elsewhere: no menu. Role items only. A pure function of what the `context-menu` event
 * hands over, so `test/unit/context-menu.test.ts` needs no Electron; `window.ts` pops the menu.
 */

import type { MenuItemConstructorOptions } from 'electron';

/** The slice of Electron's `ContextMenuParams` this reads. */
export interface ContextParams {
  readonly isEditable: boolean;
  readonly selectionText: string;
  readonly editFlags: {
    readonly canCut: boolean;
    readonly canCopy: boolean;
    readonly canPaste: boolean;
    readonly canSelectAll: boolean;
  };
}

export function contextMenuTemplate(params: ContextParams): MenuItemConstructorOptions[] {
  if (params.isEditable) {
    return [
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { role: 'selectAll', enabled: params.editFlags.canSelectAll },
    ];
  }
  if (params.selectionText.trim() !== '') return [{ role: 'copy', enabled: true }];
  return [];
}
