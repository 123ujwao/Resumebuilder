import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  pdf,
} from '@react-pdf/renderer';
import type { ResumeData } from '@resume-forge/core';
import type { TemplateId } from '../../store/resumeStore';
import type { TemplateStyle } from '../templates/types';

/**
 * Cover-letter PDF export (Req 5.4).
 *
 * Renders the edited letter text as REAL selectable text (via
 * `@react-pdf/renderer`) with the applicant's name/contact header, using the
 * SAME template family as the resume: it honors the resume template's
 * serif/sans character plus the user's chosen font + accent color so the cover
 * letter matches the resume it accompanies.
 *
 * This mirrors the resume PDF module (features/export/pdf.tsx) but lays out
 * prose paragraphs instead of resume sections.
 */

/** Per-template presentation config (mirrors the resume PDF config subset). */
interface CoverLetterPdfConfig {
  serif: boolean;
  accentHeader: boolean;
}

const TEMPLATE_CONFIGS: Record<TemplateId, CoverLetterPdfConfig> = {
  classic: { serif: true, accentHeader: false },
  modern: { serif: false, accentHeader: true },
  compact: { serif: false, accentHeader: false },
  'two-column': { serif: false, accentHeader: true },
  minimal: { serif: false, accentHeader: false },
};

/** Map the safe font choice + template default to a react-pdf built-in font. */
function resolveFontFamily(font: string, serifDefault: boolean): string {
  const serifFonts = new Set(['Georgia', 'Times New Roman']);
  if (serifFonts.has(font)) return 'Times-Roman';
  const sansFonts = new Set(['Inter', 'Arial', 'Roboto']);
  if (sansFonts.has(font)) return 'Helvetica';
  return serifDefault ? 'Times-Roman' : 'Helvetica';
}

function buildStyles(config: CoverLetterPdfConfig, style: TemplateStyle) {
  const fontFamily = resolveFontFamily(style.font, config.serif);
  const accent = config.accentHeader ? style.accentColor : '#111827';

  return StyleSheet.create({
    page: {
      paddingVertical: 48,
      paddingHorizontal: 56,
      fontFamily,
      fontSize: 11,
      color: '#111827',
      lineHeight: 1.5,
    },
    name: {
      fontSize: 20,
      fontWeight: 'bold',
      color: accent,
    },
    contact: {
      fontSize: 9,
      color: '#4b5563',
      marginTop: 3,
    },
    rule: {
      borderBottomWidth: 1,
      borderBottomColor: accent,
      marginTop: 8,
      marginBottom: 16,
    },
    paragraph: {
      marginBottom: 10,
    },
  });
}

/** Split the letter into paragraphs on blank lines (collapsing extra blanks). */
export function splitParagraphs(letter: string): string[] {
  return letter
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** The react-pdf document for a cover letter. */
export function CoverLetterPdfDocument({
  letter,
  personalInfo,
  templateId,
  style,
}: {
  letter: string;
  personalInfo: ResumeData['personalInfo'];
  templateId: TemplateId;
  style: TemplateStyle;
}) {
  const config = TEMPLATE_CONFIGS[templateId] ?? TEMPLATE_CONFIGS.classic;
  const styles = buildStyles(config, style);

  const contactParts = [
    personalInfo.email,
    personalInfo.phone,
    personalInfo.location,
    personalInfo.linkedin,
    personalInfo.portfolio,
  ]
    .map((v) => v?.trim())
    .filter(Boolean);

  const paragraphs = splitParagraphs(letter);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View>
          {personalInfo.name.trim() ? (
            <Text style={styles.name}>{personalInfo.name}</Text>
          ) : null}
          {contactParts.length > 0 ? (
            <Text style={styles.contact}>{contactParts.join('  •  ')}</Text>
          ) : null}
          <View style={styles.rule} />
        </View>
        {paragraphs.map((p, i) => (
          <Text key={i} style={styles.paragraph}>
            {p}
          </Text>
        ))}
      </Page>
    </Document>
  );
}

/**
 * Generate a PDF {@link Blob} for a cover letter, rendered in the resume's
 * template family + style (Req 5.4). Fully in-browser (privacy).
 */
export async function exportCoverLetterPdf(
  letter: string,
  personalInfo: ResumeData['personalInfo'],
  templateId: TemplateId,
  style: TemplateStyle,
): Promise<Blob> {
  const instance = pdf(
    <CoverLetterPdfDocument
      letter={letter}
      personalInfo={personalInfo}
      templateId={templateId}
      style={style}
    />,
  );
  return instance.toBlob();
}
