// Standard seed data: includes essential platform donation heads
const initialDonationHeads = [
  {
    _id: 'dh_1',
    name: 'Anna Chathiram',
    description: 'Food serving charity and annadhanam',
    formattedDate: '08-07-2026 10:46am',
    createdAt: '2026-07-08T10:46:00.000Z',
    status: 'Active',
    isGlobal: true,
    createdBy: 'System'
  },
  {
    _id: 'dh_2',
    name: '365 Drive',
    description: 'Year-round daily support campaign',
    formattedDate: '26-06-2025 11:03am',
    createdAt: '2025-06-26T11:03:00.000Z',
    status: 'Active',
    isGlobal: true,
    createdBy: 'System'
  },
  {
    _id: 'dh_3',
    name: 'Food Drive',
    description: 'Community food relief distribution',
    formattedDate: '26-06-2025 11:03am',
    createdAt: '2025-06-26T11:03:00.000Z',
    status: 'Active',
    isGlobal: true,
    createdBy: 'System'
  },
  {
    _id: 'dh_4',
    name: 'Fengal Cyclone',
    description: 'Disaster response and emergency relief',
    formattedDate: '06-01-2025 02:43pm',
    createdAt: '2025-01-06T14:43:00.000Z',
    status: 'Active',
    isGlobal: true,
    createdBy: 'System'
  },
  {
    _id: 'dh_5',
    name: 'Kind',
    description: 'Material and non-monetary donations',
    formattedDate: '26-10-2024 12:22pm',
    createdAt: '2024-10-26T12:22:00.000Z',
    status: 'Active',
    isGlobal: true,
    createdBy: 'System'
  },
  {
    _id: 'dh_6',
    name: 'General',
    description: 'General unrestricted charitable fund',
    formattedDate: '16-04-2023 10:18am',
    createdAt: '2023-04-16T10:18:00.000Z',
    status: 'Active',
    isGlobal: true,
    createdBy: 'System'
  }
];
const initialDonationReceipts = [];
const initialRoles = [];
const initialStaff = [];

module.exports = {
  initialDonationHeads,
  initialDonationReceipts,
  initialRoles,
  initialStaff
};
