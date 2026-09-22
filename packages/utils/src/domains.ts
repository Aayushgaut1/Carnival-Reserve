// Single Source of Truth: Official 17 Festival Domains & Account References for Carnival Reserve

export interface DomainConfig {
  id: string;
  accountRef: string;
  displayName: string;
  category: string;
  icon: string;
  logo?: string;
  accentColor: string;
  shortDescription: string;
  tagline: string;
}

export const REWARD_CONSTANTS = {
  REGISTRATION: 50,
  PARTICIPATION: 50,
  WINNER: 250,
} as const;

export const OFFICIAL_DOMAINS: DomainConfig[] = [
  {
    id: 'agritech',
    logo: '/assets/domains/agritech.jpeg',
    accountRef: 'ACC-01',
    displayName: 'Agritech',
    category: 'Agriculture & Tech',
    icon: '🌱',
    accentColor: '#35D07F',
    shortDescription: 'Sustainable agriculture, automated hydroponics & rural technology solutions.',
    tagline: 'Harvesting the Future of Technology.',
  },
  {
    id: 'architecture',
    logo: '/assets/domains/architecture.jpeg',
    accountRef: 'ACC-02',
    displayName: 'Architecture',
    category: 'Design & Structure',
    icon: '🏛️',
    accentColor: '#FF8A1F',
    shortDescription: 'Urban planning, sustainable structural prototypes & acoustic blueprints.',
    tagline: 'Designing Tomorrow’s Skyline.',
  },
  {
    id: 'bluebook',
    logo: '/assets/domains/bluebook.jpeg',
    accountRef: 'ACC-03',
    displayName: 'Bluebook',
    category: 'Literary & Editorial',
    icon: '📖',
    accentColor: '#38BDF8',
    shortDescription: 'Creative writing, intellectual journalism, open poetry & editorial quests.',
    tagline: 'Words that Reshape Worlds.',
  },
  {
    id: 'challenges-championships',
    logo: '/assets/domains/challenges-championships.jpeg',
    accountRef: 'ACC-04',
    displayName: 'Challenges & Championships',
    category: 'Tournament & Gaming',
    icon: '🏆',
    accentColor: '#FFD21F',
    shortDescription: 'High-stakes multi-discipline obstacle courses & campus-wide championship cups.',
    tagline: 'Where Champions Prevail.',
  },
  {
    id: 'cosmic-quest',
    logo: '/assets/domains/cosmic-quest.jpeg',
    accountRef: 'ACC-05',
    displayName: 'Cosmic Quest',
    category: 'Astronomy & Space',
    icon: '🚀',
    accentColor: '#C084FC',
    shortDescription: 'Rocket trajectory simulations, celestial navigation & astrophysics challenges.',
    tagline: 'Venturing Beyond the Atmosphere.',
  },
  {
    id: 'digital-design',
    logo: '/assets/domains/digital-design.jpeg',
    accountRef: 'ACC-06',
    displayName: 'Digital Design',
    category: 'Creative & UI/UX',
    icon: '🎨',
    accentColor: '#EC4899',
    shortDescription: 'UI/UX interactive design sprints, motion graphics & visual brand design.',
    tagline: 'Where Art Meets Function.',
  },
  {
    id: 'electrizite',
    logo: '/assets/domains/electrizite.jpeg',
    accountRef: 'ACC-07',
    displayName: 'Electrizite',
    category: 'Electrical & Energy',
    icon: '⚡',
    accentColor: '#22D3EE',
    shortDescription: 'Embedded circuit debugging, power grid design & high-voltage puzzles.',
    tagline: 'Powering Ideas. Electrifying Futures.',
  },
  {
    id: 'fundaz',
    logo: '/assets/domains/fundaz.jpeg',
    accountRef: 'ACC-08',
    displayName: 'Fundaz',
    category: 'Fundamentals & Quiz',
    icon: '💡',
    accentColor: '#FFC928',
    shortDescription: 'Fundamental physics, mathematical riddles & rapid-fire trivia showdowns.',
    tagline: 'Igniting Core Intellect.',
  },
  {
    id: 'konstruktion-canoe',
    logo: '/assets/domains/konstruktion.jpeg',
    accountRef: 'ACC-09',
    displayName: 'Konstruktion & Canoe Challenge',
    category: 'Civil & Materials',
    icon: '🛶',
    accentColor: '#14B8A6',
    shortDescription: 'Concrete canoe hydrodynamic trials & rapid bridge stress-load engineering.',
    tagline: 'Forging Structures that Defy Elements.',
  },
  {
    id: 'machination',
    logo: '/assets/domains/machination.jpeg',
    accountRef: 'ACC-10',
    displayName: 'Machination',
    category: 'Mechanical & CAD',
    icon: '⚙️',
    accentColor: '#94A3B8',
    shortDescription: 'CAD generative modeling, engine teardown & kinetic energy transfer rigs.',
    tagline: 'Precision Mechanics in Motion.',
  },
  {
    id: 'magefficie-symposium',
    logo: '/assets/domains/magefficie.jpeg',
    accountRef: 'ACC-11',
    displayName: 'Magefficie & Entrepreneurial Symposium',
    category: 'Business & Pitch',
    icon: '💎',
    accentColor: '#FF6A00',
    shortDescription: 'Venture capital pitch desk, financial modeling & festival reward gateway.',
    tagline: 'The Epicenter of Innovation & Value.',
  },
  {
    id: 'praesentatio',
    logo: '/assets/domains/praesentatio.jpeg',
    accountRef: 'ACC-12',
    displayName: 'Praesentatio',
    category: 'Research & Speaking',
    icon: '🎙️',
    accentColor: '#FB7185',
    shortDescription: 'National technical paper symposium & innovative idea stage presentations.',
    tagline: 'Ideas Worth Amplifying.',
  },
  {
    id: 'robogyan',
    logo: '/assets/domains/robogyan.jpeg',
    accountRef: 'ACC-13',
    displayName: 'Robogyan',
    category: 'Robotics & AI',
    icon: '🤖',
    accentColor: '#06B6D4',
    shortDescription: 'Autonomous line-follower navigation, battlebot collisions & micro-robotics.',
    tagline: 'Engineering the Automaton Era.',
  },
  {
    id: 'vimanaz',
    logo: '/assets/domains/vimanaz.jpeg',
    accountRef: 'ACC-14',
    displayName: 'Vimanaz',
    category: 'Aeronautics & Drone',
    icon: '✈️',
    accentColor: '#60A5FA',
    shortDescription: 'Aerodynamic glider launch, RC drone obstacle circuit & quadcopter slalom.',
    tagline: 'Conquering the Skies.',
  },
  {
    id: 'webnexus',
    logo: '/assets/domains/webnexus.jpeg',
    accountRef: 'ACC-15',
    displayName: 'Webnexus',
    category: 'Full-Stack & Web',
    icon: '🌐',
    accentColor: '#818CF8',
    shortDescription: 'Full-stack hack sprints, decentralization protocols & Web3 algorithmic arenas.',
    tagline: 'Architects of the Connected Grid.',
  },
  {
    id: 'xzone-esports',
    logo: '/assets/domains/x-zone.jpeg',
    accountRef: 'ACC-16',
    displayName: 'X-zone & Esports',
    category: 'Esports & Gaming',
    icon: '🎮',
    accentColor: '#A855F7',
    shortDescription: 'High-FPS tactical esports tournament, retro arcade challenges & SIM racing.',
    tagline: 'The Ultimate Virtual Battleground.',
  },
  {
    id: 'yuddhame',
    logo: '/assets/domains/yuddhame.jpeg',
    accountRef: 'ACC-17',
    displayName: 'Yuddhame',
    category: 'Combat & Strategy',
    icon: '⚔️',
    accentColor: '#FF4D4D',
    shortDescription: 'Tactical battlefield strategy, laser-tag warfare & real-time simulation.',
    tagline: 'Strategy. Courage. Supremacy.',
  },
];

export const REQUIRED_DOMAIN_COUNT = OFFICIAL_DOMAINS.length;

export const MAGEFFICIE_ACCOUNT: DomainConfig = {
  id: 'magefficie',
    logo: '/assets/domains/magefficie.jpeg',
  accountRef: 'ACC-19',
  displayName: 'Magefficie',
  category: 'Reward Vault & Redemption',
  icon: '🎪',
  accentColor: '#FFD21F',
  shortDescription: 'The central festival redemption counter where completed passports spend Crn.',
  tagline: 'The Festival Vault of Honor.',
};

export function getDomainByAccountRef(ref: string): DomainConfig | undefined {
  if (ref === 'ACC-19') return MAGEFFICIE_ACCOUNT;
  return OFFICIAL_DOMAINS.find((d) => d.accountRef === ref);
}

export function getDomainByName(name: string): DomainConfig | undefined {
  if (name.toLowerCase() === 'magefficie') return MAGEFFICIE_ACCOUNT;
  return OFFICIAL_DOMAINS.find((d) => d.displayName.toLowerCase() === name.toLowerCase());
}
