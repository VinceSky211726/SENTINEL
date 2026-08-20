import { ReactNode } from "react";

export function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex h-[min(780px,88vh)] w-full max-w-[380px] flex-col overflow-hidden rounded-phone border border-line bg-deep shadow-[0_0_0_10px_#0B0F1C,0_40px_90px_-25px_rgba(0,0,0,0.95)] max-md:h-[100dvh] max-md:max-w-none max-md:rounded-none max-md:border-none max-md:shadow-none">
      <div className="pointer-events-none absolute left-1/2 top-2.5 z-[60] hidden h-[26px] w-[104px] -translate-x-1/2 rounded-[14px] bg-[#0B0F1C] md:block" />
      {children}
    </div>
  );
}
