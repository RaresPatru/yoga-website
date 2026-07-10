"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export function GlassCard({ children, className, hover = true }: GlassCardProps) {
  return (
    <motion.div
      whileHover={hover ? { scale: 1.02, y: -4 } : undefined}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className={cn(
        "rounded-2xl border border-white/30 bg-white/60 p-6 shadow-lg shadow-black/5 backdrop-blur-xl",
        "transition-shadow duration-300 hover:shadow-xl hover:shadow-black/10",
        className
      )}
    >
      {children}
    </motion.div>
  );
}
