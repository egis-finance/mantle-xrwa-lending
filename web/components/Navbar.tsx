'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { cn } from '@/lib/utils';

const navItems = [
    { name: 'Borrow', href: '/dashboard' },
    { name: 'Earn', href: '/earn' },
    { name: 'Admin', href: '/admin' },
];

export function Navbar() {
    const pathname = usePathname();

    return (
        <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
            <div className="container flex h-16 max-w-screen-2xl items-center justify-between">
                <div className="flex items-center gap-8">
                    <Link href="/" className="flex items-center gap-3">
                        <div className="relative h-10 w-10">
                            {/* Using the PNG icon since SVG might not be available yet */}
                            <Image
                                src="/assets/egis_finance_icon.png"
                                alt="Egis Finance"
                                fill
                                className="object-contain"
                            />
                        </div>
                        <span className="font-serif text-xl font-bold tracking-wide text-brand-dark hidden sm:inline-block">
                            EGIS FINANCE
                        </span>
                    </Link>

                    <div className="hidden md:flex gap-6">
                        {navItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "text-sm font-medium transition-colors hover:text-brand-DEFAULT",
                                    pathname === item.href
                                        ? "text-brand-DEFAULT font-semibold"
                                        : "text-brand-muted"
                                )}
                            >
                                {item.name}
                            </Link>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <ConnectButton
                        showBalance={false}
                        accountStatus={{
                            smallScreen: 'avatar',
                            largeScreen: 'full',
                        }}
                    />
                </div>
            </div>
        </nav>
    );
}
