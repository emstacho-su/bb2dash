import type { Metadata } from 'next';
import Inbox from './Inbox';

export const metadata: Metadata = {
  title: 'Inbox · bb2dash',
};

/**
 * Inbox — `attention_items`, the queue Stack clears (Phase 9).
 *
 * Client-side for the whole screen: the rows are read, answered and re-read
 * through the query layer, and each resolve control writes four columns on a
 * row the agent otherwise owns. The (app) layout supplies the top bar.
 */
export default function InboxPage() {
  return <Inbox />;
}
