const TEACHERS = [
  { key: 'josh', label: 'Mr. Josh' },
  { key: 'callum', label: 'Mr. Callum' },
  { key: 'shahul', label: 'Mr. Shahul' },
  { key: 'toby', label: 'Mr. Toby' },
  { key: 'marcus', label: 'Mr. Marcus' },
  { key: 'aiden', label: 'Mr. Aiden' },
];

// "Booked" statuses are the ones that occupy a recurring weekly slot.
// displacement_slot_kept_by_legacy means the NEW family (this lead) did NOT
// end up with this slot - the existing family paid the new rate and kept it.
// displacement_slot_won means the existing family declined, so the new
// family (this lead) now owns the recurring slot.
const STATUS_OPTIONS = [
  { key: 'new', label: 'New / no update yet', booked: false },
  { key: 'booked', label: 'Booked (normal)', booked: true },
  { key: 'waitlisted', label: 'Waitlisted', booked: false },
  { key: 'lost', label: "Didn't book", booked: false },
  { key: 'displacement_pending', label: 'Gave a trial this week (bumped a legacy family) — outcome pending', booked: false },
  { key: 'displacement_slot_kept_by_legacy', label: 'Legacy family paid new rate & kept their slot — this family needs a different opening', booked: false },
  { key: 'displacement_slot_won', label: 'Legacy family declined — this family now has the slot', booked: true },
];

function isBookedStatus(statusKey) {
  const match = STATUS_OPTIONS.find((s) => s.key === statusKey);
  return match ? match.booked : false;
}

// Deliberately wider than the five cities we teach in today. A strong
// applicant in a city with no students yet is still worth keeping on file -
// they become the reason we can say yes the first time a parent there asks.
const SERVICE_AREAS = [
  'Troy', 'Rochester Hills', 'Birmingham', 'Bloomfield Hills', 'Royal Oak',
  'Farmington Hills', 'West Bloomfield', 'Novi', 'Auburn Hills', 'Clawson',
  'Berkley', 'Ferndale', 'Madison Heights', 'Southfield', 'Sterling Heights',
  'Shelby Township', 'Utica', 'Warren',
];

// Where an application sits in the pipeline. "hold" exists because supply and
// demand arrive in the wrong order: a good teacher in a city we have no
// students in yet is a yes we are not ready to act on, not a no.
const APPLICATION_STATUS_OPTIONS = [
  { key: 'new', label: 'New - not reviewed yet' },
  { key: 'reviewing', label: 'Watching their video' },
  { key: 'interview', label: 'Interview scheduled' },
  { key: 'background_check', label: 'Background check in progress' },
  { key: 'hired', label: 'Hired - teaching for us' },
  { key: 'hold', label: 'Good, but no students in their area yet' },
  { key: 'declined', label: 'Not a fit' },
];

module.exports = {
  TEACHERS, STATUS_OPTIONS, isBookedStatus, SERVICE_AREAS, APPLICATION_STATUS_OPTIONS,
};
