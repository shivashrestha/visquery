import { redirect } from 'next/navigation';

// Studio is rendered inline inside the main app shell (see app/page.tsx).
// Keep this route for bookmarks/old links — redirect to the same SPA view.
export default function StudioRoute() {
  redirect('/?view=studio');
}
