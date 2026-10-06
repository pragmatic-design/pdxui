// The trees more than one tree section shows.
export const files = [
  {
    id: 'src', label: 'src', children: [
      { id: 'app', label: 'app.pdx' },
      {
        id: 'pages', label: 'pages', children: [
          { id: 'home', label: 'home.pdx' },
          { id: 'about', label: 'about.pdx' },
        ]
      },
      { id: 'main', label: 'main.ts' },
    ]
  },
  {
    id: 'tests', label: 'tests', children: [
      { id: 'home-spec', label: 'home.spec.ts' },
    ]
  },
  { id: 'readme', label: 'README.md' },
  { id: 'pkg', label: 'package.json' },
];

export const docs = [
  {
    id: 'guide', label: 'Guide', children: [
      { id: 'install', label: 'Installation' },
      { id: 'first', label: 'Your first component' },
    ]
  },
  {
    id: 'ref', label: 'Reference', children: [
      { id: 'runes', label: 'Runes' },
      { id: 'router', label: 'Router' },
    ]
  },
];
