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

module.exports = { TEACHERS, STATUS_OPTIONS, isBookedStatus };
