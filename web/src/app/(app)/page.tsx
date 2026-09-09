import type { Metadata } from 'next';
import { Today } from './Today';

export const metadata: Metadata = {
  title: 'Today · bb2dash',
};

/**
 * Today (Home) — artboard 13-home-v2, owned by W-5.
 *
 * The whole screen (effort tracker, undated tray, status quick-edit, last-sync
 * line, course cards) is a client component so it can read live data through
 * the query layer and drive the click-to-select tracker + optimistic status
 * edits. The (app) layout supplies the top bar and the <main> wrapper.
 */
export default function TodayPage() {
  return <Today />;
}
