import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  pdf,
} from '@react-pdf/renderer';
import type { ResumeData, ResumeVersion } from '@resume-forge/core';
import type { TemplateId } from '../../store/resumeStore';
import type { TemplateStyle } from '../templates/types';
import { visibleSections, dateRange, nonEmptyBullets } from '../templates/sections';

/**
 * PDF export (Task 9, Req 6.1).
 *
 * Uses `@react-pdf/renderer` so the output contains REAL selectable text (not a
 * rasterized snapshot — Req 6.1). Rather than maintain five separate PDF
 * documents, a single parameterized document mirrors the character of each
 * on-screen template via a small per-template config: serif vs sans font,
 * accent usage, and single- vs two-column layout. The chosen `TemplateStyle`
 * (font + accent color) from the store is honored so the PDF tracks the live
 * preview (Req 6.1).
 */

/** Per-template presentation config that shapes the shared PDF document. */
interface PdfTemplateConfig {
  /** Base font family: a serif or sans-serif built-in react-pdf font. */
  serif: boolean;
  /** Whether the layout uses a left sidebar for skills (two-column). */
  twoColumn: boolean;
  /** How prominently the accent color is used for headings/rules. */
  accentHeadings: boolean;
}

const TEMPLATE_CONFIGS: Record<TemplateId, PdfTemplateConfig> = {
  classic: { serif: true, twoColumn: false, accentHeadings: false },
  modern: { serif: false, twoColumn: false, accentHeadings: true },
  compact: { serif: false, twoColumn: false, accentHeadings: false },
  'two-column': { serif: false, twoColumn: true, accentHeadings: true },
  minimal: { serif: false, twoColumn: false, accentHeadings: false },
};

/** Map the safe font choice + template default to a react-pdf built-in font. */
function resolveFontFamily(font: string, serifDefault: boolean): string {
  // react-pdf ships with Helvetica, Times-Roman, and Courier by default.
  const serifFonts = new Set(['Georgia', 'Times New Roman']);
  if (serifFonts.has(font)) return 'Times-Roman';
  const sansFonts = new Set(['Inter', 'Arial', 'Roboto']);
  if (sansFonts.has(font)) return 'Helvetica';
  return serifDefault ? 'Times-Roman' : 'Helvetica';
}

function buildStyles(config: PdfTemplateConfig, style: TemplateStyle) {
  const fontFamily = resolveFontFamily(style.font, config.serif);
  const accent = config.accentHeadings ? style.accentColor : '#111827';

  return StyleSheet.create({
    page: {
      paddingVertical: 36,
      paddingHorizontal: 40,
      fontFamily,
      fontSize: 10,
      color: '#111827',
      lineHeight: 1.4,
    },
    row: { flexDirection: 'row' },
    sidebar: {
      width: '32%',
      paddingRight: 14,
    },
    main: {
      flexGrow: 1,
      width: config.twoColumn ? '68%' : '100%',
    },
    name: {
      fontSize: 20,
      fontWeight: 'bold',
      textAlign: config.twoColumn ? 'left' : 'center',
      color: accent,
    },
    contact: {
      fontSize: 9,
      color: '#4b5563',
      textAlign: config.twoColumn ? 'left' : 'center',
      marginTop: 3,
      marginBottom: 8,
    },
    sectionTitle: {
      fontSize: 11,
      fontWeight: 'bold',
      textTransform: 'uppercase',
      letterSpacing: 1,
      color: accent,
      borderBottomWidth: 1,
      borderBottomColor: accent,
      paddingBottom: 2,
      marginTop: 12,
      marginBottom: 5,
    },
    entryHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    entryTitle: { fontSize: 11, fontWeight: 'bold' },
    entryDate: { fontSize: 9, color: '#4b5563' },
    entryLocation: { fontSize: 9, fontStyle: 'italic', color: '#4b5563' },
    paragraph: { marginBottom: 4 },
    bulletRow: { flexDirection: 'row', marginBottom: 2, paddingLeft: 6 },
    bulletDot: { width: 10 },
    bulletText: { flexGrow: 1 },
    skillLine: { marginBottom: 3 },
    label: { fontWeight: 'bold' },
  });
}

type Styles = ReturnType<typeof buildStyles>;

