// First-run guided tour + persistent "Getting started" checklist.
import { useEffect, useLayoutEffect, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Circle, X } from "lucide-react";
import { dismissOnboarding, ONBOARDING_STEPS, onboardingState, subscribeOnboarding } from "../lib/track";

const TOUR_KEY = "adcanvas-tour-done";

const TOUR: { selector: string; title: string; text: string }[] = [
  { selector: "[data-tour=ai-build]", title: "Start with AI Build", text: "Describe what you sell, who it's for and your budget. AI lays out the whole funnel with realistic numbers in seconds." },
  { selector: "[data-tour=canvas]", title: "Your campaign canvas", text: "Drag to move around, scroll or pinch to zoom, Shift-drag to select several steps. Select a step and press + to add what comes next." },
  { selector: "[data-tour=palette]", title: "150+ building blocks", text: "Ad channels, pages, emails, sales steps and tools. Drag one onto the canvas or click to add it. Filter for B2B or B2C." },
  { selector: "[data-tour=kpis]", title: "Live forecast", text: "Every change updates spend, customers, revenue and ROAS instantly. Switch to Analyze to compare against real results." },
  { selector: "[data-tour=side]", title: "Inspect, analyze, ask", text: "Edit a step's numbers and copy, get AI recommendations in Insights, or ask the AI to change the plan for you." },
];

export function Tour({ enabled }: { enabled: boolean }) {
  const [step, setStep] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let done = false;
    try {
      done = !!localStorage.getItem(TOUR_KEY);
    } catch {
      /* ignore */
    }
    if (!done) setTimeout(() => setStep(0), 600);
  }, [enabled]);

  useLayoutEffect(() => {
    if (step === null) return;
    const measure = () => setRect(document.querySelector(TOUR[step].selector)?.getBoundingClientRect() ?? null);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [step]);

  if (step === null) return null;
  const finish = () => {
    try {
      localStorage.setItem(TOUR_KEY, "1");
    } catch {
      /* ignore */
    }
    setStep(null);
  };
  const t = TOUR[step];
  // Place the card next to the target, clamped to the viewport.
  const W = 320;
  let left = rect ? rect.left + rect.width / 2 - W / 2 : window.innerWidth / 2 - W / 2;
  let top = rect ? rect.bottom + 12 : window.innerHeight / 2 - 80;
  if (rect && top + 200 > window.innerHeight) top = Math.max(12, rect.top - 212);
  if (rect && rect.height > window.innerHeight * 0.6) {
    top = rect.top + 80;
    left = rect.right + 12 + W < window.innerWidth ? rect.right + 12 : rect.left + 12;
  }
  left = Math.min(Math.max(12, left), window.innerWidth - W - 12);

  return (
    <div className="tour" role="dialog" aria-label="Product tour">
      {rect && <div className="tour-spot" style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }} />}
      <div className="tour-card" style={{ left, top, width: W }}>
        <div className="tour-step">
          {step + 1} of {TOUR.length}
        </div>
        <h3>{t.title}</h3>
        <p>{t.text}</p>
        <div className="row">
          <button className="link small" onClick={finish}>
            Skip tour
          </button>
          <div className="spacer" />
          {step > 0 && (
            <button className="btn" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <button className="btn primary" onClick={() => (step === TOUR.length - 1 ? finish() : setStep(step + 1))}>
            {step === TOUR.length - 1 ? "Get started" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Checklist() {
  const [state, setState] = useState(onboardingState);
  // Open while nothing is done yet; afterwards it stays a compact pill until clicked.
  const [open, setOpen] = useState(() => !ONBOARDING_STEPS.some((s) => onboardingState()[s.event]));
  useEffect(() => {
    const off = subscribeOnboarding(() => setState(onboardingState()));
    return () => void off();
  }, []);
  const done = ONBOARDING_STEPS.filter((s) => state[s.event]).length;
  if (state.__dismissed || done === ONBOARDING_STEPS.length) return null;
  const next = ONBOARDING_STEPS.find((s) => !state[s.event]);
  return (
    <div className={`checklist ${open ? "open" : ""}`}>
      <button className="checklist-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <div className="checklist-ring" style={{ "--v": (done / ONBOARDING_STEPS.length) * 100 } as React.CSSProperties}>
          <span>{done}</span>
        </div>
        <div className="grow">
          <b>Getting started</b>
          <div className="muted small">{done} of {ONBOARDING_STEPS.length} done</div>
        </div>
        {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>
      {open && (
        <>
          <ul>
            {ONBOARDING_STEPS.map((s) => (
              <li key={s.event} className={state[s.event] ? "done" : s === next ? "next" : ""}>
                {state[s.event] ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                <div>
                  <span>{s.label}</span>
                  {s === next && <p>{s.hint}</p>}
                </div>
              </li>
            ))}
          </ul>
          <button className="link small" onClick={dismissOnboarding}>
            <X size={12} /> Hide checklist
          </button>
        </>
      )}
    </div>
  );
}
