// Idempotent seed for proposal rates and default templates.
// Called from prisma/seed.js; safe to run on every deploy.
// Task lists mirror the real Excel fee breakdown sheets exactly.

const DEFAULT_RATES = [
  { role: 'SR_DESIGNER', hourlyRate: 180 },
  { role: 'DESIGNER',    hourlyRate: 115 },
  { role: 'SALES',       hourlyRate: 160 },
  { role: 'OUTSOURCE',   hourlyRate: 115 },
];

const FULL_DESIGN_MILESTONES = JSON.stringify([
  { label: '100% Schematic Design',         pct: 25 },
  { label: '100% Design Development',        pct: 30 },
  { label: '50% Construction Docs',          pct: 30 },
  { label: '100% Construction Docs',         pct: 10 },
  { label: 'Construction Admin (quarterly)', pct: 5  },
]);

const DESIGN_ASSIST_MILESTONES = JSON.stringify([
  { label: 'Project Kick-off & Concept',   pct: 30 },
  { label: 'Design Development Milestone', pct: 40 },
  { label: 'Construction Documents',       pct: 30 },
]);

const PEER_REVIEW_MILESTONES = JSON.stringify([
  { label: 'Initial Review Submittal', pct: 50 },
  { label: 'Final Review & Report',    pct: 50 },
]);

const FULL_DESIGN_DOC = `<h2>Scope of Services</h2>
<p>ILC Studios ("ILC") will provide full architectural lighting design services for <strong>{projectName}</strong> located at <strong>{location}</strong>. Services include schematic design, design development, construction documentation, and construction administration as described below.</p>

<h2>Schematic Design</h2>
<p>ILC will develop a lighting concept narrative including fixture type strategy, control intent, and design direction for all spaces. Deliverables include a preliminary fixture schedule and schematic lighting plan.</p>

<h2>Design Development</h2>
<p>ILC will develop full fixture specifications, photometric layouts, and detailed fixture schedules coordinated with the architect and MEP engineers. Design documentation will be issued for owner review and approval.</p>

<h2>Construction Documents</h2>
<p>ILC will produce construction-ready lighting plans, details, schedules, and specifications suitable for permitting and bidding. Documents will be coordinated with the contract documents and issued with the architectural and MEP sets.</p>

<h2>Construction Administration</h2>
<p>ILC will provide construction administration services including submittal review, response to RFIs, and site observation as required. CA services are billed quarterly at the rates in effect at time of service.</p>

<h2>Design Fee</h2>
<p>The total design fee for the described scope is <strong>{fee}</strong>, payable according to the milestone schedule below. This fee includes all services described herein. Services outside this scope will be billed as additional services by mutual agreement.</p>

<h2>Exclusions</h2>
<p>The following are excluded from this scope unless agreed separately: energy compliance calculations (Title 24, ASHRAE 90.1), emergency lighting design, temporary construction lighting, and coordination with theatrical or specialty lighting consultants.</p>

<h2>Acceptance</h2>
<p>This proposal is valid for 60 days from the effective date of <strong>{effectiveDate}</strong>. Please sign below to authorize ILC to proceed.</p>`;

const DESIGN_ASSIST_DOC = `<h2>Scope of Services</h2>
<p>ILC Studios will provide design-assist lighting services for <strong>{projectName}</strong> at <strong>{location}</strong>. Design assist services support the electrical contractor's procurement and installation process through early fixture selection guidance and specification support.</p>

<h2>Services Included</h2>
<p>ILC will provide fixture type recommendations and preliminary specifications for all major space types, coordinate with the project team on product submittals, and provide design guidance during the procurement phase. ILC will review manufacturer substitution requests and provide written recommendations.</p>

<h2>Design Fee</h2>
<p>The design-assist fee for this project is <strong>{fee}</strong>, payable according to the milestone schedule. This fee covers the services described above through project completion.</p>

<h2>Acceptance</h2>
<p>This proposal is valid for 60 days from <strong>{effectiveDate}</strong>.</p>`;

