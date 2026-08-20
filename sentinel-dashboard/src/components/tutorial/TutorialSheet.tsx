"use client";

import { useEffect, useRef } from "react";
import { TUTORIAL_TERMS, type TutorialTermId } from "@/lib/tutorial";
import { useAppShell } from "@/components/shell/AppProviders";

export function TutorialSheet() {
  const { tutorialOpen, tutorialTerm, closeTutorial } = useAppShell();
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tutorialOpen || !tutorialTerm || !bodyRef.current) return;
    const el = bodyRef.current.querySelector(`#term-${tutorialTerm}`);
    if (el) {
      window.setTimeout(() => {
        el.scrollIntoView({ block: "start", behavior: "smooth" });
      }, 80);
    }
  }, [tutorialOpen, tutorialTerm]);

  if (!tutorialOpen) return null;

  return (
    <div
      className="absolute inset-0 z-[80] bg-[rgba(5,7,15,0.72)] backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeTutorial();
      }}
    >
      <div className="absolute bottom-0 left-0 right-0 flex max-h-[86%] flex-col rounded-t-[22px] border border-line bg-deep">
        <div className="mx-auto mb-1 mt-2.5 h-1 w-9 shrink-0 rounded-full bg-line" />
        <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-2.5">
          <h2 className="text-[17px] font-semibold">Comment lire une alerte</h2>
          <button
            type="button"
            onClick={closeTutorial}
            className="grid h-7 w-7 place-items-center rounded-[9px] bg-panel2 text-[13px] text-muted"
          >
            ✕
          </button>
        </div>
        <div
          ref={bodyRef}
          className="overflow-y-auto px-5 pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {TUTORIAL_TERMS.map((term) => (
            <div
              key={term.id}
              id={`term-${term.id}`}
              className={`mb-2.5 scroll-mt-2 rounded-[14px] border border-line bg-panel p-3.5 transition-colors ${
                tutorialTerm === term.id ? "border-ice bg-panel2" : ""
              }`}
            >
              <div className="mb-2 flex items-center gap-2.5">
                <div
                  className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] font-mono text-xs font-semibold text-white"
                  style={{ background: term.swatch }}
                >
                  {term.swatchLabel}
                </div>
                <h3 className="text-[13.5px] font-semibold">
                  {term.title}
                  {term.subtitle ? (
                    <span className="ml-1 font-mono text-[9.5px] font-normal text-muted">
                      {term.subtitle}
                    </span>
                  ) : null}
                </h3>
              </div>
              {term.paragraphs.map((p, i) => (
                <p
                  key={i}
                  className={`mb-2 text-[11.5px] leading-relaxed text-ice/90 ${
                    i === term.paragraphs.length - 1 && term.paragraphs.length > 1
                      ? "opacity-65"
                      : ""
                  }`}
                >
                  {p}
                </p>
              ))}
              {term.scale ? (
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="font-mono text-[9px] text-muted">0</span>
                  <div
                    className="h-[5px] flex-1 rounded-full"
                    style={{
                      background:
                        "linear-gradient(90deg, var(--line), #7E9AD8, var(--signal))",
                    }}
                  />
                  <span className="font-mono text-[9px] text-muted">100</span>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function InfoButton({ term }: { term: TutorialTermId }) {
  const { openTutorial } = useAppShell();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        openTutorial(term);
      }}
      className="ml-1 inline-grid h-[15px] w-[15px] shrink-0 place-items-center rounded-full border border-line bg-panel2 font-mono text-[9px] text-muted"
    >
      i
    </button>
  );
}
