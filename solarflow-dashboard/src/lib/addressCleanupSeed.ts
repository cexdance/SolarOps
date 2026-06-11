// SolarOps, Address Cleanup seed data
// The 30 customers whose address conflicts across DB / SolarEdge / Trello,
// found by the 2026-06-10 address audit (local detail: address-audit/REVIEW_CONFLICTS.md).
// Seeds the shared Address Cleanup widget checklist; sync state lives in the
// solarops_address_cleanup KV key, this file only provides the initial items.

export interface AddressCleanupSeed {
  id: string;
  customerId: string;
  clientNumber: string;
  name: string;
  dbAddress: string;
  seAddress: string;
  trelloAddress: string;
  note: string;
}

export const ADDRESS_CLEANUP_SEED: AddressCleanupSeed[] = [
  {
    "id": "addrfix-cust-1781105837925",
    "customerId": "cust-1781105837925",
    "clientNumber": "US-15620",
    "name": "Robert Ortiz",
    "dbAddress": "Riverport Drive North 2653 Jacksonville United States Florida",
    "seAddress": "18312 Florida 33",
    "trelloAddress": "",
    "note": "SolarEdge disagrees with DB"
  },
  {
    "id": "addrfix-cust-se-2046496-1778070955728",
    "customerId": "cust-se-2046496-1778070955728",
    "clientNumber": "",
    "name": "US-15019  One Eleven South",
    "dbAddress": "US-15019  One Eleven South",
    "seAddress": "395 Alcazar Avenue",
    "trelloAddress": "",
    "note": "SolarEdge disagrees with DB"
  },
  {
    "id": "addrfix-cust-se-2046496-1776231829407",
    "customerId": "cust-se-2046496-1776231829407",
    "clientNumber": "",
    "name": "US-15019  One Eleven South",
    "dbAddress": "US-15019  One Eleven South",
    "seAddress": "395 Alcazar Avenue",
    "trelloAddress": "",
    "note": "SolarEdge disagrees with DB"
  },
  {
    "id": "addrfix-cust-144",
    "customerId": "cust-144",
    "clientNumber": "US-15435",
    "name": "Jose Tobar",
    "dbAddress": "330 Beulah Rd, Winter Garden, FL 34787",
    "seAddress": "1330 Beulah Road",
    "trelloAddress": "1330 BEULAH RD",
    "note": "SolarEdge and Trello both disagree with DB"
  },
  {
    "id": "addrfix-cust-se-2046496-1776230039797",
    "customerId": "cust-se-2046496-1776230039797",
    "clientNumber": "",
    "name": "US-15019  One Eleven South",
    "dbAddress": "US-15019  One Eleven South",
    "seAddress": "395 Alcazar Avenue",
    "trelloAddress": "",
    "note": "SolarEdge disagrees with DB"
  },
  {
    "id": "addrfix-cust-se-2046496-1776226594567",
    "customerId": "cust-se-2046496-1776226594567",
    "clientNumber": "",
    "name": "US-15019  One Eleven South",
    "dbAddress": "US-15019  One Eleven South",
    "seAddress": "395 Alcazar Avenue",
    "trelloAddress": "",
    "note": "SolarEdge disagrees with DB"
  },
  {
    "id": "addrfix-cust-171",
    "customerId": "cust-171",
    "clientNumber": "US-15505",
    "name": "Britney W",
    "dbAddress": "Southwest 8th Court 7910A",
    "seAddress": "7910A Southwest 8th Court",
    "trelloAddress": "7910 Sw 8 Ct",
    "note": "SolarEdge and Trello both disagree with DB"
  },
  {
    "id": "addrfix-cust-1779398468838",
    "customerId": "cust-1779398468838",
    "clientNumber": "US-15608",
    "name": "Carolina Herrera",
    "dbAddress": "FL",
    "seAddress": "2081 Northwest 52nd Street",
    "trelloAddress": "",
    "note": "SolarEdge disagrees with DB"
  },
  {
    "id": "addrfix-cust-26",
    "customerId": "cust-26",
    "clientNumber": "US-15214",
    "name": "Alexey Alonso",
    "dbAddress": "19120 NW 10th Street, Southwest Ranches, FL, 33029",
    "seAddress": "",
    "trelloAddress": "250 Home Run Conduit rehab - Materials - $190",
    "note": "Trello disagrees with DB"
  },
  {
    "id": "addrfix-cust-140",
    "customerId": "cust-140",
    "clientNumber": "US-15421",
    "name": "Rafael Padron",
    "dbAddress": "Southwest 14th Street 1811, Miami, FL, 33145",
    "seAddress": "",
    "trelloAddress": "15421 Rafael Padron 1811 SW 14 ST",
    "note": "Trello disagrees with DB"
  },
  {
    "id": "addrfix-cust-165",
    "customerId": "cust-165",
    "clientNumber": "US-15483",
    "name": "David Lautermilch",
    "dbAddress": "Hall Road Southeast 3282, Malabar, FL, 32909",
    "seAddress": "",
    "trelloAddress": "15483 David Lautermilch 3282 hall rd se.. Palm bay Fl 32909 47080",
    "note": "Trello disagrees with DB"
  },
  {
    "id": "addrfix-cust-se-990489",
    "customerId": "cust-se-990489",
    "clientNumber": "",
    "name": "US-15586 Small, Eamonn",
    "dbAddress": "930 Arizona Avenue, Melrose Park, Florida, 33312",
    "seAddress": "",
    "trelloAddress": "33312 930 ARIZONA AVENUE _FORT LAUDERDALE_, FL 33312",
    "note": "Trello disagrees with DB"
  },
  {
    "id": "addrfix-cust-126",
    "customerId": "cust-126",
    "clientNumber": "US-15397",
    "name": "Jarrod Hollander",
    "dbAddress": "13241 Starfish Drive, Hudson, FL, 34667",
    "seAddress": "",
    "trelloAddress": "15397 Jarrod Hollander 13241 Starfish Drive, Hudson, FL.",
    "note": "Trello disagrees with DB"
  },
  {
    "id": "addrfix-cust-1775764183874",
    "customerId": "cust-1775764183874",
    "clientNumber": "US-15586",
    "name": "Eamonn Small",
    "dbAddress": "930 ARIZONA AVENUE FORT LAUDERDALE, FL 33312., FORT LAUDERDALE, FL, 33312",
    "seAddress": "",
    "trelloAddress": "33312 930 ARIZONA AVENUE _FORT LAUDERDALE_, FL 33312",
    "note": "Trello disagrees with DB"
  },
  {
    "id": "addrfix-cust-se-990489-1776227494436",
    "customerId": "cust-se-990489-1776227494436",
    "clientNumber": "",
    "name": "US-15586 Small, Eamonn",
    "dbAddress": "930 Arizona Avenue, Melrose Park, FL, 33312",
    "seAddress": "",
    "trelloAddress": "33312 930 ARIZONA AVENUE _FORT LAUDERDALE_, FL 33312",
    "note": "Trello disagrees with DB"
  },
  {
    "id": "addrfix-cust-174",
    "customerId": "cust-174",
    "clientNumber": "US-15516",
    "name": "Carolina Garcia",
    "dbAddress": "352 Creek Road, Lake Alfred, FL, 33850",
    "seAddress": "",
    "trelloAddress": "3200 352 creek rd",
    "note": "Trello disagrees with DB"
  },
  {
    "id": "addrfix-cust-186",
    "customerId": "cust-186",
    "clientNumber": "US-15556",
    "name": "José Negron",
    "dbAddress": "Landing Drive 24315, Lutz, FL, 33559",
    "seAddress": "",
    "trelloAddress": "4 days no coms 24315 landing dr. lutz 33559 tx",
    "note": "Trello disagrees with DB"
  },
  {
    "id": "addrfix-cust-114",
    "customerId": "cust-114",
    "clientNumber": "US-15375",
    "name": "Chris Rediske",
    "dbAddress": "Pocahontas Path 1750, Maitland, FL, 32751",
    "seAddress": "",
    "trelloAddress": "11587 Losano Drive",
    "note": "Trello disagrees with DB"
  },
  {
    "id": "addrfix-cust-1779820921318",
    "customerId": "cust-1779820921318",
    "clientNumber": "US-15612",
    "name": "Lori Joachim",
    "dbAddress": "2519 La Jolla TrailKissimmee, FL 34747, FL",
    "seAddress": "",
    "trelloAddress": "25 La Jolla Trail, reported that her solar Edge inverter is not working",
    "note": "Trello disagrees with DB"
  },
  {
    "id": "addrfix-cust-se-2574534",
    "customerId": "cust-se-2574534",
    "clientNumber": "US-15605",
    "name": "Damien DeRozairo",
    "dbAddress": "Surfside Court 4203, Port Charlotte, Florida, 33948",
    "seAddress": "",
    "trelloAddress": "15605 Damien DeRozario 4203 sursfide court port charlotte",
    "note": "Trello disagrees with DB"
  },
  {
    "id": "addrfix-cust-se-990489-1776231829407",
    "customerId": "cust-se-990489-1776231829407",
    "clientNumber": "",
    "name": "US-15586 Small, Eamonn",
    "dbAddress": "930 Arizona Avenue, Melrose Park, Florida, 33312",
    "seAddress": "",
    "trelloAddress": "33312 930 ARIZONA AVENUE _FORT LAUDERDALE_, FL 33312",
    "note": "Trello disagrees with DB"
  },
  {
    "id": "addrfix-cust-158",
    "customerId": "cust-158",
    "clientNumber": "US-15469",
    "name": "Jonathan Ambaye",
    "dbAddress": "Balmoral Drive 925, Loughman, FL, 33896",
    "seAddress": "",
    "trelloAddress": "685 NW 127th Court",
    "note": "Trello disagrees with DB"
  },
  {
    "id": "addrfix-cust-se-990489-1776226524633",
    "customerId": "cust-se-990489-1776226524633",
    "clientNumber": "",
    "name": "US-15586 Small, Eamonn",
    "dbAddress": "930 Arizona Avenue, Melrose Park, FL, 33312",
    "seAddress": "",
    "trelloAddress": "33312 930 ARIZONA AVENUE _FORT LAUDERDALE_, FL 33312",
    "note": "Trello disagrees with DB"
  },
  {
    "id": "addrfix-cust-se-3060071-1778070955728",
    "customerId": "cust-se-3060071-1778070955728",
    "clientNumber": "US-15596",
    "name": "Abel Garcia-Valdes",
    "dbAddress": "Plantation Boulevard 7750, Miramar, Florida, 33023",
    "seAddress": "",
    "trelloAddress": "32 panels. Address 7750 Plantation Blvd. Miramar Fl 33023.",
    "note": "Trello disagrees with DB"
  },
  {
    "id": "addrfix-cust-49",
    "customerId": "cust-49",
    "clientNumber": "US-15246",
    "name": "John Pirroni",
    "dbAddress": "3230 Northeast 40th Street, Lauderdale-by-the-Sea, FL, 33308",
    "seAddress": "",
    "trelloAddress": "44 514479 3230 ne 40th st ft lauderdale 33308",
    "note": "Trello disagrees with DB"
  },
  {
    "id": "addrfix-cust-162",
    "customerId": "cust-162",
    "clientNumber": "US-15478",
    "name": "Zoila Posada",
    "dbAddress": "Hope Lane, 5232, Weeki Wachee, FL, 34606",
    "seAddress": "",
    "trelloAddress": "5216 Hope Ln, Spring Hill Fl 34606",
    "note": "Trello disagrees with DB"
  },
  {
    "id": "addrfix-cust-64",
    "customerId": "cust-64",
    "clientNumber": "US-15289",
    "name": "James Ward",
    "dbAddress": "Wilkinson Road 590, Hypoluxo, FL, 33462",
    "seAddress": "",
    "trelloAddress": "300242 - Street: 590 Wilkinson road",
    "note": "Trello disagrees with DB"
  },
  {
    "id": "addrfix-cust-141",
    "customerId": "cust-141",
    "clientNumber": "US-15422",
    "name": "Huston Newsome",
    "dbAddress": "Challenger Drive 15025, Tavares, FL, 32778",
    "seAddress": "",
    "trelloAddress": "6802 Stapoint Ct",
    "note": "Trello disagrees with DB"
  },
  {
    "id": "addrfix-cust-164",
    "customerId": "cust-164",
    "clientNumber": "US-15482",
    "name": "James McClendon",
    "dbAddress": "111th Street North 8842, Seminole, FL, 33772",
    "seAddress": "",
    "trelloAddress": "15482 James McClendon James McClendon 8842 111 St Seminole fl 33772",
    "note": "Trello disagrees with DB"
  },
  {
    "id": "addrfix-cust-20",
    "customerId": "cust-20",
    "clientNumber": "US-15204",
    "name": "Juan Alassia",
    "dbAddress": "Bay Heights Drive 20, Miami, FL, 33133",
    "seAddress": "",
    "trelloAddress": "13029 Santuary Village Ln. Tampa Fl 33624.",
    "note": "Trello disagrees with DB"
  }
];
