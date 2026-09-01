// Run: node cleanName.test.mjs
// Guards the one piece of parsing in the site-transfer sync. The client id goes
// into Xero's ContactNumber, so leaving it in the Name too reads twice.
import assert from "node:assert/strict";

const cleanName = (name, clientId) => {
  let n = (name ?? "").trim();
  if (clientId && n.toUpperCase().startsWith(clientId.toUpperCase())) {
    n = n.slice(clientId.length).trim();
  }
  return n.replace(/^US-\d{4,6}\s+/i, "").trim();
};

// real shapes seen in live data
assert.equal(cleanName("US-15017 Parque Solar Doral", "US-15017"), "Parque Solar Doral");
assert.equal(cleanName("Edward Suplee", "US-15687"), "Edward Suplee");
// id present in the name but not matching the record's own clientId
assert.equal(cleanName("US-14999 Some Site", "US-15687"), "Some Site");
// lowercase, padding, and a name that merely starts with "US"
assert.equal(cleanName("  us-15017   Parque  ", "US-15017"), "Parque");
assert.equal(cleanName("USA Solar Group", "US-15687"), "USA Solar Group");
// never returns the id alone as a name
assert.equal(cleanName("US-15017", "US-15017"), "");

console.log("PASS");
