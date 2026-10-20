import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

interface PageTransitionProps {
  /** Current wouter pathname. Changing it starts a new fade. */
  location: string;
  children: ReactNode;
}

/**
 * Route-level fade. Deliberately opacity-only: moving or scaling a full-page
 * layer forces the compositor to rasterize it on every navigation (see
 * tests/unit/compositor-animations.test.ts).
 *
 * The outgoing element keeps the `children` captured for its own location, so
 * it fades out showing the previous page instead of flashing the new one.
 */
export function PageTransition({ location, children }: PageTransitionProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location}
        className="flex-1"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
