// Which building types get detached garages and carports (Mike 2026-09-13):
// garages only on single-family, townhomes, stacked flats and garden walk-ups;
// carports on those plus wraps. Podium, mid-rise, high-rise and the rest get
// neither. Plain data with no imports, so the public form, the internal
// Project Data screen and the budget engine all read ONE copy.
export const GARAGE_TYPE_KEYS  = ['singleFamily', 'townHouses', 'stackedFlats', 'garden'];
export const CARPORT_TYPE_KEYS = [...GARAGE_TYPE_KEYS, 'wrap'];

// A blank building type allows both: the type isn't known yet, so nothing is
// hidden or zeroed until it is.
export const allowsGarages  = typeKey => !typeKey || GARAGE_TYPE_KEYS.includes(typeKey);
export const allowsCarports = typeKey => !typeKey || CARPORT_TYPE_KEYS.includes(typeKey);
