export type DensityMode = 'compact' | 'comfortable' | 'premium';
export type PageFormatId = 'a4' | '16x23' | '11_5x18' | '20x20';

export type ProjectSettings = {
  shortTitle: string;
  densityMode: DensityMode;
  pageFormat?: PageFormatId;
  title: string;
  subtitle: string;
  supportPhrase: string;
  professionalName: string;
  professionalTitle: string;
  professionalReg: string;
  brand: string;
  website: string;
  materialType: string;
  targetAudience: string;
  ctaText: string;
  ctaButtonText: string;
  contactAddress: string;
  instagram: string;
  email: string;
  whatsapp: string;
  schedulingUrl: string;
  educationalWarning: string;
  editionYear?: string;
  isbn?: string;
  generateToc?: boolean;
  
  // Pure visual properties parsed from the layout configs
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  fontFamily?: string;
  fontDisplay?: string;
  pageBorder?: boolean;
  headerText?: string;
  footerText?: string;
  headerStyle?: string;
  footerStyle?: string;
  pageNumberStyle?: string;
  descriptiveHeader?: boolean;
  coverBadgeText?: string;
  coverImageUrl?: string;
};

export type BlockRevision = {
  id: string;
  timestamp: string;
  content: string;
};

export type ContentBlock = {
  id: string;
  filename: string;
  content: string;
  originalContent?: string;
  isEdited?: boolean;
  updatedAt?: string;
  revisions?: BlockRevision[];
};

export type EbookProject = {
  settings: ProjectSettings;
  blocks: ContentBlock[];
};

export type ContentRevision = {
  id: string;
  label: string;
  createdAt: string;
  source: 'visual-editor' | 'manual' | 'upload' | 'restore';
  settings: ProjectSettings;
  blocks: ContentBlock[];
};

export const DEFAULT_SETTINGS: ProjectSettings = {
  title: "",
  shortTitle: "",
  densityMode: "comfortable",
  pageFormat: "a4",
  subtitle: "",
  supportPhrase: "",
  professionalName: "",
  professionalTitle: "",
  professionalReg: "",
  brand: "",
  website: "",
  materialType: "",
  targetAudience: "",
  ctaText: "",
  ctaButtonText: "",
  contactAddress: "",
  instagram: "",
  email: "",
  whatsapp: "",
  schedulingUrl: "",
  educationalWarning: "",
  editionYear: new Date().getFullYear().toString(),
  isbn: "",
  coverBadgeText: "E-book educativo"
};

export interface LocalProject {
  id: string;
  title: string;
  settings: ProjectSettings;
  blocks: ContentBlock[];
  contentRevisions: ContentRevision[];
  updatedAt: string;
}

