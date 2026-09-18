import React, { useEffect, useState } from 'react';

interface PageTransitionProps {
  children: React.ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 250); // Fast and smooth transition simulation

    return () => clearTimeout(timer);
  }, [children]);

  if (isLoading) {
    return (
      <div className="flex-1 p-8 space-y-6 max-w-7xl mx-auto w-full animate-pulse" dir="rtl">
        <div className="h-12 bg-slate-800/60 dark:bg-[#2C2C2E]/60 rounded-2xl w-1/3"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-64 bg-slate-800/40 dark:bg-[#2C2C2E]/40 rounded-3xl"></div>
          <div className="h-64 bg-slate-800/40 dark:bg-[#2C2C2E]/40 rounded-3xl"></div>
          <div className="h-64 bg-slate-800/40 dark:bg-[#2C2C2E]/40 rounded-3xl"></div>
        </div>
        <div className="h-48 bg-slate-800/40 dark:bg-[#2C2C2E]/40 rounded-3xl w-full"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 animate-in fade-in duration-300">
      {children}
    </div>
  );
}