const PEER_REVIEW_DOC = `<h2>Scope of Services</h2>
<p>ILC Studios will provide an independent peer review of the lighting design for <strong>{projectName}</strong> located at <strong>{location}</strong>. The peer review evaluates the proposed lighting design against ILC's standards for quality, specification accuracy, and value.</p>

<h2>Review Deliverables</h2>
<p>ILC will provide a written peer review report documenting observations, specification concerns, and recommended corrections. The report will include a red-line markup of the fixture schedule with specific product comments and a summary of findings organized by priority.</p>

<h2>Review Fee</h2>
<p>The peer review fee is <strong>{fee}</strong>, payable 50% at project initiation and 50% upon delivery of the final report.</p>

<h2>Acceptance</h2>
<p>This proposal is valid for 60 days from <strong>{effectiveDate}</strong>.</p>`;

// ── Full Design tasks — mirrors "Full service fee breakdown" sheet exactly ────
// sr=Senior Designer, des=Designer, sales=Sales, out=Outsource Designer
const FULL_DESIGN_TASKS = [
  // GENERAL
  { area: 'General', task: 'Create fixture schedule and write specs',    sortOrder: 0,  srHours: 4,    designerHours: 2,  salesHours: 0, outsourceHours: 0 },
  { area: 'General', task: 'Fixture schedule QC after submission',       sortOrder: 1,  srHours: 4,    designerHours: 0,  salesHours: 0, outsourceHours: 0 },
  { area: 'General', task: 'Writing SD narrative',                       sortOrder: 2,  srHours: 1,    designerHours: 1,  salesHours: 0, outsourceHours: 0 },
  { area: 'General', task: 'Weekly meetings',                            sortOrder: 3,  srHours: 4,    designerHours: 0,  salesHours: 4, outsourceHours: 0 },
  { area: 'General', task: 'Conceptual presentation building',           sortOrder: 4,  srHours: 0,    designerHours: 0,  salesHours: 0, outsourceHours: 0 },
  { area: 'General', task: 'Code review',                                sortOrder: 5,  srHours: 2,    designerHours: 0,  salesHours: 0, outsourceHours: 0 },
  { area: 'General', task: 'Questionnaire meeting and review',           sortOrder: 6,  srHours: 0,    designerHours: 2,  salesHours: 0, outsourceHours: 0 },
  // UNITS
  { area: 'Units',   task: 'Studio',                                     sortOrder: 7,  srHours: 0,    designerHours: 2,  salesHours: 0, outsourceHours: 0 },
  { area: 'Units',   task: '1 Bed',                                      sortOrder: 8,  srHours: 0,    designerHours: 4,  salesHours: 0, outsourceHours: 0 },
  { area: 'Units',   task: '2 Bed',                                      sortOrder: 9,  srHours: 0,    designerHours: 6,  salesHours: 0, outsourceHours: 0 },
  { area: 'Units',   task: '3 Bed',                                      sortOrder: 10, srHours: 0,    designerHours: 6,  salesHours: 0, outsourceHours: 0 },
  { area: 'Units',   task: '4 Bed',                                      sortOrder: 11, srHours: 0,    designerHours: 8,  salesHours: 0, outsourceHours: 0 },
  { area: 'Units',   task: 'Townhomes',                                  sortOrder: 12, srHours: 0,    designerHours: 8,  salesHours: 0, outsourceHours: 0 },
  { area: 'Units',   task: 'Unit switching and zoning',                  sortOrder: 13, srHours: 2,    designerHours: 8,  salesHours: 0, outsourceHours: 0 },
  { area: 'Units',   task: 'Design QC',                                  sortOrder: 14, srHours: 1,    designerHours: 0,  salesHours: 0, outsourceHours: 0 },
  { area: 'Units',   task: 'Submission QC',                              sortOrder: 15, srHours: 4,    designerHours: 0,  salesHours: 0, outsourceHours: 0 },
  // CORRIDORS
  { area: 'Corridors', task: 'Corridors',                                sortOrder: 16, srHours: 2,    designerHours: 8,  salesHours: 0, outsourceHours: 0 },
  { area: 'Corridors', task: 'Corridor photometry',                      sortOrder: 17, srHours: 0,    designerHours: 4,  salesHours: 0, outsourceHours: 0 },
  { area: 'Corridors', task: 'Stairwells',                               sortOrder: 18, srHours: 0.25, designerHours: 1,  salesHours: 0, outsourceHours: 0 },
  { area: 'Corridors', task: 'Stairwell photometry',                     sortOrder: 19, srHours: 0,    designerHours: 2,  salesHours: 0, outsourceHours: 0 },
  { area: 'Corridors', task: 'Design QC',                                sortOrder: 20, srHours: 1,    designerHours: 2,  salesHours: 0, outsourceHours: 0 },
  { area: 'Corridors', task: 'Submission QC',                            sortOrder: 21, srHours: 2,    designerHours: 0,  salesHours: 0, outsourceHours: 0 },
  // BOH
  { area: 'BOH',     task: 'General',                                    sortOrder: 22, srHours: 0,    designerHours: 4,  salesHours: 0, outsourceHours: 0 },
  { area: 'BOH',     task: 'Design QC',                                  sortOrder: 23, srHours: 2,    designerHours: 0,  salesHours: 0, outsourceHours: 0 },
  { area: 'BOH',     task: 'Submission QC',                              sortOrder: 24, srHours: 2,    designerHours: 0,  salesHours: 0, outsourceHours: 0 },
  // GARAGE
  { area: 'Garage',  task: 'General',                                    sortOrder: 25, srHours: 0,    designerHours: 4,  salesHours: 0, outsourceHours: 0 },
  { area: 'Garage',  task: 'Design QC',                                  sortOrder: 26, srHours: 1,    designerHours: 0,  salesHours: 0, outsourceHours: 0 },
  { area: 'Garage',  task: 'Submission QC',                              sortOrder: 27, srHours: 4,    designerHours: 2,  salesHours: 0, outsourceHours: 0 },
  // HARDSCAPE / LANDSCAPE / PARKING
  { area: 'Hardscape / Landscape / Parking', task: 'Site entitlement',  sortOrder: 28, srHours: 10,   designerHours: 40, salesHours: 0, outsourceHours: 0 },
  { area: 'Hardscape / Landscape / Parking', task: 'Design QC',         sortOrder: 29, srHours: 3,    designerHours: 0,  salesHours: 0, outsourceHours: 0 },
  { area: 'Hardscape / Landscape / Parking', task: 'Submission QC',     sortOrder: 30, srHours: 3,    designerHours: 0,  salesHours: 0, outsourceHours: 0 },
  // EXTERIOR AMENITY
  { area: 'Exterior Amenity', task: 'Exterior amenities photometry',     sortOrder: 31, srHours: 0,    designerHours: 0,  salesHours: 0, outsourceHours: 0 },
  { area: 'Exterior Amenity', task: 'Design QC',                         sortOrder: 32, srHours: 0,    designerHours: 0,  salesHours: 0, outsourceHours: 0 },
  { area: 'Exterior Amenity', task: 'Submission QC',                     sortOrder: 33, srHours: 0,    designerHours: 0,  salesHours: 0, outsourceHours: 0 },
  // INTERIOR AMENITY
  { area: 'Interior Amenity', task: 'Lobby',                             sortOrder: 34, srHours: 4,    designerHours: 8,  salesHours: 0, outsourceHours: 0 },
  { area: 'Interior Amenity', task: 'Leasing',                           sortOrder: 35, srHours: 2,    designerHours: 4,  salesHours: 0, outsourceHours: 0 },
  { area: 'Interior Amenity', task: 'Co-working',                        sortOrder: 36, srHours: 2,    designerHours: 4,  salesHours: 0, outsourceHours: 0 },
  { area: 'Interior Amenity', task: 'Bike room',                         sortOrder: 37, srHours: 0.5,  designerHours: 1,  salesHours: 0, outsourceHours: 0 },
  { area: 'Interior Amenity', task: 'Dog spa',                           sortOrder: 38, srHours: 1,    designerHours: 2,  salesHours: 0, outsourceHours: 0 },
  { area: 'Interior Amenity', task: 'Fitness room',                      sortOrder: 39, srHours: 2,    designerHours: 4,  salesHours: 0, outsourceHours: 0 },
  { area: 'Interior Amenity', task: 'Rooftop amenities',                 sortOrder: 40, srHours: 4,    designerHours: 8,  salesHours: 0, outsourceHours: 0 },
  { area: 'Interior Amenity', task: 'Rooftop pooldeck',                  sortOrder: 41, srHours: 4,    designerHours: 8,  salesHours: 0, outsourceHours: 0 },
  { area: 'Interior Amenity', task: 'Courtyard / outdoor amenity',       sortOrder: 42, srHours: 2,    designerHours: 4,  salesHours: 0, outsourceHours: 0 },
  { area: 'Interior Amenity', task: 'Decorative fixture coordination',   sortOrder: 43, srHours: 1,    designerHours: 2,  salesHours: 0, outsourceHours: 0 },
  { area: 'Interior Amenity', task: 'Detail coordination',               sortOrder: 44, srHours: 2,    designerHours: 2,  salesHours: 0, outsourceHours: 0 },
  { area: 'Interior Amenity', task: 'Design QC',                         sortOrder: 45, srHours: 4,    designerHours: 0,  salesHours: 0, outsourceHours: 0 },
  { area: 'Interior Amenity', task: 'Submission QC',                     sortOrder: 46, srHours: 4,    designerHours: 0,  salesHours: 0, outsourceHours: 0 },
  // EMERGENCY
  { area: 'Emergency', task: 'Verify emergency strategy with EE',        sortOrder: 47, srHours: 0,    designerHours: 0.5, salesHours: 0, outsourceHours: 0 },
  { area: 'Emergency', task: 'Download and review EE drawings for emergency fixture layouts', sortOrder: 48, srHours: 0, designerHours: 0.5, salesHours: 0, outsourceHours: 0 },
  // EXIT SIGNS
  { area: 'Exit Signs', task: 'Download and review EE drawings for exit sign layouts', sortOrder: 49, srHours: 0, designerHours: 0.5, salesHours: 0, outsourceHours: 0 },
  // BIM
  { area: 'BIM',     task: 'Revit model setup',                          sortOrder: 50, srHours: 0,    designerHours: 24, salesHours: 0, outsourceHours: 0 },
  { area: 'BIM',     task: 'Create lighting sheets',                     sortOrder: 51, srHours: 0,    designerHours: 2,  salesHours: 0, outsourceHours: 0 },
  { area: 'BIM',     task: 'General building QC',                        sortOrder: 52, srHours: 0,    designerHours: 1,  salesHours: 0, outsourceHours: 0 },
  // CONTROLS
  { area: 'Controls', task: 'Controls layout',                           sortOrder: 53, srHours: 2,    designerHours: 4,  salesHours: 0, outsourceHours: 0 },
  { area: 'Controls', task: 'Fill out sequence of operations (SOO)',     sortOrder: 54, srHours: 12,   designerHours: 0,  salesHours: 0, outsourceHours: 0 },
  { area: 'Controls', task: 'Code review / research',                    sortOrder: 55, srHours: 2,    designerHours: 0,  salesHours: 0, outsourceHours: 0 },
  // CONSTRUCTION ADMIN
  { area: 'Construction Admin', task: 'RFI responses',                   sortOrder: 56, srHours: 3,    designerHours: 4,  salesHours: 0, outsourceHours: 0 },
  { area: 'Construction Admin', task: 'ASI drawing updates',             sortOrder: 57, srHours: 2,    designerHours: 4,  salesHours: 0, outsourceHours: 0 },
  { area: 'Construction Admin', task: 'Submittal review',                sortOrder: 58, srHours: 3,    designerHours: 4,  salesHours: 0, outsourceHours: 0 },
  { area: 'Construction Admin', task: 'Email correspondence',            sortOrder: 59, srHours: 3,    designerHours: 3,  salesHours: 0, outsourceHours: 0 },
  { area: 'Construction Admin', task: 'Coordination meetings',           sortOrder: 60, srHours: 0,    designerHours: 2,  salesHours: 0, outsourceHours: 0 },
];

