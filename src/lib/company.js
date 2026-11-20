// Letterhead details — from the CWI business card and printed proposal.
export const COMPANY = {
  name: 'Custom Weatherstrip, Inc.',
  tagline: 'Doors & Windows',
  license: '765989',
  street: '2923 Club House Rd',
  cityStateZip: 'Costa Mesa, CA 92626',
  accountingFax: '714 662-1574',
  people: [
    { name: 'Mike Siebuhr', cell: '949 433-7740', email: 'siebuhr@sbcglobal.net' },
    { name: 'Cindy Siebuhr', cell: '714 313 7390', email: 'csiebuhr@sbcglobal.net' },
  ],
  // Zelle email or phone to print on proposals (null = not shown)
  zelle: null,
  // Signs proposals
  signer: 'Mike Siebuhr',
}

/** Shown above the openings with no work on the proposal (when that list is turned on). */
export const DEFAULT_UNWORKED_NOTE =
  'The openings below are OK as is and are not included in this proposal. We recommend tuning them up by replacing the weatherstripping, as the rubber is starting to deteriorate.'

export const DEFAULT_SCOPE_INTRO = 'Furnish and install weatherstrip'
