// -----------------------------------------------------------------------------
// The point of the "Around the house" search: the Discovery API filters
// events by a geohash (`geoPoint`); `latlong` is deprecated.
//
// The coordinates of the house only go to Ticketmaster as a geohash of 7
// characters (a cell of about 150 m): close enough for a radius of a few
// kilometres, without the exact address.
// -----------------------------------------------------------------------------

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
const PRECISION = 7;

/**
 * @description Encode a position as a geohash.
 * @param {number} latitude - Degrees, -90 to 90.
 * @param {number} longitude - Degrees, -180 to 180.
 * @param {number} [precision] - Characters.
 * @returns {string} The geohash, '' for invalid coordinates.
 * @example
 * geohash(48.8584, 2.2945, 7); // -> 'u09tunq'
 */
function geohash(latitude, longitude, precision = PRECISION) {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return '';
  }
  const lat = latitude;
  const lon = longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return '';
  }
  const ranges = [
    [-90, 90],
    [-180, 180],
  ];
  let hash = '';
  let bits = 0;
  let value = 0;
  let even = true;
  while (hash.length < precision) {
    const range = even ? ranges[1] : ranges[0];
    const coordinate = even ? lon : lat;
    const middle = (range[0] + range[1]) / 2;
    value <<= 1;
    if (coordinate >= middle) {
      value |= 1;
      range[0] = middle;
    } else {
      range[1] = middle;
    }
    even = !even;
    bits += 1;
    if (bits === 5) {
      hash += BASE32[value];
      bits = 0;
      value = 0;
    }
  }
  return hash;
}

/**
 * @description The house of the search: the one chosen in the configuration,
 * else the first one with coordinates.
 * @param {object[]} houses - `getHouses()`: `[{ selector, name, latitude, longitude }]`.
 * @param {string} chosen - The selector chosen, '' for none.
 * @returns {object|null} The house, null when none is located.
 */
function pickHouse(houses, chosen) {
  const located = (Array.isArray(houses) ? houses : []).filter(
    (house) => Number.isFinite(house?.latitude) && Number.isFinite(house?.longitude),
  );
  return located.find((house) => house.selector === chosen) ?? (chosen ? null : located[0]) ?? null;
}

export { PRECISION, geohash, pickHouse };