// ── Design Assist tasks — mirrors "Design assist fee breakdown" sheet exactly ─
// Pre-Con / Sales column maps to salesHours; no outsource column in this sheet
const DESIGN_ASSIST_TASKS = [
  // GENERAL
  { area: 'General', task: 'Create and manage fixture schedule and write specs', sortOrder: 0, srHours: 0,   designerHours: 0,   salesHours: 0,   outsourceHours: 0 },
  { area: 'General', task: 'Fixture schedule and spec review meetings',          sortOrder: 1, srHours: 3,   designerHours: 0,   salesHours: 1,   outsourceHours: 0 },
  { area: 'General', task: 'Questionnaire meeting and follow-up',                sortOrder: 2, srHours: 0,   designerHours: 0,   salesHours: 2,   outsourceHours: 0 },
  { area: 'General', task: 'Budget review meetings',                             sortOrder: 3, srHours: 0,   designerHours: 0,   salesHours: 1.5, outsourceHours: 0 },
  { area: 'General', task: 'Energy requirements review',                         sortOrder: 4, srHours: 0,   designerHours: 0,   salesHours: 0,   outsourceHours: 0 },
  { area: 'General', task: 'Fixture schedule soft review before IFC submission', sortOrder: 5, srHours: 1.5, designerHours: 0,   salesHours: 0,   outsourceHours: 0 },
  // UNITS
  { area: 'Units',   task: 'Typical units bluebeam markups',                     sortOrder: 6, srHours: 0,   designerHours: 0,   salesHours: 0,   outsourceHours: 0 },
  { area: 'Units',   task: 'Unit switching and zoning bluebeam markups',         sortOrder: 7, srHours: 0,   designerHours: 0,   salesHours: 0,   outsourceHours: 0 },
  { area: 'Units',   task: 'Unit design review meetings',                         sortOrder: 8, srHours: 1,   designerHours: 0,   salesHours: 0,   outsourceHours: 0 },
  { area: 'Units',   task: 'Submission QC',                                       sortOrder: 9, srHours: 0,   designerHours: 0,   salesHours: 0,   outsourceHours: 0 },
  // CORRIDORS
  { area: 'Corridors', task: 'Corridors bluebeam markups',                       sortOrder: 10, srHours: 0,  designerHours: 0,   salesHours: 0,   outsourceHours: 0 },
  { area: 'Corridors', task: 'Corridor design review meeting',                   sortOrder: 11, srHours: 1,  designerHours: 0,   salesHours: 0,   outsourceHours: 0 },
  { area: 'Corridors', task: 'Submission QC',                                    sortOrder: 12, srHours: 0,  designerHours: 0,   salesHours: 0,   outsourceHours: 0 },
  // GARAGE / BOH / STAIRWELLS
  { area: 'Garage / BOH / Stairwells', task: 'Bluebeam markups',                sortOrder: 13, srHours: 0,  designerHours: 0,   salesHours: 0,   outsourceHours: 0 },
  { area: 'Garage / BOH / Stairwells', task: 'Design review meeting',           sortOrder: 14, srHours: 0,  designerHours: 0.5, salesHours: 0,   outsourceHours: 0 },
  { area: 'Garage / BOH / Stairwells', task: 'Submission QC',                   sortOrder: 15, srHours: 0,  designerHours: 0,   salesHours: 0,   outsourceHours: 0 },
  // HARDSCAPE / LANDSCAPE / PARKING
  { area: 'Hardscape / Landscape / Parking', task: 'Site design review bluebeam markups', sortOrder: 16, srHours: 0, designerHours: 0, salesHours: 0, outsourceHours: 0 },
  { area: 'Hardscape / Landscape / Parking', task: 'Site design review meeting',          sortOrder: 17, srHours: 2, designerHours: 0, salesHours: 0, outsourceHours: 0 },
  { area: 'Hardscape / Landscape / Parking', task: 'Submission QC',                       sortOrder: 18, srHours: 0, designerHours: 0, salesHours: 0, outsourceHours: 0 },
  // EXTERIOR AMENITY
  { area: 'Exterior Amenity', task: 'Exterior amenities design bluebeam markups', sortOrder: 19, srHours: 0, designerHours: 0, salesHours: 0, outsourceHours: 0 },
  { area: 'Exterior Amenity', task: 'Exterior amenities design review meeting',   sortOrder: 20, srHours: 2, designerHours: 0, salesHours: 0, outsourceHours: 0 },
  { area: 'Exterior Amenity', task: 'Submission QC',                              sortOrder: 21, srHours: 0, designerHours: 0, salesHours: 0, outsourceHours: 0 },
  // INTERIOR AMENITY
  { area: 'Interior Amenity', task: 'Interior amenities bluebeam markups',        sortOrder: 22, srHours: 0, designerHours: 0, salesHours: 0, outsourceHours: 0 },
  { area: 'Interior Amenity', task: 'Interior amenities design review meeting',   sortOrder: 23, srHours: 3, designerHours: 0, salesHours: 0, outsourceHours: 0 },
  { area: 'Interior Amenity', task: 'Architectural details review',               sortOrder: 24, srHours: 0, designerHours: 0, salesHours: 0, outsourceHours: 0 },
  { area: 'Interior Amenity', task: 'Decorative fixture coordination',            sortOrder: 25, srHours: 1, designerHours: 0, salesHours: 2, outsourceHours: 0 },
  { area: 'Interior Amenity', task: 'Submission QC',                              sortOrder: 26, srHours: 0, designerHours: 0, salesHours: 0, outsourceHours: 0 },
  // EMERGENCY
  { area: 'Emergency', task: 'Verify emergency strategy with EE',                 sortOrder: 27, srHours: 0, designerHours: 0, salesHours: 0, outsourceHours: 0 },
  { area: 'Emergency', task: 'Download and review EE drawings for emergency fixture layouts', sortOrder: 28, srHours: 0, designerHours: 0, salesHours: 0, outsourceHours: 0 },
  // EXIT SIGNS
  { area: 'Exit Signs', task: 'Download and review EE drawings for exit sign layouts', sortOrder: 29, srHours: 0, designerHours: 0, salesHours: 0, outsourceHours: 0 },
  // TAKEOFFS
  { area: 'Takeoffs', task: 'Submission takeoffs (3–4 submissions)',               sortOrder: 30, srHours: 0, designerHours: 0, salesHours: 0, outsourceHours: 0 },
  // CONTROLS
  { area: 'Controls', task: 'Create controls narrative',                           sortOrder: 31, srHours: 0,   designerHours: 0, salesHours: 0, outsourceHours: 0 },
  { area: 'Controls', task: 'Review controls SOO from EE',                         sortOrder: 32, srHours: 0,   designerHours: 0, salesHours: 0, outsourceHours: 0 },
  { area: 'Controls', task: 'Controls design review meeting',                      sortOrder: 33, srHours: 0.5, designerHours: 0, salesHours: 0, outsourceHours: 0 },
  { area: 'Controls', task: 'Code review / research',                              sortOrder: 34, srHours: 1,   designerHours: 0, salesHours: 0, outsourceHours: 0 },
];

