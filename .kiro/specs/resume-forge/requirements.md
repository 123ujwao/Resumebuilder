# Requirements Document

## Introduction

ResumeForge is a free, client-side web application paired with a Chrome extension that lets anyone build a professional resume by describing their experience in plain language. It auto-tailors that resume and a matching cover letter to any job description, and auto-fills job application forms so the user only has to review and click Submit themselves.

The product is intentionally built with a minimal backend: only Supabase (Auth + Postgres with Row Level Security) is used, and it exists solely to make trial limits, payment requests, and admin controls tamper-proof (they cannot be reset by clearing browser storage). Resume content itself stays in the browser's `localStorage`. All AI calls go directly from the browser to the Anthropic API using the user's own API key (bring-your-own-key).

Monetization is deliberately low-friction: building, editing, and tailoring are always free and unlimited; only downloads (PDF/DOCX export) are gated after 2 free downloads. Payment is handled manually through a UPI QR code and admin verification, avoiding payment-gateway fees and integrations.

The experience must be highly interactive and delightful: real-time live preview, smooth drag-and-drop editing, responsive feedback, and clear empty/loading/error states throughout.

### Non-Negotiable Core Principles
1. **Minimal backend (Supabase only).** No custom server. No user data leaves the client except to the configured Supabase project (account metadata only) and to `api.anthropic.com` (via the user's own key).
2. **2 free downloads, then pay-to-continue.** Only the download/export is gated.
3. **Manual payment via UPI QR + admin verification.** No payment gateway.
4. **Admin can grant permanent free access** to any user, overriding payment.
5. **Bring-your-own-key (BYOK).** Anthropic API key lives in `localStorage` only, sent only to Anthropic.
6. **No auto-submission of job applications.** The extension autofills but never clicks Submit.
7. **Facts must never be invented.** Tailoring may rephrase/reorder/re-emphasize existing content but must never fabricate employers, dates, degrees, or skills.

### Configuration Note
The Supabase project connection (URL and anon key) must be configurable via environment variables, never hard-coded, since the operator will supply their own Supabase account.

## Glossary

- **BYOK (Bring-Your-Own-Key):** The model where each user supplies their own Anthropic API key, stored locally and used directly from the browser.
- **JD (Job Description):** The text of a job posting used as input for tailoring and cover-letter generation.
- **Tailoring:** Reordering, re-weighting, and rephrasing a user's existing resume content to match a JD without inventing new facts.
- **matchScore:** A 0-100 score returned by the AI estimating how well the resume matches the JD.
- **Gaps:** JD requirements not currently addressed by the resume, shown to the user as a checklist.
- **ATS (Applicant Tracking System):** Software that parses resume text; ATS-friendly templates avoid layouts that break parsing.
- **Base Resume:** The user's canonical resume; tailored versions are saved alongside it and never overwrite it.
- **Download Gating:** The logic controlling whether an export is allowed based on free-download count, credits, or free-forever status.
- **Free-forever:** An admin-set flag on a user that permanently exempts them from download gating.
- **Credit:** A single unlocked download for a specific product type, granted when an admin approves a payment.
- **Product:** A purchasable unlock type (e.g., "resume_only", "resume_plus_cover_letter") with a price and an unlocks_count.
- **Payment Request:** A user-created record claiming they paid via UPI, pending manual admin verification.
- **UPI QR:** A client-side generated QR code encoding a `upi://pay` deep link for manual payment.
- **RLS (Row Level Security):** Postgres policies in Supabase that enforce who can read/write which rows.
- **Admin:** A user listed in the `admins` table with access to the protected admin panel.

---

## Requirements

### Requirement 1: Bring-Your-Own-Key (BYOK) API Key Management

**User Story:** As a user, I want to provide my own Anthropic API key that stays private on my device, so that I can use AI features for free/low-cost without trusting a third-party server with my key.

#### Acceptance Criteria
1. WHEN a user loads the app for the first time AND no API key is stored THEN the system SHALL prompt the user to paste an Anthropic API key.
2. WHEN a user enters an API key THEN the system SHALL store it in `localStorage` only and SHALL NOT transmit it to Supabase or any server other than `api.anthropic.com`.
3. WHEN the API key input is displayed THEN the system SHALL mask the key as a password field and SHALL provide a show/hide toggle.
4. WHERE the API key prompt is shown THE system SHALL display a help link explaining how to obtain an Anthropic API key.
5. WHEN a user attempts to use an AI feature AND no API key is stored THEN the system SHALL block the action and prompt for a key instead of failing silently.
6. WHEN the Anthropic API returns an authentication or rate-limit error THEN the system SHALL show a clear, actionable error message to the user.
7. WHERE a settings area exists THE system SHALL allow the user to update or clear the stored API key at any time.

### Requirement 2: Natural-Language Resume Builder

**User Story:** As a job seeker, I want to describe my experience in plain, casual language and have it structured for me, so that I don't have to fight with rigid forms to start my resume.

#### Acceptance Criteria
1. WHEN a user opens the builder THEN the system SHALL present a chat-like interface inviting freeform text about work experience, education, and skills.
2. WHEN a user submits freeform text THEN the system SHALL send it to the Anthropic API with a system prompt that extracts a structured JSON schema containing `personalInfo` (name, email, phone, location, linkedin, portfolio), `summary`, `experience[]` (company, title, location, startDate, endDate, bullets[]), `education[]` (institution, degree, field, startDate, endDate, gpa optional), `skills[]` (categorized), `projects[]` (name, description, bullets[], techStack[]), and `certifications[]`.
3. WHEN the AI returns structured data THEN the system SHALL populate an editable form UI where every field is editable.
4. WHEN a user edits experience, project, or other bullet lists THEN the system SHALL allow adding, removing, and reordering bullets via drag-and-drop.
5. WHERE the user prefers to start from an existing resume THE system SHALL allow pasting resume text OR uploading a PDF, extracting text client-side, and running it through the same extraction pipeline.
6. WHEN any field is edited THEN the system SHALL autosave the structured data to `localStorage` with debouncing.
7. IF the AI extraction fails or returns malformed JSON THEN the system SHALL show a recoverable error and preserve any existing structured data.
8. THE system SHALL treat the natural-language step as a starting point only, always exposing and allowing edits to the structured fields afterward.

### Requirement 3: Resume Templates and Live Preview

**User Story:** As a user, I want to choose from multiple polished templates and see my resume update live, so that I can pick a look I love without losing my data.

#### Acceptance Criteria
1. THE system SHALL provide at least 5 templates: Classic (single-column serif), Modern (single-column sans-serif with subtle accent), Compact (dense, for students/freshers), Two-column (skills sidebar + main content), and Minimal (whitespace-heavy, executive).
2. WHERE a template is designed for ATS parsing THE system SHALL avoid tables/graphics that break text parsing.
3. WHEN the Two-column template is selected THEN the system SHALL display a warning icon indicating it "may not be ATS-safe".
4. WHEN structured resume data changes THEN the system SHALL update the live preview panel in real time.
5. WHEN a user switches templates THEN the system SHALL re-render the same underlying data without any data loss.
6. WHERE styling options exist THE system SHALL provide a font picker and an accent color picker limited to a safe palette.

### Requirement 4: JD-Based Resume Tailoring

**User Story:** As an applicant, I want my resume automatically tailored to a specific job description, so that I surface the most relevant experience without fabricating anything.

#### Acceptance Criteria
1. WHEN a user pastes a job description AND requests tailoring THEN the system SHALL send the JD plus the user's full structured resume data to the Anthropic API.
2. WHEN tailoring THEN the system SHALL instruct the AI to identify key skills/keywords in the JD, reorder and re-weight existing skills and bullets to surface the most relevant first, and rephrase existing bullets to mirror JD language only where truthful overlap exists.
3. THE system SHALL NOT allow the AI to fabricate new employers, dates, degrees, or skills the user did not provide.
4. WHEN tailoring completes THEN the system SHALL return and display a `matchScore` (0-100) and a list of "gaps" (JD requirements not addressed) shown as a visible checklist, never silently hidden.
5. WHEN a tailored result is produced THEN the system SHALL save it as a new version alongside the original (e.g., "Base Resume", "Tailored — [Company] [Date]") and SHALL NOT overwrite the base resume.
6. WHEN a user reviews a tailored version THEN the system SHALL present a diff view (original bullet vs tailored bullet) before finalizing.
7. WHEN reviewing tailored changes THEN the system SHALL allow the user to accept, tweak, or revert any individual change.

### Requirement 5: Cover Letter Generator

**User Story:** As an applicant, I want a matching cover letter generated from my resume and the job description, so that I can apply faster with a coherent narrative.

#### Acceptance Criteria
1. WHEN a user requests a cover letter AND a JD and resume data exist THEN the system SHALL generate a 3-4 paragraph cover letter with an opening hook, 1-2 paragraphs connecting specific resume experience to specific JD requirements, and a closing call-to-action.
2. WHERE tone matters THE system SHALL provide a tone selector with Formal, Conversational, and Enthusiastic-student options that influence generation.
3. WHEN a cover letter is generated THEN the system SHALL allow the user to edit it freely afterward.
4. WHEN exporting THEN the system SHALL export the cover letter alongside the resume in the same template family.

### Requirement 6: Export (PDF and DOCX)

**User Story:** As a user, I want to export my resume and cover letter as high-quality PDF and DOCX files, so that they look right and pass ATS parsing.

#### Acceptance Criteria
1. WHEN a user exports to PDF THEN the system SHALL produce a document that is pixel-accurate to the on-screen template AND contains selectable text (not a rasterized image).
2. WHEN a user exports to DOCX THEN the system SHALL produce a real Word document with proper headings/styles that remains editable in Word and is ATS-parseable.
3. THE system SHALL make both PDF and DOCX export available for every saved version (base resume and each tailored variant).
4. WHEN an export is requested THEN the system SHALL first apply the download gating logic (see Requirement 8) before producing the file.

### Requirement 7: User Accounts (Supabase Auth)

**User Story:** As a user, I want to create an account and sign in, so that my trial usage and any unlocked downloads are tied to my real identity and not resettable by clearing my browser.

#### Acceptance Criteria
1. THE system SHALL allow building and editing a resume before any login.
2. WHEN a user attempts to download AND is not signed in THEN the system SHALL prompt login/signup before proceeding.
3. THE system SHALL support Supabase Auth via email/password and SHALL optionally support Google sign-in.
4. WHEN a new user signs up THEN the system SHALL create a `profiles` row (id references `auth.users`) with `email`, `display_name`, `created_at`, `last_login_at`, `free_downloads_used` (default 0), and `is_free_forever` (default false).
5. WHEN a user signs in THEN the system SHALL update `last_login_at`.
6. THE system SHALL read a user's own `profiles` row via RLS and SHALL NOT allow a user to write `is_free_forever` for themselves or anyone else.
7. WHERE the Supabase connection is configured THE system SHALL read the Supabase URL and anon key from environment variables, never hard-coded values.

### Requirement 8: Download Gating (Trial + Credits)

**User Story:** As the operator, I want downloads gated after 2 free uses per user with paid credits or free-forever overrides, so that the app can monetize fairly while keeping building free.

#### Acceptance Criteria
1. THE system SHALL keep building, editing, and tailoring free and unlimited, gating only downloads/exports.
2. WHEN a user requests a download AND `is_free_forever` is true THEN the system SHALL allow the download immediately without consuming any count or credit.
3. WHEN a user requests a download AND `is_free_forever` is false AND `free_downloads_used` < 2 THEN the system SHALL allow the download AND increment `free_downloads_used`.
4. THE system SHALL treat the 2 free downloads as shared across all product types, not per-type.
5. WHEN a user requests a download AND free downloads are exhausted AND `credits_remaining` > 0 for that product type THEN the system SHALL allow the download AND decrement `credits_remaining`.
6. WHEN a user requests a download AND free downloads are exhausted AND no credits remain for that product THEN the system SHALL present the payment flow (Requirement 9) for that product's price.
7. THE system SHALL support product types via a `products` table (`id`, `name` such as "resume_only" / "resume_plus_cover_letter", `price`, `unlocks_count`, `active`).
8. THE system SHALL track per-product credits via a `user_credits` table (`user_id`, `product_id`, `credits_remaining`).
9. THE system SHALL display the free-download count capped at 2 in the UI.
10. THE system SHALL enforce increment/decrement of counts and credits in a way that cannot be bypassed by clearing browser storage (server-side state in Supabase, protected by RLS).

### Requirement 9: Payment Flow (UPI QR, Manual Verification)

**User Story:** As a user who has used my free downloads, I want to pay a small fee via UPI and get unlocked, so that I can keep downloading without a complex checkout.

#### Acceptance Criteria
1. WHEN a user hits the paywall for a product THEN the system SHALL generate a UPI QR code client-side using the `qrcode` library encoding a `upi://pay?pa=<upi_id>&am=<price>&cu=INR&tn=<note>` deep link with the amount pre-filled.
2. THE system SHALL read `upi_id` and `note` from an admin-editable `payment_settings` table and the price from the `products` table.
3. WHEN a user clicks "I've paid" THEN the system SHALL insert a `payment_requests` row `{ user_id, product_id, amount_claimed, status: "pending", requested_at }`.
4. WHEN a payment request is pending THEN the system SHALL show a "Pending admin verification" state AND keep that product's download locked until admin approval.
5. THE system SHALL clearly communicate to the user that verification is manual and approval may take time.
6. THE system SHALL allow a user to insert their own `payment_requests` via RLS but SHALL NOT allow the user to update the `status` field.
7. THE system SHALL NOT integrate any automatic payment gateway.

### Requirement 10: Admin Panel

**User Story:** As an admin, I want a protected panel to manage users, verify payments, and configure pricing, so that I can operate the service without touching the database directly.

#### Acceptance Criteria
1. THE system SHALL expose an admin panel at a separate route (e.g., `/admin`) that is NOT linked anywhere in the normal user UI.
2. THE system SHALL gate the admin panel behind an `admins` table, enforced by RLS so only listed users can read/write protected tables.
3. WHEN an admin opens the Users tab THEN the system SHALL show all users with email, last login, free downloads used, credits remaining per product, and an `is_free_forever` toggle, with search/filter by email.
4. WHEN an admin toggles `is_free_forever` for a user THEN the system SHALL persist the change so that user always downloads free.
5. WHEN an admin opens the Payment Requests tab THEN the system SHALL list pending requests with user email, product name, amount claimed, and timestamp.
6. WHEN an admin approves a payment request THEN the system SHALL set `status: "approved"`, increment that user's `credits_remaining` for that product by the product's `unlocks_count`, and set `approved_at`.
7. WHEN an admin rejects a payment request THEN the system SHALL set `status: "rejected"` and SHALL NOT unlock anything.
8. THE system SHALL provide a history view of past approved/rejected requests.
9. WHEN an admin opens the Products & Pricing tab THEN the system SHALL allow adding, editing, and deactivating products (name, price, unlocks_count) and editing the global `upi_id` and payment `note`.
10. THE system SHALL enforce via RLS that `products` and `payment_settings` are publicly readable but admin-only writable.

### Requirement 11: Chrome Extension (Autofill, Not Auto-Submit)

**User Story:** As an applicant, I want a browser extension that reads a job posting, tailors my resume, and autofills the application form, so that I only have to review and click Submit myself.

#### Acceptance Criteria
1. THE system SHALL provide a Manifest V3 Chrome extension with a content script and a popup.
2. THE extension SHALL share auth/resume data with the web app via `chrome.storage.local` (same browser profile).
3. WHEN the extension detects a supported job posting page (starting with LinkedIn Easy Apply, Indeed, Naukri) THEN it SHALL extract the job description text.
4. WHEN a job posting is detected THEN the extension SHALL show a popup offering to "Tailor resume for this job?" and run the tailoring flow (Requirement 4) in the background.
5. WHEN a user chooses "Autofill this application" THEN the extension SHALL map structured resume fields (name, email, phone, experience, education) to detected form fields using label-matching heuristics.
6. THE extension SHALL NEVER click Submit/Apply automatically and SHALL always stop at the final human review step.
7. THE extension SHALL display a clear disclaimer that field detection is best-effort and may need manual correction, and that the user must review before submitting.

### Requirement 12: Data Privacy and User Data Controls

**User Story:** As a privacy-conscious user, I want my resume content to stay on my device and be able to export or delete it, so that I stay in control of my data.

#### Acceptance Criteria
1. THE system SHALL keep resume content in `localStorage` while editing and SHALL NOT send resume content to Supabase unless the user opts into cross-device sync (a nice-to-have, not required for v1).
2. IF cross-device sync is enabled THEN the system SHALL store resumes in a Supabase `resumes` table with a `user_id` foreign key and RLS so users only see their own rows.
3. THE system SHALL provide an "Export my data" control that exports locally stored resume content.
4. THE system SHALL provide a "Delete all my data" control that clears locally stored resume content.
5. THE system SHALL never send the Anthropic API key to Supabase or any server other than `api.anthropic.com`.
6. THE system SHALL only send account metadata (profile, download counts, payment requests, credits) to Supabase.

### Requirement 13: Interactive, Delightful UX

**User Story:** As a user, I want the app to feel polished, responsive, and enjoyable, so that I actually want to use it and recommend it.

#### Acceptance Criteria
1. WHEN any long-running action occurs (AI extraction, tailoring, export) THEN the system SHALL show a clear loading/progress state.
2. WHEN a section has no data yet THEN the system SHALL show a helpful empty state guiding the user's next action.
3. WHEN an error occurs THEN the system SHALL show a clear, non-technical, recoverable error message.
4. WHEN a user reorders bullets or sections THEN the system SHALL provide smooth drag-and-drop with visual feedback.
5. WHEN structured data changes THEN the live preview SHALL update without noticeable lag.
6. THE system SHALL be responsive and usable across common desktop viewport sizes.

### Requirement 14: Scope Boundaries

**User Story:** As the operator, I want clear scope boundaries for v1, so that the team does not build features that create legal, security, or maintenance risk.

#### Acceptance Criteria
1. THE system SHALL NOT perform silent or automatic job-application form submission without human review.
2. THE system SHALL NOT integrate automatic payment verification via a payment gateway.
3. THE system SHALL NOT perform bulk scraping of job boards to find listings.
4. WHERE a feature is out of scope for v1 THE system SHALL exclude it from implementation rather than partially implementing it.
