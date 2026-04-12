"use client";

import { ReactNode } from "react";
import { motion } from "framer-motion";

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  gradient,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  gradient?: boolean;
}) {
  return (
    <motion.div
      className={`${gradient ? "card-gradient" : "card"} relative overflow-hidden p-5`}
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      {!gradient && (
        <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] opacity-60" />
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={`text-xs font-semibold uppercase tracking-wider ${gradient ? "text-white/70" : "text-muted"}`}>
            {title}
          </div>
          <div className={`mt-1.5 text-2xl font-bold tabular-nums ${gradient ? "text-white" : "gradient-text"}`}>
            {value}
          </div>
          {subtitle && (
            <div className={`mt-1 text-xs ${gradient ? "text-white/60" : "text-muted"}`}>
              {subtitle}
            </div>
          )}
        </div>
        {icon && (
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
              gradient ? "bg-white/15" : "bg-primary/10"
            }`}
          >
            <div className={gradient ? "text-white/80" : "text-primary"}>
              {icon}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
