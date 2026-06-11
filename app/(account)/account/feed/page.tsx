import { redirect } from 'next/navigation';

// T6 moved the followed-studios feed to the signed-in homepage. Permanent
// redirect for bookmarks and stale links.
export default function FeedPage() {
  redirect('/');
}