const PEER_REVIEW_TASKS = [
  { area: 'General',  task: 'Questionnaire meeting and review',           sortOrder: 0, srHours: 0, designerHours: 0, salesHours: 1, outsourceHours: 0 },
  { area: 'General',  task: 'Budget review meetings',                     sortOrder: 1, srHours: 0, designerHours: 0, salesHours: 1, outsourceHours: 0 },
  { area: 'Units',    task: 'Typical units review',                       sortOrder: 2, srHours: 0, designerHours: 0, salesHours: 0, outsourceHours: 0 },
  { area: 'Units',    task: 'Unit switching and zoning review',           sortOrder: 3, srHours: 0, designerHours: 0, salesHours: 0, outsourceHours: 0 },
  { area: 'Units',    task: 'Unit design review meetings',                sortOrder: 4, srHours: 1, designerHours: 0, salesHours: 0, outsourceHours: 0 },
  { area: 'Units',    task: 'Submission QC',                              sortOrder: 5, srHours: 0, designerHours: 0, salesHours: 0, outsourceHours: 0 },
  { area: 'Corridors', task: 'Corridor review',                           sortOrder: 6, srHours: 0, designerHours: 0, salesHours: 0, outsourceHours: 0 },
  { area: 'Corridors', task: 'Submission QC',                             sortOrder: 7, srHours: 0, designerHours: 0, salesHours: 0, outsourceHours: 0 },
  { area: 'Garage / BOH / Stairwells', task: 'Review',                   sortOrder: 8, srHours: 0, designerHours: 0, salesHours: 0, outsourceHours: 0 },
  { area: 'Hardscape / Landscape / Parking', task: 'Site review',        sortOrder: 9, srHours: 0, designerHours: 0, salesHours: 0, outsourceHours: 0 },
  { area: 'Exterior Amenity', task: 'Exterior amenities review',          sortOrder: 10, srHours: 0, designerHours: 0, salesHours: 0, outsourceHours: 0 },
  { area: 'Interior Amenity', task: 'Interior amenities review',          sortOrder: 11, srHours: 6, designerHours: 0, salesHours: 0, outsourceHours: 0 },
  { area: 'Interior Amenity', task: 'Fixture schedule audit',             sortOrder: 12, srHours: 4, designerHours: 0, salesHours: 0, outsourceHours: 0 },
  { area: 'Takeoffs', task: 'Submission takeoffs',                        sortOrder: 13, srHours: 0, designerHours: 0, salesHours: 0, outsourceHours: 0 },
  { area: 'Controls', task: 'Controls review',                            sortOrder: 14, srHours: 0, designerHours: 0, salesHours: 0, outsourceHours: 0 },
  { area: 'Report',   task: 'Peer review report and red-lines',           sortOrder: 15, srHours: 4, designerHours: 0, salesHours: 0, outsourceHours: 0 },
];

