'use client'

import { Aperture, Shield } from 'lucide-react'

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border/50 bg-card/30">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Aperture className="size-4" />
              </span>
              <span className="text-base font-semibold tracking-tight">
                Snapory
              </span>
            </div>
            <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground text-pretty">
              <Shield className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                <strong className="font-medium text-foreground">
                  100% private:
                </strong>{' '}
                Photos are processed locally and never saved to our databases.
              </span>
            </p>
          </div>

          <nav className="flex flex-col gap-2 text-sm">
            <span className="mb-1 font-medium">Legal</span>
            <a
              href="#privacy"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Privacy Policy
            </a>
            <a
              href="#terms"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Terms &amp; Conditions
            </a>
          </nav>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-border/50 pt-6 text-sm text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} Snapory. All rights reserved.</p>
          <p>
            Designed by{' '}
            <a
              href="https://christianluisaceron.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Christian Luis Aceron
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}
