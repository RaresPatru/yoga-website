"use client";

import { forwardRef } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className, children, ...props }, ref) => {
    return (
      <motion.div
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        className="inline-flex"
        style={{ width: props.style?.width }}
      >
        <button
          ref={ref}
          className={cn(
            "inline-flex w-full cursor-pointer items-center justify-center rounded-full font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/50",
            "disabled:pointer-events-none disabled:opacity-50",
            {
              "bg-rose text-white hover:bg-rose-dark shadow-lg shadow-rose/25":
                variant === "primary",
              "border border-sage/30 bg-white/60 text-charcoal hover:bg-white/80 backdrop-blur-sm":
                variant === "secondary",
              "text-charcoal-light hover:text-charcoal hover:bg-white/40":
                variant === "ghost",
            },
            {
              "h-9 px-4 text-sm": size === "sm",
              "h-12 px-6 text-base": size === "md",
              "h-14 px-8 text-lg": size === "lg",
            },
            className
          )}
          {...props}
        >
          {children}
        </button>
      </motion.div>
    );
  }
);

Button.displayName = "Button";
