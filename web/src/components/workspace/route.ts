/**
 * bb2dash — the Workspace's route, spelled once (Phase 21, task 16).
 *
 * The selected conversation is route state, like the popouts:
 * `/workspace?c=<conversation uuid>`. With no `?c=` the page shows an empty
 * composer, and the first question creates the conversation.
 */

/** The route. */
export const WORKSPACE_PATH = '/workspace';

/** The query-string key that names the selected conversation. */
export const CONVERSATION_PARAM = 'c';

/** Where a conversation lives; `null` is the empty composer. */
export function conversationHref(conversationId: string | null): string {
  if (conversationId === null) return WORKSPACE_PATH;
  return `${WORKSPACE_PATH}?${CONVERSATION_PARAM}=${encodeURIComponent(conversationId)}`;
}
