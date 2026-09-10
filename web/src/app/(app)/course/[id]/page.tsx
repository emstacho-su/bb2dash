import { redirect } from 'next/navigation';

/**
 * `/course/[id]` has no content of its own — Stream is the course's front page
 * (Phase 8 route table), so the bare course URL redirects there. The id segment
 * is passed through exactly as it arrived so its encoding survives the hop.
 *
 * Next 16: `params` is a promise.
 */
export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/course/${id}/stream`);
}
