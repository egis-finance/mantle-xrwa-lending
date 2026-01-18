import Link from 'next/link';

/**
 * Site-wide footer with admin panel navigation.
 * Uses mt-auto to push to bottom within flex container.
 */
export function Footer() {
  return (
    <footer className="mt-auto border-t border-gray-200 py-4">
      <div className="container max-w-screen-xl mx-auto px-4 flex justify-between text-sm text-gray-500">
        <span>2025 Egis Finance</span>
        <Link href="/admin/release-queue" className="hover:text-gray-700 transition-colors">
          Admin Panel
        </Link>
      </div>
    </footer>
  );
}
