import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { motion, type HTMLMotionProps } from "framer-motion";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-[background-color,border-color,color,box-shadow,opacity] duration-300 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[var(--shadow-button)] hover:shadow-[var(--shadow-gold-glow)]",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-transparent shadow-xs hover:bg-accent dark:bg-transparent dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // 44px floor on every variant (WCAG 2.5.5 / iOS HIG / Material 48dp).
        // Below that a finger reliably mis-taps, so `sm` and the icon buttons
        // hold the 44px floor while the primary actions step up: `default` is
        // 48px and `lg` 56px on the luxury scale. `min-h-*` rather than `h-*`
        // so a two-line label still grows instead of clipping.
        default: "min-h-12 px-5 py-2 has-[>svg]:px-4",
        sm: "min-h-11 gap-1.5 px-4 has-[>svg]:px-3",
        lg: "min-h-14 px-7 has-[>svg]:px-5",
        icon: "size-11",
        "icon-sm": "size-11",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const classes = cn(buttonVariants({ variant, size, className }));

  if (asChild) {
    return <Slot data-slot="button" className={classes} {...props} />;
  }

  // Primary actions get a tactile spring. Secondary/ghost/link controls stay
  // static so menus and inline actions do not wobble.
  if ((variant ?? "default") === "default") {
    return (
      <motion.button
        data-slot="button"
        className={classes}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 420, damping: 28 }}
        // React's drag handlers and Framer's gesture handlers share names but
        // have different signatures; the public surface stays a native button,
        // so narrow only at this motion boundary.
        {...(props as unknown as HTMLMotionProps<"button">)}
      />
    );
  }

  return <button data-slot="button" className={classes} {...props} />;
}

export { Button, buttonVariants };
