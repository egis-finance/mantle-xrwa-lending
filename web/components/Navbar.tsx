'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { DynamicWidget } from '@dynamic-labs/sdk-react-core';
import { cn } from '@/lib/utils';
import { useFundWallet } from '@/hooks/useFundWallet';
import { getEnv } from '@/lib/env';
import { Coins, Loader2 } from 'lucide-react';
import { Button } from './ui/button';

const navItems = [
  { name: 'Dashboard', href: '/dashboard' },
  { name: 'Borrow', href: '/borrow' },
  { name: 'Earn', href: '/earn' },
];

export function Navbar() {
  const pathname = usePathname();
  const { fund, isFunding } = useFundWallet();
  const env = getEnv();
  const isVte = !env.useMainnet;

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="container flex h-16 max-w-screen-2xl items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative h-10 w-10">
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

          <nav className="hidden md:flex gap-6" aria-label="Main navigation">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'text-sm font-medium transition-[color,transform] motion-reduce:transition-none hover:text-brand-DEFAULT hover:scale-110 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-DEFAULT rounded-sm',
                    isActive
                      ? 'text-brand-DEFAULT font-semibold'
                      : 'text-brand-muted'
                  )}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {isVte && (
            <Button
              variant="outline"
              size="sm"
              onClick={fund}
              disabled={isFunding}
              className="hidden sm:flex items-center gap-2 border-brand-light text-brand-DEFAULT hover:bg-brand-light/10"
            >
              {isFunding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Coins className="h-4 w-4" />
              )}
              {isFunding ? 'Funding...' : 'Fund Wallet'}
            </Button>
          )}
          <DynamicWidget />
        </div>
      </div>
    </nav>
  );
}
