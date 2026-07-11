/**
 * Saved DOM fixture for the Indeed adapter (Req 11.3).
 *
 * Representative snippet: the #jobDescriptionText JD container plus an apply
 * form with labelled fields (using aria-label and placeholder to exercise the
 * label-discovery fallbacks).
 */
export const INDEED_JD_TEXT =
  'Backend Developer needed. Design REST APIs in Node.js and PostgreSQL. ' +
  'Experience with cloud deployment is a plus.';

export const indeedFixture = `<!doctype html>
<html>
  <body>
    <main>
      <div class="jobsearch-JobComponent">
        <div id="jobDescriptionText" class="jobsearch-jobDescriptionText">
          <p>Backend Developer needed. Design REST APIs in Node.js and PostgreSQL.</p>
          <p>Experience with cloud deployment is a plus.</p>
        </div>
      </div>
      <form action="/apply/job">
        <input name="applicant.name" type="text" aria-label="Full name" />
        <input name="applicant.email" type="email" placeholder="you@example.com" />
        <textarea name="coverletter" aria-label="Cover letter"></textarea>
        <input type="hidden" name="csrf" value="abc" />
        <button type="submit">Continue</button>
      </form>
    </main>
  </body>
</html>`;
