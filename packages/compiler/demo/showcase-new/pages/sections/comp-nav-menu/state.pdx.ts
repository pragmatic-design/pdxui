// The icon items and the nested items three nav-menu sections each show.
export const iconItems = [
  { key: 'inbox', label: 'Inbox', icon: 'mail' },
  { key: 'sent', label: 'Sent', icon: 'send' },
  { key: 'drafts', label: 'Drafts', icon: 'file-text' },
  { key: 'trash', label: 'Trash', icon: 'trash' },
  { key: 'archive', label: 'Archive', icon: 'package' },
];

export const nestedItems = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'admin', label: 'Administration', icon: 'settings', expanded: true, children: [
    { key: 'users', label: 'Users' },
    { key: 'roles', label: 'Roles' },
    { key: 'permissions', label: 'Permissions' },
  ]},
  { key: 'content', label: 'Content', icon: 'file-text', children: [
    { key: 'pages', label: 'Pages' },
    { key: 'posts', label: 'Blog Posts' },
    { key: 'media', label: 'Media Library', children: [
      { key: 'images', label: 'Images' },
      { key: 'videos', label: 'Videos' },
      { key: 'docs', label: 'Documents' },
    ]},
  ]},
  { key: 'reports', label: 'Reports', icon: 'bar-chart', disabled: true },
];
