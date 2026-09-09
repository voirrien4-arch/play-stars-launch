export const categories = [
  { id: 'games', name: 'Jeux', icon: '◈' },
  { id: 'tools', name: 'Outils', icon: '⌘' },
  { id: 'education', name: 'Éducation', icon: '✎' },
  { id: 'social', name: 'Réseaux sociaux', icon: '◎' },
  { id: 'communication', name: 'Communication', icon: '◌' },
  { id: 'productivity', name: 'Productivité', icon: '✓' },
  { id: 'media', name: 'Multimédia', icon: '♫' },
  { id: 'finance', name: 'Finance', icon: '€' },
  { id: 'customization', name: 'Personnalisation', icon: '✦' },
  { id: 'travel', name: 'Voyage', icon: '⌖' }
];

export function getCategory(id) { return categories.find((category) => category.id === id); }
