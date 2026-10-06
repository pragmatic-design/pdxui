// The location tree five of the cascader sections show.
export const locations = [
  {
    value: 'europe', label: 'Europe', children: [
      { value: 'italy', label: 'Italy', children: [
        { value: 'rome', label: 'Rome' },
        { value: 'milan', label: 'Milan' },
        { value: 'naples', label: 'Naples' },
      ]},
      { value: 'france', label: 'France', children: [
        { value: 'paris', label: 'Paris' },
        { value: 'lyon', label: 'Lyon' },
        { value: 'marseille', label: 'Marseille' },
      ]},
      { value: 'germany', label: 'Germany', children: [
        { value: 'berlin', label: 'Berlin' },
        { value: 'munich', label: 'Munich' },
      ]},
    ]
  },
  {
    value: 'asia', label: 'Asia', children: [
      { value: 'japan', label: 'Japan', children: [
        { value: 'tokyo', label: 'Tokyo' },
        { value: 'osaka', label: 'Osaka' },
      ]},
      { value: 'china', label: 'China', children: [
        { value: 'beijing', label: 'Beijing' },
        { value: 'shanghai', label: 'Shanghai' },
      ]},
    ]
  },
  {
    value: 'america', label: 'Americas', children: [
      { value: 'usa', label: 'United States', children: [
        { value: 'nyc', label: 'New York' },
        { value: 'sf', label: 'San Francisco' },
        { value: 'la', label: 'Los Angeles' },
      ]},
      { value: 'brazil', label: 'Brazil', children: [
        { value: 'saopaulo', label: 'São Paulo' },
        { value: 'rio', label: 'Rio de Janeiro' },
      ]},
    ]
  },
];
