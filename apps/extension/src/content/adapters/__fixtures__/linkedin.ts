/**
 * Saved DOM fixture for the LinkedIn Easy Apply adapter (Req 11.3).
 *
 * A small representative snippet: a JD container plus an Easy Apply form with a
 * couple of labelled fields. Structure documents what the adapter expects; real
 * LinkedIn markup is far larger but the relevant containers match these
 * selectors.
 */
export const LINKEDIN_JD_TEXT =
  'We are hiring a Frontend Engineer to build accessible React apps. ' +
  'Requirements: 3+ years of TypeScript and strong CSS fundamentals.';

export const linkedInFixture = `<!doctype html>
<html>
  <body>
    <div class="jobs-details">
      <div class="jobs-description__content">
        <div class="jobs-box__html-content">
          <p>We are hiring a Frontend Engineer to build accessible React apps.</p>
          <p>Requirements: 3+ years of TypeScript and strong CSS fundamentals.</p>
        </div>
      </div>
    </div>
    <div class="jobs-easy-apply-content">
      <form class="jobs-easy-apply-form">
        <label for="li-first-name">First name</label>
        <input id="li-first-name" name="firstName" type="text" />

        <label for="li-email">Email address</label>
        <input id="li-email" name="email" type="email" />

        <label for="li-phone">Mobile phone number</label>
        <input id="li-phone" name="phone" type="tel" />

        <button type="submit">Submit application</button>
      </form>
    </div>
  </body>
</html>`;
