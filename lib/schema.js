const COLUMNS = [
  'id', 'title', 'company', 'status', 'dateApplied', 'dateFollowedUp', 'nextFollowUp',
  'location', 'salary', 'url', 'assessments',
  'contactName', 'contactEmail', 'contactPhone', 'contactLinkedIn', 'notes',
];
const REQUIRED = ['title', 'company', 'dateApplied', 'url'];
const STATUSES = ['Applied', 'Interview 1', 'Interview 2', 'Offer', 'Rejected'];

module.exports = { COLUMNS, REQUIRED, STATUSES };
