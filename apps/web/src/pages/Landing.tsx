import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../features/auth';

/**
 * Marketing landing page shown at "/" (the builder now lives at "/app").
 *
 * This is a self-contained, responsive marketing page built with core Tailwind
 * utilities only (no new dependencies, no custom theme). It explains what
 * ResumeForge is and funnels visitors into the builder via prominent CTAs.
 *
 * Auth is optional here: the "Sign in" button opens the shared AuthModal
 * (mounted in AppRoutes) via `useAuthStore.openModal()`, while every primary
 * CTA simply navigates to "/app" — building never requires an account
 * (Req 7.1).
 */

/**
 * The ResumeForge logo mark: a rounded gradient tile holding a stylized
 * document with a spark, hinting at "AI-crafted resume". Rendered as inline SVG
 * so it stays crisp at any size and needs no asset pipeline.
 */
function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-sky-500 text-white shadow-md shadow-indigo-500/30 ring-1 ring-white/40 ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-[58%] w-[58%]">
        {/* Document sheet */}
        <path
          d="M7 3.5h6.2L18 8v11.2A1.3 1.3 0 0 1 16.7 20.5H7A1.3 1.3 0 0 1 5.7 19.2V4.8A1.3 1.3 0 0 1 7 3.5Z"
          fill="currentColor"
          fillOpacity="0.95"
        />
        {/* Folded corner */}
        <path d="M13 3.7V8h4.3" stroke="#4338ca" strokeWidth="1.1" strokeLinejoin="round" fill="none" />
        {/* Text lines */}
        <path
          d="M8.2 11.4h4.4M8.2 14h6M8.2 16.6h3.4"
          stroke="#4338ca"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
        {/* Spark */}
        <path
          d="M16.4 12.1c.25 1 .55 1.3 1.55 1.55-1 .25-1.3.55-1.55 1.55-.25-1-.55-1.3-1.55-1.55 1-.25 1.3-.55 1.55-1.55Z"
          fill="#fde68a"
          stroke="#f59e0b"
          strokeWidth="0.5"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function Wordmark({ logoClassName }: { logoClassName?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark className={logoClassName} />
      <span className="text-lg font-bold tracking-tight text-slate-900">
        Resume<span className="text-indigo-600">Forge</span>
      </span>
    </span>
  );
}

