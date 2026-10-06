// The departments tree every tree-select section shows.
export const departments = [
  {
    value: 'engineering', label: 'Engineering', children: [
      { value: 'frontend', label: 'Frontend' },
      { value: 'backend', label: 'Backend' },
      { value: 'devops', label: 'DevOps' },
      { value: 'qa', label: 'QA', disabled: true },
    ]
  },
  {
    value: 'design', label: 'Design', children: [
      { value: 'ux', label: 'UX Design' },
      { value: 'ui', label: 'UI Design' },
      { value: 'brand', label: 'Brand' },
    ]
  },
  {
    value: 'product', label: 'Product', children: [
      { value: 'pm', label: 'Product Management' },
      { value: 'analytics', label: 'Analytics' },
    ]
  },
  { value: 'hr', label: 'Human Resources' },
  { value: 'finance', label: 'Finance' },
];
