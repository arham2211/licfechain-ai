"use client";

import { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  icon,
  right,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="card relative overflow-hidden p-5 md:flex md:items-center md:justify-between">
      <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] opacity-60" />
      <div className="flex items-center gap-3">
        {icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="mt-3 md:mt-0">{right}</div>}
    </div>
  );
}