const TEMPLATES = [
  {
    id:              'tmpl-full-design-standard',
    name:            'Full Design — Standard',
    type:            'FULL_DESIGN',
    isDefault:       true,
    isActive:        true,
    defaultAdderPct: 10,
    docBody:         FULL_DESIGN_DOC,
    milestoneSplit:  FULL_DESIGN_MILESTONES,
    exclusions:      'Energy compliance calculations (Title 24, ASHRAE 90.1), emergency lighting, temporary construction lighting, theatrical/specialty lighting.',
    tasks:           FULL_DESIGN_TASKS,
  },
  {
    id:              'tmpl-design-assist-standard',
    name:            'Design Assist — Standard',
    type:            'DESIGN_ASSIST',
    isDefault:       true,
    isActive:        true,
    defaultAdderPct: 10,
    docBody:         DESIGN_ASSIST_DOC,
    milestoneSplit:  DESIGN_ASSIST_MILESTONES,
    exclusions:      'Full construction documents, photometric calculations, energy compliance.',
    tasks:           DESIGN_ASSIST_TASKS,
  },
  {
    id:              'tmpl-peer-review-standard',
    name:            'Peer Review — Standard',
    type:            'PEER_REVIEW',
    isDefault:       true,
    isActive:        true,
    defaultAdderPct: 10,
    docBody:         PEER_REVIEW_DOC,
    milestoneSplit:  PEER_REVIEW_MILESTONES,
    exclusions:      'Redesign services, construction documents, construction administration.',
    tasks:           PEER_REVIEW_TASKS,
  },
];

