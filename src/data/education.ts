// Education by country: how many adults hold a tertiary qualification, what a
// year of university costs, and how much of public revenue goes to schools.
// Shares follow OECD Education at a Glance / UNESCO (adults 25–64, rounded);
// tuition is a year at a public university in game money (1.5.0 re-anchors
// prices); funding is the default share of daily national revenue.
export type EduLevel = 'none' | 'school' | 'vocational' | 'bachelor' | 'master' | 'doctorate';
export type Course = 'vocational' | 'bachelor' | 'master' | 'doctorate' | 'academy' | 'ocs';
export type Field = 'business' | 'engineering' | 'medicine' | 'law' | 'teaching' | 'science' | 'arts' | 'trades';

export const LEVELS: EduLevel[] = ['none', 'school', 'vocational', 'bachelor', 'master', 'doctorate'];
export const LEVEL_LABEL: Record<EduLevel, string> = {
  none: 'No diploma', school: 'Secondary school', vocational: 'Vocational diploma', bachelor: "Bachelor's degree", master: "Master's degree", doctorate: 'Doctorate',
};
export const rank = (l: EduLevel) => LEVELS.indexOf(l);

export const COURSES: Record<Course, { label: string; years: number; needs: EduLevel; uni: boolean; tuition: number; icon: string }> = {
  vocational: { label: 'Vocational diploma', years: 1, needs: 'school', uni: false, tuition: 0.4, icon: '🔧' },
  bachelor: { label: "Bachelor's degree", years: 3, needs: 'school', uni: true, tuition: 1, icon: '🎓' },
  master: { label: "Master's degree", years: 2, needs: 'bachelor', uni: true, tuition: 1.2, icon: '📜' },
  doctorate: { label: 'Doctorate', years: 4, needs: 'master', uni: true, tuition: 0.3, icon: '🔬' },
  academy: { label: 'Military academy', years: 4, needs: 'school', uni: false, tuition: 0, icon: '🎖️' }, // a degree and a commission; cadets pay no fees
  ocs: { label: 'Officer training', years: 0.25, needs: 'bachelor', uni: false, tuition: 0, icon: '⭐' }, // a commission for graduates
};

export const FIELDS: Record<Field, { label: string; icon: string; skills: ('eco' | 'lead' | 'cons' | 'acc' | 'end')[] }> = {
  business: { label: 'Business & economics', icon: '📈', skills: ['eco', 'lead'] },
  engineering: { label: 'Engineering', icon: '⚙️', skills: ['cons', 'eco'] },
  medicine: { label: 'Medicine & nursing', icon: '🩺', skills: ['end', 'acc'] },
  law: { label: 'Law & public administration', icon: '⚖️', skills: ['lead', 'eco'] },
  teaching: { label: 'Education & teaching', icon: '🍎', skills: ['lead', 'end'] },
  science: { label: 'Science & computing', icon: '🧪', skills: ['acc', 'eco'] },
  arts: { label: 'Arts & humanities', icon: '🎭', skills: ['lead', 'acc'] },
  trades: { label: 'Skilled trades', icon: '🛠️', skills: ['cons', 'end'] },
};

/** tertiary: share of adults with vocational-or-higher tertiary education; tuition: a year of a bachelor's; funding: share of revenue. */
export const EDU_BY_NATION: Record<string, { tertiary: number; tuition: number; funding: number }> = {
  USA: { tertiary: 0.5, tuition: 420, funding: 0.05 },
  CAN: { tertiary: 0.6, tuition: 260, funding: 0.05 },
  MEX: { tertiary: 0.2, tuition: 30, funding: 0.05 },
  BRA: { tertiary: 0.21, tuition: 0, funding: 0.05 },
  ARG: { tertiary: 0.23, tuition: 0, funding: 0.05 },
  GBR: { tertiary: 0.5, tuition: 360, funding: 0.05 },
  DEU: { tertiary: 0.33, tuition: 12, funding: 0.045 },
  RUS: { tertiary: 0.57, tuition: 60, funding: 0.04 },
  TUR: { tertiary: 0.24, tuition: 20, funding: 0.045 },
  SAU: { tertiary: 0.27, tuition: 0, funding: 0.06 },
  ZAF: { tertiary: 0.13, tuition: 150, funding: 0.06 },
  IND: { tertiary: 0.12, tuition: 40, funding: 0.045 },
  CHN: { tertiary: 0.19, tuition: 70, funding: 0.04 },
  JPN: { tertiary: 0.56, tuition: 220, funding: 0.035 },
  KOR: { tertiary: 0.53, tuition: 200, funding: 0.04 },
  AUS: { tertiary: 0.52, tuition: 250, funding: 0.045 },
};
export const eduOf = (iso: string) => EDU_BY_NATION[iso] ?? { tertiary: 0.3, tuition: 100, funding: 0.045 };
