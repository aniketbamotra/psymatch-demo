// src/lib/utils/anonymization/provinceLookup.js

const POSTAL_TO_PROVINCE = {
	"A": "Newfoundland and Labrador",
	"B": "Nova Scotia",
	"C": "Prince Edward Island",
	"E": "New Brunswick",
	"G": "Quebec",
	"H": "Quebec",
	"J": "Quebec",
	"K": "Ontario",
	"L": "Ontario",
	"M": "Ontario",
	"N": "Ontario",
	"P": "Ontario",
	"R": "Manitoba",
	"S": "Saskatchewan",
	"T": "Alberta",
	"V": "British Columbia",
	"X": "Northwest Territories / Nunavut",
	"Y": "Yukon"
};

/**
 * Convert postal code to province name
 * @param {string} postalCode
 * @returns {string}
 */
export function getProvinceFromPostalCode(postalCode) {
	if (!postalCode) return "Ontario"; // Default fallback
	const prefix = postalCode.charAt(0).toUpperCase();
	return POSTAL_TO_PROVINCE[prefix] || "Ontario";
}

/**
 * Transform entire address object to province-only
 * @param {Object} addressObj - The address payload from the Adult Bio
 * @returns {Object} transformed address
 */
export function anonymizeAddress(addressObj) {
	const province = getProvinceFromPostalCode(addressObj?.postalCode);
	const country = addressObj?.country || "Canada";
	return {
		line1: "",
		line2: "",
		city: "",
		province: province,
		postalCode: "",
		country: country
	};
}