async function seedProposalDefaults(prisma, adminUserId) {
  if (!prisma.proposalRate) {
    console.log('⚠ Proposal rates: proposalRate not in schema — skipping');
    return;
  }

  // ── Rates ────────────────────────────────────────────────────────────────────
  for (const rate of DEFAULT_RATES) {
    await prisma.proposalRate.upsert({
      where:  { role: rate.role },
      update: {},  // never overwrite user edits
      create: { role: rate.role, hourlyRate: rate.hourlyRate, updatedById: adminUserId },
    });
  }
  console.log('✓ Proposal rates seeded');

  // ── Templates ────────────────────────────────────────────────────────────────
  for (const tmpl of TEMPLATES) {
    const { tasks, ...templateData } = tmpl;

    const taskRows = tasks.map(t => ({
      area:           t.area,
      task:           t.task,
      sortOrder:      t.sortOrder,
      srHours:        t.srHours,
      designerHours:  t.designerHours,
      salesHours:     t.salesHours,
      outsourceHours: t.outsourceHours,
    }));

    const existing = await prisma.proposalTemplate.findUnique({ where: { id: tmpl.id } });

    if (!existing) {
      await prisma.proposalTemplate.create({
        data: {
          ...templateData,
          createdById: adminUserId,
          tasks: { create: taskRows },
        },
      });
      console.log('✓ Template created:', tmpl.name);
    } else {
      // Always reset tasks to match the source spreadsheet
      await prisma.proposalTemplateTask.deleteMany({ where: { templateId: tmpl.id } });
      await prisma.proposalTemplate.update({
        where: { id: tmpl.id },
        data: {
          type:            templateData.type,
          isDefault:       templateData.isDefault,
          isActive:        templateData.isActive,
          defaultAdderPct: templateData.defaultAdderPct,
          exclusions:      templateData.exclusions,
          milestoneSplit:  templateData.milestoneSplit,
          tasks: { create: taskRows },
        },
      });
      console.log('✓ Template tasks reset:', tmpl.name);
    }
  }
}

module.exports = { seedProposalDefaults };
