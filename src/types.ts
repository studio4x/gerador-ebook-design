export type DensityMode = 'compact' | 'comfortable' | 'premium';

export type ProjectSettings = {
  shortTitle: string;
  densityMode: DensityMode;
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
};

export type ContentBlock = {
  id: string;
  filename: string;
  content: string;
  originalContent?: string;
  isEdited?: boolean;
  updatedAt?: string;
};

export type EbookProject = {
  settings: ProjectSettings;
  blocks: ContentBlock[];
};

export const DEFAULT_SETTINGS: ProjectSettings = {
  title: "",
  shortTitle: "",
  densityMode: "comfortable",
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
  educationalWarning: ""
};