/** Small helper for a consistent inline SVG icon frame. */
function IconFrame({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm shadow-indigo-500/30 ring-1 ring-inset ring-white/30 transition-transform duration-300 group-hover:scale-110"
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

/**
 * Literal delay utility classes for staggered reveals, indexed by position.
 * Kept as full string literals so Tailwind's content scanner keeps them.
 */
const STAGGER = [
  'anim-delay-100',
  'anim-delay-200',
  'anim-delay-300',
  'anim-delay-400',
  'anim-delay-500',
] as const;

/** Pick a stagger delay class, clamping to the largest available. */
function stagger(i: number): string {
  return STAGGER[Math.min(i, STAGGER.length - 1)];
}

interface Feature {
  title: string;
  description: string;
  icon: ReactNode;
}

const FEATURES: Feature[] = [
  {
    title: 'Describe it, don’t format it',
    description:
      'Write your background in plain English. AI structures it into a clean, professional resume — no fiddling with layouts.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 6h16M4 12h10M4 18h7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'Tailor to any job',
    description:
      'Paste a job description and your resume is re-weighted and rephrased to match — with a match score and gap checklist. Never invents facts.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="1.8">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'Matching cover letters',
    description:
      'Generate a cover letter that fits the role in the tone you choose — confident, warm, or formal — in one click.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m4 7 8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: '5 ATS-friendly templates',
    description:
      'Switch templates live and personalize fonts and accent colors. Every template is built to pass applicant tracking systems.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="1.8">
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'Export to PDF & DOCX',
    description:
      'Download pixel-perfect PDFs with real selectable text, plus fully editable Word documents for when you need to tweak.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 3v12m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 21h14" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'Private by design',
    description:
      'Your resume stays in your browser. Export it or delete your data anytime — you stay in control from start to finish.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 3 5 6v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" strokeLinejoin="round" />
        <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

interface Step {
  title: string;
  description: string;
}

const STEPS: Step[] = [
  {
    title: 'Describe your experience',
    description:
      'Type or paste your background in plain language. No templates to wrestle with — just tell your story.',
  },
  {
    title: 'Pick a template & tailor to the job',
    description:
      'Choose from 5 ATS-friendly designs, then paste a job description to tailor the wording and see your match score.',
  },
  {
    title: 'Download PDF or DOCX',
    description:
      'Export a polished, ready-to-send resume — and a matching cover letter — in the format you need.',
  },
];

interface Faq {
  q: string;
  a: string;
}

const FAQS: Faq[] = [
  {
    q: 'Do I need an account to start?',
    a: 'No. You can build, edit, and tailor your resume without signing up. An account is only needed when you download, so your files are tied to you.',
  },
  {
    q: 'Is my data private?',
    a: 'Yes. Your resume content stays in your browser by design. You can export it or delete your data at any time — nothing is shared without your say-so.',
  },
  {
    q: 'What does it cost?',
    a: 'Building, editing, and tailoring are unlimited and free. You get 2 free downloads, then a small one-time UPI payment keeps you going. No subscription.',
  },
  {
    q: 'Does it work with ATS?',
    a: 'Every template is designed to be applicant-tracking-system friendly, with clean structure and real selectable text in the exported PDF.',
  },
  {
    q: 'Do you auto-submit my job applications?',
    a: 'Never. The optional Chrome extension autofills application forms to save you time, but you always review and submit yourself.',
  },
  {
    q: 'Will it make things up about me?',
    a: 'No. Tailoring re-weights and rephrases what you’ve written to match a role — it never invents facts. It flags gaps instead so you decide what to add.',
  },
];

/**
 * Framed 16:9 animated product demo for the hero's right column.
 *
 * Embeds the self-contained looping demo at `/demo.html` (in `public/`) via a
 * sandboxed iframe. The demo cycles through the product's key scenes (describe →
 * templates → tailoring → download) on its own, so no play button is needed.
 * The iframe is scaled to fit the frame responsively.
 */
function HeroDemo() {
  return (
    <div className="animate-float relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 shadow-2xl shadow-indigo-300/50 ring-1 ring-white/40">
      <iframe
        src="/demo.html"
        title="ResumeForge product demo"
        loading="lazy"
        sandbox="allow-scripts"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[920px] -translate-x-1/2 -translate-y-1/2 origin-center scale-[0.52] border-0 sm:scale-[0.6] lg:scale-[0.52] xl:scale-[0.62]"
      />
    </div>
  );
}

export function Landing() {
  const navigate = useNavigate();
  const openModal = useAuthStore((s) => s.openModal);
  const configured = useAuthStore((s) => s.configured);

  const goToApp = () => navigate('/app');

  return (
    <div className="min-h-screen bg-white text-slate-800">
      {/* ---- Sticky nav ---------------------------------------------------- */}
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <nav
          aria-label="Primary"
          className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6"
        >
          <Link to="/" className="rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            {configured && (
              <button
                type="button"
                onClick={openModal}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                Sign in
              </button>
            )}
            <Link
              to="/app"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              Build my resume
            </Link>
          </div>
        </nav>
      </header>

      <main>
        {/* ---- Hero -------------------------------------------------------- */}
        <section className="relative overflow-hidden">
          {/* Animated multi-stop gradient wash */}
          <div
            className="animate-gradient absolute inset-0 bg-gradient-to-br from-indigo-50 via-violet-100 to-sky-50 bg-[length:200%_200%]"
            aria-hidden="true"
          />
          {/* Soft drifting glow orbs */}
          <div
            className="animate-blob pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-indigo-300/40 blur-3xl"
            aria-hidden="true"
          />
          <div
            className="animate-blob anim-delay-300 pointer-events-none absolute -right-16 top-24 h-80 w-80 rounded-full bg-violet-300/40 blur-3xl"
            aria-hidden="true"
          />
          <div
            className="animate-blob anim-delay-500 pointer-events-none absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-sky-300/30 blur-3xl"
            aria-hidden="true"
          />
          {/* Dotted texture overlay */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.5] [background-image:radial-gradient(theme(colors.slate.400)_0.75px,transparent_0.75px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
            aria-hidden="true"
          />

          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
            <div className="text-center lg:text-left">
              <span className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/80 px-3 py-1 text-xs font-medium text-indigo-700 shadow-sm backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" aria-hidden="true" />
                AI resume builder for job seekers
              </span>
              <h1 className="animate-fade-up anim-delay-100 mt-5 text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                Build a job-winning resume in{' '}
                <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 bg-clip-text text-transparent">
                  minutes
                </span>
              </h1>
              <p className="animate-fade-up anim-delay-200 mx-auto mt-5 max-w-xl text-lg leading-relaxed text-slate-600 lg:mx-0">
                Just describe your experience in plain English. ResumeForge turns
                it into a polished, ATS-ready resume you can tailor to any job and
                download in seconds.
              </p>
              <div className="animate-fade-up anim-delay-300 mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <button
                  type="button"
                  onClick={goToApp}
                  className="rounded-xl bg-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:-translate-y-0.5 hover:bg-indigo-500 hover:shadow-xl hover:shadow-indigo-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                >
                  Build my resume free
                </button>
                <a
                  href="#how"
                  className="rounded-xl border border-slate-300 bg-white/80 px-6 py-3 text-center text-base font-semibold text-slate-700 backdrop-blur transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                >
                  See how it works
                </a>
              </div>
              <p className="animate-fade-up anim-delay-400 mt-5 text-sm text-slate-500">
                No credit card. No login to start. Your data stays in your browser.
              </p>
            </div>

            {/* Demo video player (replaces the static resume mockup) */}
            <div className="animate-fade-up anim-delay-300 relative mx-auto w-full max-w-md lg:max-w-none">
              <div
                className="absolute inset-0 -rotate-3 rounded-3xl bg-gradient-to-br from-indigo-200/60 to-violet-200/60 blur-xl"
                aria-hidden="true"
              />
              <HeroDemo />
              <div className="animate-float anim-delay-500 absolute -bottom-4 -right-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xl shadow-indigo-200/50 ring-1 ring-slate-100">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-700">
                    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="2">
                      <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <div>
                    <div className="text-xs text-slate-500">Match score</div>
                    <div className="text-sm font-bold text-slate-900">92%</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---- Trust strip ------------------------------------------------- */}
        <section aria-label="Highlights" className="border-y border-slate-200 bg-slate-50">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-4 py-4 text-sm font-medium text-slate-500 sm:px-6">
            <span>ATS-friendly</span>
            <span aria-hidden="true" className="text-slate-300">•</span>
            <span>PDF &amp; DOCX export</span>
            <span aria-hidden="true" className="text-slate-300">•</span>
            <span>Private by design</span>
            <span aria-hidden="true" className="text-slate-300">•</span>
            <span>Pay with UPI</span>
          </div>
        </section>

        {/* ---- How it works ------------------------------------------------ */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="animate-fade-up mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              From blank page to polished resume in 3 steps
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              No formatting headaches. No writer’s block. Just answer in your own
              words and let AI do the heavy lifting.
            </p>
          </div>
          <ol className="mt-14 grid gap-8 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className={`animate-fade-up group relative flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-transparent transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:ring-indigo-100 ${stagger(i)}`}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-base font-bold text-white shadow-sm shadow-indigo-500/30 transition-transform duration-300 group-hover:scale-110">
                  {i + 1}
                </span>
                <h3 className="mt-5 text-lg font-semibold text-slate-900">
                  {step.title}
                </h3>
                <p className="mt-2 text-slate-600">{step.description}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ---- Features grid ----------------------------------------------- */}
        <section aria-labelledby="features-heading" className="bg-gradient-to-b from-slate-50 to-white py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="animate-fade-up mx-auto max-w-2xl text-center">
              <h2 id="features-heading" className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Everything you need to land the interview
              </h2>
              <p className="mt-4 text-lg text-slate-600">
                Powerful where it counts, simple everywhere else.
              </p>
            </div>
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature, i) => (
                <article
                  key={feature.title}
                  className={`animate-fade-up group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-transparent transition duration-300 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-xl hover:ring-indigo-100 ${stagger(i)}`}
                >
                  <IconFrame>{feature.icon}</IconFrame>
                  <h3 className="mt-4 text-lg font-semibold text-slate-900">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {feature.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---- Tailoring highlight (split) --------------------------------- */}
        <section aria-labelledby="tailoring-heading" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="animate-fade-up">
              <span className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
                Smart tailoring
              </span>
              <h2 id="tailoring-heading" className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Match every job — without lying on your resume
              </h2>
              <p className="mt-4 text-lg text-slate-600">
                Paste any job description and ResumeForge re-weights your
                experience, sharpens your wording, and shows exactly how well you
                fit. It highlights gaps so you can decide what to add — it never
                fabricates experience you don’t have.
              </p>
              <ul className="mt-6 space-y-3 text-slate-700">
                {[
                  'Instant match score for any role',
                  'Gap checklist so you know what to strengthen',
                  'Rephrasing that keeps every fact honest',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-green-100 text-green-700">
                      <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="2.5">
                        <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <button
                  type="button"
                  onClick={goToApp}
                  className="rounded-xl bg-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                >
                  Try tailoring free
                </button>
              </div>
            </div>

            {/* Mock match-score + gaps card */}
            <div className="animate-fade-up anim-delay-200 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-indigo-100/50 ring-1 ring-slate-100 transition duration-300 hover:-translate-y-1 hover:shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  Match analysis
                </h3>
                <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-bold text-green-700">
                  92% match
                </span>
              </div>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full w-[92%] rounded-full bg-gradient-to-r from-indigo-500 to-violet-600" />
              </div>
              <div className="mt-6 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Covered
                </p>
                {['React & TypeScript', 'Team leadership', 'CI/CD pipelines'].map((t) => (
                  <div key={t} className="flex items-center gap-3 text-sm text-slate-700">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-700">
                      <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="2.5">
                        <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    {t}
                  </div>
                ))}
                <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Gaps to consider
                </p>
                {['Kubernetes experience', 'Mentoring metrics'].map((t) => (
                  <div key={t} className="flex items-center gap-3 text-sm text-slate-500">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                      <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="2.5">
                        <path d="M12 8v5" strokeLinecap="round" />
                        <path d="M12 16h.01" strokeLinecap="round" />
                      </svg>
                    </span>
                    {t}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ---- Pricing / free-to-start band -------------------------------- */}
        <section aria-labelledby="pricing-heading" className="px-4 pb-20 sm:px-6">
          <div className="animate-fade-up relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-indigo-700 px-6 py-14 text-center shadow-2xl shadow-indigo-500/30 sm:px-12">
            <div
              className="animate-blob pointer-events-none absolute -right-10 -top-10 h-52 w-52 rounded-full bg-white/10 blur-2xl"
              aria-hidden="true"
            />
            <div
              className="animate-blob anim-delay-400 pointer-events-none absolute -bottom-12 -left-8 h-52 w-52 rounded-full bg-sky-300/20 blur-2xl"
              aria-hidden="true"
            />
            <h2 id="pricing-heading" className="relative text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Free to build. Pay only when you download more.
            </h2>
            <p className="relative mx-auto mt-4 max-w-2xl text-lg text-indigo-100">
              Build, edit, and tailor as much as you want — completely free. Your
              first 2 downloads are on us. After that, a small one-time UPI
              payment keeps you going. No subscriptions, no surprises.
            </p>
            <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={goToApp}
                className="rounded-xl bg-white px-6 py-3 text-base font-semibold text-indigo-700 shadow-lg transition hover:-translate-y-0.5 hover:bg-indigo-50 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-600"
              >
                Get started free
              </button>
              <a
                href="#faq"
                className="rounded-xl border border-white/40 px-6 py-3 text-base font-semibold text-white transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-600"
              >
                Read the FAQ
              </a>
            </div>
            <p className="relative mt-6 text-sm text-indigo-200">
              Prefer autofill? Our Chrome extension fills job applications for you —
              you always review and submit yourself.
            </p>
          </div>
        </section>

        {/* ---- FAQ --------------------------------------------------------- */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pb-24 sm:px-6">
          <div className="animate-fade-up text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Frequently asked questions
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              Everything you might be wondering, in one place.
            </p>
          </div>
          <dl className="mt-12 space-y-4">
            {FAQS.map((faq) => (
              <details
                key={faq.q}
                className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-300 hover:border-indigo-200 hover:shadow-md [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-4 text-left text-base font-semibold text-slate-900">
                  <dt>{faq.q}</dt>
                  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-slate-100 text-slate-500 transition group-open:rotate-45" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                    </svg>
                  </span>
                </summary>
                <dd className="mt-3 text-sm leading-relaxed text-slate-600">
                  {faq.a}
                </dd>
              </details>
            ))}
          </dl>
        </section>
      </main>

      {/* ---- Footer -------------------------------------------------------- */}
      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-8 sm:flex-row">
            <div className="max-w-sm">
              <Wordmark />
              <p className="mt-3 text-sm text-slate-600">
                Describe your experience in plain English and get a polished,
                ATS-ready resume you can tailor to any job.
              </p>
            </div>
            <nav aria-label="Footer" className="flex flex-col gap-2 text-sm">
              <a href="#how" className="text-slate-600 hover:text-slate-900">
                How it works
              </a>
              <a href="#features-heading" className="text-slate-600 hover:text-slate-900">
                Features
              </a>
              <a href="#faq" className="text-slate-600 hover:text-slate-900">
                FAQ
              </a>
              <Link to="/app" className="font-medium text-indigo-600 hover:text-indigo-500">
                Build my resume
              </Link>
            </nav>
          </div>
          <div className="mt-10 border-t border-slate-200 pt-6 text-sm text-slate-500">
            © {new Date().getFullYear()} ResumeForge. Built for job seekers.
          </div>
        </div>
      </footer>
    </div>
  );
}
