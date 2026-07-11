/**
 * Saved DOM fixture for the Naukri adapter (Req 11.3).
 *
 * Representative snippet: the hashed JD container class (matched via the
 * [class*="JDC__dang-inner-html"] fallback) plus an apply form with an
 * ancestor-<label> field to exercise that label-discovery path.
 */
export const NAUKRI_JD_TEXT =
  'Data Analyst role. Build dashboards in Power BI and write SQL queries. ' +
  'Strong communication skills required.';

export const naukriFixture = `<!doctype html>
<html>
  <body>
    <section class="job-desc">
      <div class="styles_JDC__dang-inner-html__abc12">
        <p>Data Analyst role. Build dashboards in Power BI and write SQL queries.</p>
        <p>Strong communication skills required.</p>
      </div>
    </section>
    <form class="styles_apply-form__x9">
      <label>
        Your name
        <input name="name" type="text" />
      </label>
      <label for="nk-phone">Phone number</label>
      <input id="nk-phone" name="mobile" type="tel" />
      <label for="nk-resume">Attach resume</label>
      <input id="nk-resume" name="resume" type="file" />
      <button type="submit">Apply</button>
    </form>
  </body>
</html>`;