function SectionTitle({ styles, children }: { styles: Styles; children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function Bullets({ styles, bullets }: { styles: Styles; bullets: { id: string; text: string }[] }) {
  return (
    <>
      {nonEmptyBullets(bullets).map((b) => (
        <View key={b.id} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{b.text}</Text>
        </View>
      ))}
    </>
  );
}

function SkillsBlock({ styles, data }: { styles: Styles; data: ResumeData }) {
  const s = visibleSections(data);
  if (s.skills.length === 0) return null;
  return (
    <>
      <SectionTitle styles={styles}>Skills</SectionTitle>
      {s.skills.map((cat) => (
        <Text key={cat.id} style={styles.skillLine}>
          {cat.name.trim() ? (
            <Text style={styles.label}>{cat.name}: </Text>
          ) : null}
          {cat.skills.filter((sk) => sk.trim()).join(', ')}
        </Text>
      ))}
    </>
  );
}

function MainSections({ styles, data }: { styles: Styles; data: ResumeData }) {
  const s = visibleSections(data);
  return (
    <>
      {s.hasSummary && (
        <>
          <SectionTitle styles={styles}>Summary</SectionTitle>
          <Text style={styles.paragraph}>{data.summary}</Text>
        </>
      )}

      {s.experience.length > 0 && (
        <>
          <SectionTitle styles={styles}>Experience</SectionTitle>
          {s.experience.map((exp) => (
            <View key={exp.id} style={styles.paragraph}>
              <View style={styles.entryHeader}>
                <Text style={styles.entryTitle}>
                  {[exp.title, exp.company].filter((v) => v.trim()).join(', ')}
                </Text>
                <Text style={styles.entryDate}>
                  {dateRange(exp.startDate, exp.endDate)}
                </Text>
              </View>
              {exp.location.trim() ? (
                <Text style={styles.entryLocation}>{exp.location}</Text>
              ) : null}
              <Bullets styles={styles} bullets={exp.bullets} />
            </View>
          ))}
        </>
      )}

      {s.projects.length > 0 && (
        <>
          <SectionTitle styles={styles}>Projects</SectionTitle>
          {s.projects.map((proj) => (
            <View key={proj.id} style={styles.paragraph}>
              <Text style={styles.entryTitle}>{proj.name}</Text>
              {proj.description.trim() ? (
                <Text>{proj.description}</Text>
              ) : null}
              <Bullets styles={styles} bullets={proj.bullets} />
              {proj.techStack.filter((t) => t.trim()).length > 0 ? (
                <Text>
                  <Text style={styles.label}>Tech: </Text>
                  {proj.techStack.filter((t) => t.trim()).join(', ')}
                </Text>
              ) : null}
            </View>
          ))}
        </>
      )}

      {s.education.length > 0 && (
        <>
          <SectionTitle styles={styles}>Education</SectionTitle>
          {s.education.map((edu) => (
            <View key={edu.id} style={styles.paragraph}>
              <View style={styles.entryHeader}>
                <Text style={styles.entryTitle}>{edu.institution}</Text>
                <Text style={styles.entryDate}>
                  {dateRange(edu.startDate, edu.endDate)}
                </Text>
              </View>
              <Text>
                {[edu.degree, edu.field].filter((v) => v.trim()).join(', ')}
                {edu.gpa?.trim() ? `  •  GPA: ${edu.gpa}` : ''}
              </Text>
            </View>
          ))}
        </>
      )}

      {s.certifications.length > 0 && (
        <>
          <SectionTitle styles={styles}>Certifications</SectionTitle>
          {s.certifications.map((cert) => (
            <View key={cert.id} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>
                {cert.name}
                {cert.issuer?.trim() ? ` — ${cert.issuer}` : ''}
                {cert.date?.trim() ? ` (${cert.date})` : ''}
              </Text>
            </View>
          ))}
        </>
      )}
    </>
  );
}

/**
 * The parameterized react-pdf document. Renders the resume as selectable text,
 * shaped by the chosen template's config + the user's font/accent style.
 */
export function ResumePdfDocument({
  data,
  templateId,
  style,
}: {
  data: ResumeData;
  templateId: TemplateId;
  style: TemplateStyle;
}) {
  const config = TEMPLATE_CONFIGS[templateId] ?? TEMPLATE_CONFIGS.classic;
  const styles = buildStyles(config, style);
  const s = visibleSections(data);
  const p = data.personalInfo;

  const contactParts = [p.email, p.phone, p.location, p.linkedin, p.portfolio]
    .map((v) => v?.trim())
    .filter(Boolean);

  const header = (
    <View>
      {p.name.trim() ? <Text style={styles.name}>{p.name}</Text> : null}
      {contactParts.length > 0 ? (
        <Text style={styles.contact}>{contactParts.join('  •  ')}</Text>
      ) : null}
    </View>
  );

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {header}
        {config.twoColumn && s.skills.length > 0 ? (
          <View style={styles.row}>
            <View style={styles.sidebar}>
              <SkillsBlock styles={styles} data={data} />
            </View>
            <View style={styles.main}>
              <MainSections styles={styles} data={data} />
            </View>
          </View>
        ) : (
          <View style={styles.main}>
            <MainSections styles={styles} data={data} />
            <SkillsBlock styles={styles} data={data} />
          </View>
        )}
      </Page>
    </Document>
  );
}

/**
 * Generate a PDF {@link Blob} for a saved version, rendered in the given
 * template + style (Req 6.1, 6.3). Uses `pdf(...).toBlob()` so the output is a
 * true text-based PDF produced fully in-browser.
 */
export async function exportResumePdf(
  version: ResumeVersion,
  templateId: TemplateId,
  style: TemplateStyle,
): Promise<Blob> {
  const instance = pdf(
    <ResumePdfDocument data={version.data} templateId={templateId} style={style} />,
  );
  return instance.toBlob();
}
