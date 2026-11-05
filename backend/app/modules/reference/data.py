"""Supported countries, their regions and postal-code rules."""

import re

US_STATES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California",
    "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "DC": "District of Columbia",
    "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois",
    "IN": "Indiana", "IA": "Iowa", "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana",
    "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota",
    "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
    "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon",
    "PA": "Pennsylvania", "PR": "Puerto Rico", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont",
    "VA": "Virginia", "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
}  # fmt: skip

CA_PROVINCES = {
    "AB": "Alberta", "BC": "British Columbia", "MB": "Manitoba", "NB": "New Brunswick",
    "NL": "Newfoundland and Labrador", "NS": "Nova Scotia", "NT": "Northwest Territories",
    "NU": "Nunavut", "ON": "Ontario", "PE": "Prince Edward Island", "QC": "Quebec",
    "SK": "Saskatchewan", "YT": "Yukon",
}  # fmt: skip

# First letter of a Canadian postal code identifies the province/territory.
CA_POSTAL_PREFIX = {
    "A": {"NL"}, "B": {"NS"}, "C": {"PE"}, "E": {"NB"}, "G": {"QC"}, "H": {"QC"}, "J": {"QC"},
    "K": {"ON"}, "L": {"ON"}, "M": {"ON"}, "N": {"ON"}, "P": {"ON"}, "R": {"MB"}, "S": {"SK"},
    "T": {"AB"}, "V": {"BC"}, "X": {"NT", "NU"}, "Y": {"YT"},
}  # fmt: skip

COUNTRIES = {
    "US": {"name": "United States", "currency": "USD", "regions": US_STATES, "postal_label": "zip"},
    "CA": {"name": "Canada", "currency": "CAD", "regions": CA_PROVINCES, "postal_label": "postal_code"},
}

_US_ZIP = re.compile(r"^\d{5}(-\d{4})?$")
_CA_POSTAL = re.compile(r"^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$")


def normalize_postal(country: str, postal: str) -> str:
    value = postal.strip().upper()
    if country == "CA":
        compact = value.replace(" ", "")
        return f"{compact[:3]} {compact[3:]}" if len(compact) == 6 else value
    return value


def postal_is_valid(country: str, postal: str) -> bool:
    value = normalize_postal(country, postal)
    if country == "US":
        return bool(_US_ZIP.match(value))
    if country == "CA":
        return bool(_CA_POSTAL.match(value))
    return False


def region_is_valid(country: str, region: str) -> bool:
    return region in COUNTRIES.get(country, {}).get("regions", {})


def postal_matches_region(country: str, postal: str, region: str) -> bool:
    """Light consistency check (Canada only). US ZIP-to-state needs a data set; the provider handles it."""
    if country != "CA":
        return True
    first = normalize_postal(country, postal)[:1]
    return region in CA_POSTAL_PREFIX.get(first, set())
