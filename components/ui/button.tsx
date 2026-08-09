"use client";

import { forwardRef, isValidElement, cloneElement, type ReactElement } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { buttonClasses, type ButtonVariant, type ButtonSize } from "@/lib/button-styles";

// Re-exported so existing imports from this module keep working.
export { buttonClasses };

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * Render the child element with the button's styling instead of emitting a
   * <button>. Use this for links:
   *
   *     <Button asChild><Link href="/events">Vezi evenimentele</Link></Button>
   *
   * The alternative — <Link><Button>…</Button></Link> — puts a <button> inside
   * an <a>. That is invalid HTML, and assistive technology has to guess whether
   * it is announcing a link or a control. `asChild` produces a single <a>
   * styled as a button, which is unambiguous.
   */
  asChild?: boolean;
  children: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", asChild, className, children, ...props }, ref) => {
    const reduceMotion = useReducedMotion();
    const classes = cn(
      buttonClasses({ variant, size, className }),
      // Cancels the hover/tap scale when the OS asks for reduced motion.
      reduceMotion && "motion-safe:hover:scale-100 motion-safe:active:scale-100"
    );

    // `w-full` used to be hardcoded here, wrapped in an `inline-flex` motion.div.
    // The wrapper sized itself to its content, so the button filled a container
    // that was already content-width — meaning a caller passing `className="w-full"`
    // got no effect at all. Dropping the wrapper lets width behave normally: the
    // button is inline by default and full-width when a caller asks for it.
    //
    // NOTE: this branch only runs in client components. From a Server Component
    // the child arrives as a serialised reference, isValidElement() is false,
    // and the code falls through to a real <button> wrapping the link. Use
    // buttonClasses() on the link directly in server-rendered code.
    if (asChild && isValidElement(children)) {
      const child = children as ReactElement<Record<string, unknown>>;
      // Forward everything, not just the class name. Passing only `className`
      // meant `<Button asChild onClick={...}>` silently dropped the handler,
      // along with `ref`, `aria-*` and anything else — no error, just a control
      // that does nothing. The child's own props win, so a link's `href` is
      // never overwritten.
      return cloneElement(child, {
        ...props,
        ...child.props,
        ref,
        className: cn(child.props.className as string | undefined, classes),
      } as Record<string, unknown>);
    }

    return (
      <motion.button
        ref={ref}
        type={props.type ?? "button"}
        className={classes}
        {...(props as React.ComponentProps<typeof motion.button>)}
      >
        {children}
      </motion.button>
    );
  }
);

Button.displayName = "Button";
