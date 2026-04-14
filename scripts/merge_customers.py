#!/usr/bin/env python3
"""
Merge SolarEdge sites (fl_sites.csv) + Google Sheet O&M list + importedClients
into a single unified Customer array for dataStore.ts.

Rules:
  - importedClients is the master client ID registry
  - Google Sheet enriches: phone, email, address, case status, notes
  - fl_sites.csv enriches: solarEdgeSiteId, overrides address, adds monitoring data
  - Duplicate clientIds (2+ SolarEdge sites): flag as US-15XXXXX (add XX suffix)
  - Sites with no clientId: assign sequential US-15xxx.1, US-15xxx.2...
  - All names/addresses from SolarEdge preferred for address; Google Sheet preferred for name
"""

import csv, json, re, sys
from collections import defaultdict
from io import StringIO

# ─── 1. GOOGLE SHEET DATA (fetched) ─────────────────────────────────────────
GOOGLE_SHEET_CSV = """,Client,address,Phone,Email,issue,project number,Lead Date,case status,Case Number SolarEdge RMA,Notes,Contractor Or Support,RMA Comp
1,Darryl leversuch,10862 NW 15 st Pompano 33071,9542987085,leversuch@outlook.com,comunication issue,US-15218,,resolved,None,Site visit. Communication issue resolved. $180 for service call,,
2,Jeeyoung Kim,1418 Funston st Hollywood 33020,3474213687,jkim3@hotmail.com,inverter replacement,US-15215,,resolved,None,Inverter replaced,,
3,Daniel Rey,"10330 NW 20th Ct Sunrise, FL 33322",3059924810,Drey887@gmail.com,inverter replacement,US-15206,,resolved,"5274066, 5210132",Inverter replaced,,
4,Stacy Ann Rambally,"10669 W 32 lane Hialeah, FL 33018",2039933005,stacy2k2002@live.com,inverter replacement,US-15195,,resolved,4948412,Inverter replaced,,
5,Augusto Fonte,"7400 SW 68th St, Miami, FL 33143",3059846881,gus@ajfproperties.com,O&M,US-15057,,in progress,NONE,Case #5304004 DC Voltage too high. Inverter locked,Adrian,
6,Andres Korda,"1515 NE 12th Pl Miami Beach, FL 33139",,andreskorda@gmail.com,O&M,US-15086,,in progress,None,Upgraded installation with 10 extra panels,,
7,Island Hammock Pet Hospital,"98175 Overseas Hwy, Key Largo, FL 33037",,,inverter replacement,US-15197,,in progress,5040118,Optimizers need to be replaced,Adrian,
8,Juan Alassia,"20 Bay Heights Dr, Miami, FL 33133",,,car charger installation,US-15214,,resolved,5200416,Car charger installed at residence,,
9,Pascual Ciampi,"149 montclaire dr. Weston, Fl",,,installation,US-15101,,resolved,None,No problems,,
10,Sean Paquet,"16423 SW 111 ave Miami, FL 33157",,,inverter replacement,US-15196,,resolved,None,Inverter replaced,,
11,Juan Recio,"10711 Aqua Ct Parkland, FL 33076",,,monitoring,US-15197,,resolved,None,Inverter firmware updates and droning,,
12,Alexey Alonso,"19120 NW 10th St Pembroke Pines, FL 33029",,,optimizer replacement,US-15214,,resolved,None,Optimizer replacement,,
13,Carla Harris,"13310 NW 24 ave Miami, FL 33167",,,inverter and optimizer replacement,US-15200,,resolved,"5102238, 5102213",Inverter replaced,,
14,Francis García,"19240 SW 119th Pl Miami, FL 33177",,,inspection,US-15220,,resolved,NONE,Gerardo Present on roof for video call inspection,,
15,Ramon Gutierrez,"11014 SW 159th Terrace Miami, FL 33157",,,inverter replacement,US-15210,,resolved,5171116,Inverter replaced,,
16,David Gonzalez,"2724 Misty Oaks Circle Royal Palm Beach, FL 33411",,,inverter replacement,US-15193,,resolved,None,Inverter replaced. He had the RMA at home,,
17,Nathana Sharma,1540 SW 4th Cir. Boca Raton FL 33486,,,Panel removal and reinstallation,US-15183,,in progress,None,"Close permit, Install skirts",,
18,Fred Walumba,"8521 SW 179TH ST PALMETTO BAY, FL 33157",,,comunication issue,US-15213,,in progress,none,Inverter has had a couple of problems. Has not been replaced,,
19,Marco Oliveira,"6700 SW 133rd Ter Pinecrest, FL 33156",,,inverter replacement,US-15207,,in progress,"5187169, 5171009",Change the Fuse Disconnect,,
20,Robert Millares,"1711 NW 104th Ave Pembroke Pines, FL 33026",,,inverter cellular expires,US-15231,,in progress,none,Same as Gary McMillan. Old inverter with no problems that will lose cellular connection,,
21,William Rolack,"8461 Long Acre Dr Miramar, FL 33025",,,inverter replacement,US-15228,,resolved,None,Inverter replaced. He had the RMA at home Owes $250,,
22,Brian Mori,"1271 Redbird Ave Miami Springs, FL 33166",,,inverter replacement,US-15211,,resolved,None,RMA Replaced,,
23,Dorine Wollangk,"954 NE 26th Ave Pompano Beach, FL 33062",,,comunication issue,US-15230,,in progress,5343920,she replaced the inverter with a unit bought on ebay old inverter still on site. Requested RMA,Adrian,
24,Joshua McGehee,"11683 46th Pl N West Palm Beach, FL 33411",,,inverter replacement,US-15227,,resolved,,Added a WiFi Adapter,,
25,Francisco Maldonado,"141 Dinner lake Ave Lake Wales, FL 33859",,,inverter replacement,US-15222,,,,,,
26,Regla Glau,15370 SW 302 st. Homestead Fl. 33033,,,inverter commisioning,US-15226,,,,,,
27,Jessica Valenzuela,8407 Dynasty dr boca raton 33433,,,comunication issue,US-15219,,resolved,5265352,,,
28,Anniel Romero,"731 Burlington St Opa-locka, FL 33054",,,inverter troubleshooting,US-15247,10/22/24,SYSTEM DOWN,,System NOT WORKING,,
29,Donald Said,"11090 NW 26TH DR CORAL SPRINGS, FL 33065",,,POI issue and Inverter replacement,US-15217,,resolved,"5276996, 5274066",Will need to rewire,,
30,Sondra Schubiner,"5293 NW 21st Ave Boca Raton, FL 33496",,,roof leak,US-15221,,,,,,
31,Roselore Edoduar,"354 Bravada St Ocoee, FL 34761",,,Re roof,,,,,,,
32,Elvis Sosa,"101 NE 16th Ct Fort Lauderdale, FL 33305",,,inverter replacement,US-15224,10/23/24,Closed - No Opportunity,,,,
33,Annie Burton,homestead,,,upgrade curent system,,,,,,,
34,Yadiel Huet,"6081 SW 153rd Ct Rd Miami, FL 33193",,,inverter replacement,US-15216,,resolved,"5249754, 5249745",we need to replace the serial numbers of the inverters on the monitoring portal. Waiting on client to send pictures of the inverters,,
35,Lázaro Perona,15370 SW 302 st. Homestead Fl. 33033,,,upgrade curent system,US-15225,,,,,,
36,Thomas Mcleod,"5990 SW 44th Terrace Miami, FL 33155",,,upgrade curent system,US-15223,,,,,,
37,Azad Amin,"1753 Lauderdale Manor Dr Fort Lauderdale, FL 33311",,,system expansion (battery),US-15208,,,,,,
38,Lellany Guevara,,,,,,,,,,,
39,Pablo Herrera,"2305 SW 23rd St Miami, FL 33145",,,system expansion,US-15175,,resolved,4833780,,,
40,Gary Gilbert,Jacksonville,,,New PV,,,,,,,
41,Manny Patel,"14371 E Cherry Lake Dr Jacksonville, FL 32258",,,system expansion,,,,,,,
42,Jean Phillidor,"18510 nw 22nd cr Miami Gardens, Fl 33056",,,inverter replacement,US-15209,,resolved,5176848,client still has to pay,,
43,Ricardo Stivalet,"13167 SW 26th St, Hollywood, FL 33027",,,Remove and re install,US-15172,,resolved,NONE,Waiting on final inspection,,
44,Gary Mcmillan,"3255 Allamanda st Miami, FL 33133",,,inverter cellular expires,US-15229,,in progress,,Send a text message to see if client is still interested in the WiFi upgrade.,,
45,Jacqueline Briones,Lake Worth,,,,,,,,,,
46,Jeffry Otero,FLL,,,Lead Return,,,,,,,
47,Gustavo de la Torre,Hialeah,,,New PV,,,,,,,
48,Charles Stephenson,Popmpano Beach,,,Panels for Pool,,,,,,,
49,Jesús Pereira,South Miami,,,Panels for property,,,on hold,,,,
50,Joe Israel,FLL,,,,,,,,,,
51,Vinny Sessa,FLL,,,,,,,,,,
52,Patrician Zhangi,FLL,,,return lead,,,,,,,
53,Fabio Miccolis,7550 sw 136th st Miami FL 33156,,,on hold,,,,,,,
54,Rachel Goldberg,"1330 NE 134th st Miami, FL 33164",,,comunication issue,,,,,,,
55,Jason Campbell,"10101 State St Tamarac, FL 33321",,,comunication issue,,,,,,,
56,Ian Brown,"10621 NW 28th Manor Fort Lauderdale, FL 33322",,,Battery System Expansion,,,,,Site transfer Done Call Client,,
57,Anthony Gandley,"3785 Bishop landing way Orlando, Florida 32824",,,inverter issue,US-15238,,in progress,none,-Updated the inverter firmware. - Changed the antena to the wifi port on the inverter top cabinet. - connected the inverter to the house wifi.,,
58,Rico Brown,,,,,,,,,,,
59,M. Camp,Tampa,,,,,,,,,,
60,Radames Rolon,orlando,,,Lead Return,,,,,,,
61,Jeremiah schwartz,2738 Bickley Dr. Opoka fl 32712.,,,New PV,,,,,,,
62,Rick Wilson,Popmpano Beach,,,New PV,Us-15249,,,,,,
63,Lazaro Perona,15370 SW 302 st. Homestead Fl. 33033,,,commisioning,,,,,,,
64,David Smitherman,"570 NW 112th St Miami, FL 33168",,,wifi adaptor,US-15233,,,,,,
65,Carolys Rivera,1529 Majestic Lane Winter Haven Fl 33880,,,inverter replacement,US-15244,,,,,,
66,Mariana Leiva,1145 NE 155th st Miami FL 33162,,,inverter troubleshooting,US-15237,,resolved,,,,
67,Mark Martel,"710 NE 47th Ct Oakland Park, FL 33334",,,battery issues,,,,,,,
68,Yamile Camejo,1366 SW 69 ave Miami FL 33144,,,comunication issue,US-15238,,,,,,
69,Tara Batz,246 Country Cottage Ln WINTER GARDEN FL 34787,,,comunication issue,US-15236,,,,,,
70,Ben Nguen,Odessa,,,inverter troubleshooting,,,,,,,
71,Luisking Pena,10246 NW 53rd Ct Pompano Beach FL 33076,,,inverter troubleshooting,US-15260,,,,,,
72,Keith Blanchard,15879 tisons Bluff Rd Jacksonville 32218,,,return lead,,,,,,,
73,Ernesto Catala,"402 South Jefferson Street, Beverly Hills, FL, US",,,comunication issue,US-15242,,resolved,,,,
74,Robert Kuehn,5382 Aragon Ave in DeLeon Springs FL 32130.,,,inverter replacement,,,,,,,
75,Yosvani Camargo,1379 SW 154th Ct Miami FL 33194,,,optimizer replacement,US-15243,,resolved,,Latest status. Changed 60 Amp Breaker,,
76,Carlos Pineda,312 SW 2 st Hallandale Fl 33009,,,wifi Proposal,,,,,,,
77,James Ward,590 Wilkinson Rd Lake Worth Fl 33462,,,inverter troubleshooting,,,,,,,
78,Janet Bravo,8631 NW 15th Ct Hollywood Fl 33024,,,inverter troubleshooting,US-15253,,resolved,,,,
79,Iam Nixon,miami,,,return lead,,,,,bahamas installer,,
80,Manuel Alberto,"4172 nw 19th ter, Fort Lauderdale, 33309",,,New PV,,,,,,,
81,Christa Chambers,Auburndale Fl 33823,,,New PV,,,,,,,
82,Dev Maraj,kissimmee,,,New PV,,,,,,,
83,Richard Whitney,Davenport Fl 33837,,,New PV,,,,,,,
84,Delafrance Mirtyle,Apopka FL 32712,,,New PV,,,,,,,
85,Kirby Rice,2162 Geneva Dr Lakeland Fl 33805,,,New PV,,,,,,,
86,Roberto Ruiz,Orlando Fl 32828,,,New PV,,,,,,,
87,Jacqueline Brookes,1420 W Broome St Lake Worth FL 33462,,,Re roof,,,,,,,
88,Sheila scarlett,Deland Fl,,,optimizer replacement,,,,,,,
89,Rhina Martinez,2830 Harmonia Hammock Rd Saint Cloud Fl 34773,,,service,,,,,,,
90,Jeremy Fisher,7721 Alhambra Blvd Hollywood Fl 33023,,,inverter replacement,US-15248,,in progress,,,,
91,Jesus Soto,1531 Barberry Dr Kissimmee FL 34744,,,service,,,,,,,
92,Joaquin Molina,408 Lobelia Dr Davenport FL 33837,,,service,US-15274,,,,,,
93,Bruno Dominijianni,9384 Longmeadow Circle Boyton Beach Fl 33436,,,service,,,,,,,
94,Robert Baker,"8300 SW 63rd Ct South Miami, FL 33143",,,optimizer replacement,US-15252,,in progress,,,,
95,Thomas Fender,Davenport Fl 33837,,,Re roof,,,,,,,
96,Pedro Olavarria,Haines City FL 33844,,,service,US-15276,,,,,,
97,Michael Nunn,Orlando Fl 32835,,,system expansion (battery),US-15271,,,,,,
98,Kyle Lacroix,"2579 Surrey Dr Palm Harbor, FL 34684",,,inverter replacement,US-15256,,in progress,,,,
99,Sterver Harriot,"6120 Oakcrest Cir, Orlando, FL 32808",,,Re roof,,,in progress,,,,
100,Miguel Vargas,"14548 Porter Rd Winter Garden, FL 34787",,,inverter replacement,US-15259,,resolved,,,,
101,Arnaldo Irizarry,"2771 Bayonne Ct, Deltona, FL 32725",,,commisioning,US-15254,,resolved,,,,
102,Wladimir Kolomizew,"1028 Lena Run Ct Winter Haven, FL 33880",,,Roof Anchor replacements,US-15257,,in progress,,,,
103,Gabriel Gareis,1050 NW 149th st Miami Fl 33168,,,optimizer replacement,US-15273,,in progress,,,,
104,Kerry Sievels,1414 Heirloom Dr Orlando FL 32818,,,system expansion,US-15277,,in progress,,,,
105,Ivan Almnaza,Lakeland Fl 33801,,,Re roof,,,,,,,
106,Tanvir Ahmed,374 SW 32 terrace Deerfield Beach Fl 33442,,,inverter replacement,US-15265,,in progress,,,,
107,Jennifer Sanchez Rodriguez,5838 Forest Ridge Dr Winter Haven Fl 33881,,,inverter replacement,US-15270,,in progress,,,,
108,Marcus Haynes,2238 Belsfield circle Clermont 34711,,,inverter replacement,,,in progress,,,,
109,Garcon Garcon,Boynton Beach Fl 33426,,,Re roof,,,in progress,,,,
110,Emily Mctigue,"1708 Main St Valrico, FL 33594",,,inverter replacement,US-15264,,in progress,,,,
111,Donald West,Apopka Fl 32703,,,Re roof,,,in progress,,,,
112,Michael Gray,2823 Harmonia Hammock Rd Sait Cloud Fl 34773,,,battery issues,,,,,,,
113,janet Bee,1132 N Platte Ln Kissimmee Fl 34759,,,service,,,,,,,
114,Zaida Stuart,"1911 Tallpine Rd Melbourne, FL 32935",,,service,US-15262,,in progress,,,,
115,Tino Garcia,"406 Galloway St Lake Alfred, FL 33850",,,inverter replacement,US-15272,,resolved,,,,
116,Fiona Ash,840 Pineda Rd Lake helen Fl 32744,,,return lead,,,,,,,
117,Gregory Gross,15618 Montesino Dr Orlando Fl 32828,,,service,US-15269,,in progress,,,,
118,Antoinette Scott,8162 Swift Fox Trl Jacksonville Fl 32222,,,wifi adaptor,US-15267,,in progress,,,,
119,David Young,8785 Warwick Shore Crossing Orlando Fl 32829,,,service,,,,,,,
120,Keneth Austin,61 Kalandar st Opa Locka Fl 33054,,,service,,,,,,,
121,Maria Fiore,4909 Monarch Ln Kissimmee Fl 34746,,,service,US-15268,,,,,,
122,Donnie Gorleski,1729 N Curlew Lane Homestead Fl 33035,,,Re roof,,,,,,,
123,Jean Phillippe,Orlando Fl 32824,,,service,US-15278,,in progress.,,SIte transfer done.,,
124,Thomas Thallma,Tampa Fl 33635,,,service,,,,,,,
125,Sean Robert,2400 Nw 39th st Boca Raton Fl 33431,,,service,,,,,,,
126,Hector Escobales,Tampa Fl 33635,,,service,,,,,,,
127,Ivan Rodriguez,1210 Haines Dr Winter Haven Fl 33881,,,inverter replacement,US-15279,,,,,,
128,David Mclauhglin,"4570 123rd Trail N West Palm Beach, FL 33411",,,Re roof,US-15263,,in progress,,,,
129,Cristiano Sanches Rodrigues,8981 Lake Park Circle North Ft Lauderdale Fl 33328,,,inverter replacement,US-15245,,in progress,,,,
130,Robert Moch,"7770 NW 47th St Lauderhill, FL 33351",,,service,US-15234,,in progress,,,,
131,Ramiro Garcia,5382 South Sterling Ranch Circle Davie Fl 33314,,,return lead,US-15212,,resolved,,,,
132,Germitha Hora,"6460 NW 28th St Sunrise, FL 33313",,,site transfer,,,resolved,,,,
133,John Pirroni,"3230 NE 40th St Fort Lauderdale, FL 33308",,,inverter replacement,US-15246,,resolved,,,,
134,Freida Rosario,West Palm Beach FL 33411,,,wifi adaptor,US-15235,,resolved,,,,
135137,Nancy Hunter,Riverview FL 33569,,,service,,,,,,,
138,Lellany Guevara,15270 SW 41 terrace Miami fl 33185,,,Closed - No Opportunity,US-15291,4/27/24,Closed - No Opportunity,,,,
139,Annie Burton (Homestead),Homestead,,,Sistem upgrade - Roof Tile Weight Issue,,,Closed - No Opportunity,,,,
140,Maritza Garcia,5853 SW 149 ave Miami 33183,3056103464,maritorres@msn.com,no issue,,,resolved,None,Client says that their bill is higher than before. Panels and inverter are working properly,,
141,Julio Medina (TAMPA),"2205 Towering Oaks Circle, Seffner, FL, US",81-3541-6083,kakita316@gmail.com,CONTACT SUPPORT FOR SITE REVIEW,,,,,,,
142,Gerald Hesselman (KISSIMMEE),,7174335294,jerry.hesselman@outlook.com,CONTACT SUPPORT FOR REPAIR,,,,,,,
143,Vincent Lewis,"6023 Bay Lake Drive North, St. Petersburg, FL 33708",+12154856954,vlewis@lewistower.com,HD Wave to Home Hub conversion,US-15530,3/6/2026,in progress,6005781,"Shipped USE6000H-USMNBE78 SN: SB3225-075147FE7-EF. Old: SE6000H-US000BNU4 SN: SV2422-0740BEE1E-8B. Tracking: 1Z8AE6970306830925. ETA 3/9/2026. Account: Better Earth. Family: Venus-3. Case ID: 2742d19e-2a41-890b-8a48-689a875932a7",,
144,Margarita Maldonado,"8014 Page Court, Haines City, FL 33844",+118632212187,magomal25@icloud.com,HD Wave to Home Hub conversion,US-15531,3/6/2026,in progress,6496138,"Shipped USE10000H-USMNBE78 SN: SB3225-075147FEA-F2. Old: SE10000H-US000BEU4 SN: SJ1822-07406B2CD-F9. Tracking: 1Z8AE6970306830729. ETA 3/9/2026. Account: Palmetto Solar. Modem: LTE. Family: Venus-3. Case ID: 3875767c-9c26-67cf-59de-6997f41bb32a",,
145,Brilliant Harvest LLC,"1718 Independence Blvd, Sarasota, FL 34234",,,V-CAP Inverter Replacement,US-15532,3/6/2026,in progress,6544384,"EV ready inverter replacement. Restore Communication. EV plug must be configured and tested at time of install. Shipped SE7600H-US000BEW4 SN: SV4723-0750CFC58-D5. Old: USE7600H-USMNBE78 SN: SB3125-075146A19-0C. Tracking: 1Z769A050306827029. Director Exceptions. Family: Venus-3 Energy Hub. Case ID: 28b6389b-9259-4ac3-1ee8-69ab7dc2366a",,
"""

# ─── 2. IMPORTED CLIENTS from dataStore.ts ──────────────────────────────────
IMPORTED_CLIENTS = [
  {'clientId': 'US-15015', 'name': 'Daniel Matos Residence', 'status': 'SALES'},
  {'clientId': 'US-15017', 'name': 'Parque Solar Doral', 'status': 'SALES'},
  {'clientId': 'US-15018', 'name': 'Ransome Evergades Highschool', 'status': 'SALES'},
  {'clientId': 'US-15019', 'name': 'rbi BK', 'status': 'SALES'},
  {'clientId': 'US-15020', 'name': 'Cook, Daniel', 'status': 'SALES'},
  {'clientId': 'US-15021', 'name': 'Elizabeth Demeno', 'status': 'SALES'},
  {'clientId': 'US-15022', 'name': 'Residence San Roman', 'status': ''},
  {'clientId': 'US-15023', 'name': 'Residencia PH las Mercedes', 'status': 'SALES'},
  {'clientId': 'US-15024', 'name': 'Residencia Ragazzi', 'status': 'SALES'},
  {'clientId': 'US-15025', 'name': 'Telefónica: RB Mariguitar', 'status': 'SALES'},
  {'clientId': 'US-15036', 'name': 'Bobby Acon', 'status': 'SALES'},
  {'clientId': 'US-15054', 'name': 'City of Tamarac Fire Station 36', 'status': 'SALES'},
  {'clientId': 'US-15057', 'name': 'Fonte Residence', 'status': 'O&M'},
  {'clientId': 'US-15068', 'name': 'Pelaez Residence', 'status': 'SALES'},
  {'clientId': 'US-15086', 'name': 'Korda Residence', 'status': 'O&M'},
  {'clientId': 'US-15095', 'name': 'Hernandez Residence', 'status': 'SALES'},
  {'clientId': 'US-15096', 'name': 'Alba Residence', 'status': 'SALES'},
  {'clientId': 'US-15097', 'name': 'Hoffner Center Retail', 'status': 'SALES'},
  {'clientId': 'US-15098', 'name': 'Sapicas Residence', 'status': 'SALES'},
  {'clientId': 'US-15099', 'name': 'LMI Property', 'status': 'SALES'},
  {'clientId': 'US-15100', 'name': 'Edificio YOHANA', 'status': 'SALES'},
  {'clientId': 'US-15101', 'name': 'Ciampi Residence', 'status': 'O&M'},
  {'clientId': 'US-15102', 'name': 'Corpotool', 'status': 'SALES'},
  {'clientId': 'US-15103', 'name': 'Barrios Residence', 'status': 'SALES'},
  {'clientId': 'US-15104', 'name': 'Serrano Residence', 'status': 'SALES'},
  {'clientId': 'US-15105', 'name': 'Borges Residence', 'status': 'SALES'},
  {'clientId': 'US-15106', 'name': 'Bustamante Residence', 'status': 'SALES'},
  {'clientId': 'US-15107', 'name': 'Marlins Stadium', 'status': 'SALES'},
  {'clientId': 'US-15108', 'name': 'Rosemary Village', 'status': 'SALES'},
  {'clientId': 'US-15109', 'name': 'Cortes Residence', 'status': 'SALES'},
  {'clientId': 'US-15110', 'name': 'Precision Concepts', 'status': 'SALES'},
  {'clientId': 'US-15111', 'name': 'Navarro Residence', 'status': 'SALES'},
  {'clientId': 'US-15112', 'name': 'Barrios Residence 2', 'status': 'SALES'},
  {'clientId': 'US-15113', 'name': 'botanico houses', 'status': 'SALES'},
  {'clientId': 'US-15133', 'name': 'Familia Romero', 'status': 'SALES'},
  {'clientId': 'US-15134', 'name': 'Fuente Mayor', 'status': 'SALES'},
  {'clientId': 'US-15135', 'name': 'Ztancione', 'status': 'SALES'},
  {'clientId': 'US-15136', 'name': 'Ramos Residence', 'status': 'SALES'},
  {'clientId': 'US-15137', 'name': 'Garcia Residence', 'status': 'SALES'},
  {'clientId': 'US-15138', 'name': 'Dosantos Residence', 'status': 'SALES'},
  {'clientId': 'US-15139', 'name': 'Casa Verde', 'status': 'SALES'},
  {'clientId': 'US-15140', 'name': 'Playa Palmera', 'status': 'SALES'},
  {'clientId': 'US-15141', 'name': 'Hernandez Residence 2', 'status': 'SALES'},
  {'clientId': 'US-15142', 'name': 'Sample Raul Primo', 'status': 'SALES'},
  {'clientId': 'US-15143', 'name': 'Durante Equipment', 'status': 'SALES'},
  {'clientId': 'US-15144', 'name': 'Allapattah Place', 'status': 'SALES'},
  {'clientId': 'US-15145', 'name': 'Mesa Residence', 'status': 'SALES'},
  {'clientId': 'US-15146', 'name': 'Guerrero Residence', 'status': 'SALES'},
  {'clientId': 'US-15147', 'name': 'Carolina Gonzalez', 'status': 'SALES'},
  {'clientId': 'US-15148', 'name': 'Zozaya Pergola', 'status': 'SALES'},
  {'clientId': 'US-15149', 'name': 'Pergola', 'status': 'SALES'},
  {'clientId': 'US-15150', 'name': 'Paoli Residence', 'status': 'SALES'},
  {'clientId': 'US-15151', 'name': 'Mc Donalds', 'status': 'SALES'},
  {'clientId': 'US-15152', 'name': 'Dirty Rabbit', 'status': 'SALES'},
  {'clientId': 'US-15153', 'name': 'Vegazones', 'status': 'SALES'},
  {'clientId': 'US-15154', 'name': 'Sample Proposal', 'status': 'SALES'},
  {'clientId': 'US-15155', 'name': 'Romero Residence', 'status': 'SALES'},
  {'clientId': 'US-15156', 'name': 'Alfa Gamma', 'status': 'SALES'},
  {'clientId': 'US-15157', 'name': 'Rodrigo Gonzalez', 'status': 'SALES'},
  {'clientId': 'US-15158', 'name': 'Jimmy Levy', 'status': 'SALES'},
  {'clientId': 'US-15159', 'name': 'Vicky Chauhan', 'status': 'SALES'},
  {'clientId': 'US-15160', 'name': 'Prewitt Glade', 'status': 'SALES'},
  {'clientId': 'US-15161', 'name': 'Prewitt Ellis', 'status': 'SALES'},
  {'clientId': 'US-15162', 'name': 'Rayon Village', 'status': 'SALES'},
  {'clientId': 'US-15163', 'name': 'Prewitt Village', 'status': 'SALES'},
  {'clientId': 'US-15164', 'name': 'Doral Isles', 'status': 'SALES'},
  {'clientId': 'US-15165', 'name': 'Farrys', 'status': 'SALES'},
  {'clientId': 'US-15166', 'name': 'QM Drain', 'status': 'SALES'},
  {'clientId': 'US-15167', 'name': 'QM HOUSE Bernoti Residence', 'status': 'SALES'},
  {'clientId': 'US-15171', 'name': 'Ricardo Stivalett', 'status': 'PERMIT'},
  {'clientId': 'US-15172', 'name': 'Tradepak', 'status': 'SALES'},
  {'clientId': 'US-15173', 'name': 'Taraboulos', 'status': 'SALES'},
  {'clientId': 'US-15174', 'name': 'Hernandez Residence 3', 'status': 'SALES'},
  {'clientId': 'US-15175', 'name': 'Pablo Herrera', 'status': 'O&M'},
  {'clientId': 'US-15176', 'name': 'Pablo Herrera 2', 'status': 'O&M'},
  {'clientId': 'US-15177', 'name': 'Isles of Weston', 'status': 'SALES'},
  {'clientId': 'US-15178', 'name': 'Atlantic', 'status': 'SALES'},
  {'clientId': 'US-15179', 'name': 'Yllesca', 'status': 'SALES'},
  {'clientId': 'US-15180', 'name': 'Urban Padel', 'status': 'SALES'},
  {'clientId': 'US-15181', 'name': 'Ellen Lima Residence', 'status': 'SALES'},
  {'clientId': 'US-15182', 'name': 'INFINITY HERBS', 'status': 'SALES'},
  {'clientId': 'US-15183', 'name': 'Sharma Residence', 'status': 'SALES'},
  {'clientId': 'US-15184', 'name': 'Ikea Proposal', 'status': 'SALES'},
  {'clientId': 'US-15185', 'name': 'OC Fire Station', 'status': 'SALES'},
  {'clientId': 'US-15186', 'name': 'Ricardo Korda', 'status': 'SALES'},
  {'clientId': 'US-15187', 'name': 'IMECA', 'status': 'SALES'},
  {'clientId': 'US-15188', 'name': 'Rivera Residence', 'status': 'SALES'},
  {'clientId': 'US-15189', 'name': 'Service (ants)', 'status': 'O&M'},
  {'clientId': 'US-15190', 'name': 'Paredes Manuel', 'status': 'O&M'},
  {'clientId': 'US-15191', 'name': 'Mayela Rojas Residence', 'status': 'O&M'},
  {'clientId': 'US-15192', 'name': 'West Palm Beach Public Park', 'status': 'SALES'},
  {'clientId': 'US-15193', 'name': 'David Gonzalez', 'status': 'O&M'},
  {'clientId': 'US-15194', 'name': 'Lucas Varela-Cid', 'status': 'O&M'},
  {'clientId': 'US-15195', 'name': 'Stacy Ann Rambally', 'status': 'O&M'},
  {'clientId': 'US-15196', 'name': 'Sean Paquet', 'status': 'O&M'},
  {'clientId': 'US-15197', 'name': 'Island Hammock Pet Hospital', 'status': 'O&M'},
  {'clientId': 'US-15198', 'name': 'Juan Recio', 'status': 'O&M'},
  {'clientId': 'US-15199', 'name': 'Roja Residence', 'status': 'SALES'},
  {'clientId': 'US-15200', 'name': 'Carla Harris', 'status': 'O&M'},
  {'clientId': 'US-15201', 'name': 'Lino 26 Panel 7.8kW', 'status': 'O&M'},
  {'clientId': 'US-15202', 'name': 'Novar, John', 'status': 'O&M'},
  {'clientId': 'US-15203', 'name': 'Susan Guest', 'status': 'SALES'},
  {'clientId': 'US-15204', 'name': 'Juan Alassia', 'status': 'O&M'},
  {'clientId': 'US-15205', 'name': 'Casa Padel', 'status': 'O&M'},
  {'clientId': 'US-15206', 'name': 'Daniel Rey', 'status': 'O&M'},
  {'clientId': 'US-15207', 'name': 'Marco Oliveira', 'status': 'O&M'},
  {'clientId': 'US-15208', 'name': 'Azad Amin', 'status': 'O&M'},
  {'clientId': 'US-15209', 'name': 'Jean Phillidor', 'status': 'O&M'},
  {'clientId': 'US-15210', 'name': 'Ramon Gutierrez', 'status': 'O&M'},
  {'clientId': 'US-15211', 'name': 'Brian Mori', 'status': 'O&M'},
  {'clientId': 'US-15212', 'name': 'Ramiro Garcia', 'status': 'O&M'},
  {'clientId': 'US-15213', 'name': 'Fred Walumba', 'status': 'O&M'},
  {'clientId': 'US-15214', 'name': 'Juan Alassia 2', 'status': 'O&M'},
  {'clientId': 'US-15215', 'name': 'Jeeyoung Kim', 'status': 'O&M'},
  {'clientId': 'US-15216', 'name': 'Yadiel Huet', 'status': 'O&M'},
  {'clientId': 'US-15217', 'name': 'Donald Said', 'status': 'O&M'},
  {'clientId': 'US-15218', 'name': 'Darryl Leversuch', 'status': 'O&M'},
  {'clientId': 'US-15219', 'name': 'Jessica Valenzuela', 'status': 'O&M'},
  {'clientId': 'US-15220', 'name': 'Francis Garcia', 'status': 'O&M'},
  {'clientId': 'US-15221', 'name': 'Sondra Schubiner', 'status': 'O&M'},
  {'clientId': 'US-15222', 'name': 'Francisco Maldonado', 'status': 'O&M'},
  {'clientId': 'US-15223', 'name': 'Thomas Mcleod', 'status': 'O&M'},
  {'clientId': 'US-15224', 'name': 'Elvis Sosa', 'status': 'O&M'},
  {'clientId': 'US-15225', 'name': 'Lázaro Perona', 'status': 'O&M'},
  {'clientId': 'US-15226', 'name': 'Regla Glau', 'status': 'O&M'},
  {'clientId': 'US-15227', 'name': 'Joshua McGehee', 'status': 'O&M'},
  {'clientId': 'US-15228', 'name': 'William Rolack', 'status': 'O&M'},
  {'clientId': 'US-15229', 'name': 'Gary McMillan', 'status': 'O&M'},
  {'clientId': 'US-15230', 'name': 'Dorine Wollangk', 'status': 'O&M'},
  {'clientId': 'US-15231', 'name': 'Robert Millares', 'status': 'O&M'},
  # ── Conexsol Enhanced Services RMA cases (3.9.26) ──
  {'clientId': 'US-15530', 'name': 'Vincent Lewis', 'status': 'O&M'},
  {'clientId': 'US-15531', 'name': 'Margarita Maldonado', 'status': 'O&M'},
  {'clientId': 'US-15532', 'name': 'Brilliant Harvest LLC', 'status': 'O&M'},
]

# ─── 3. HELPERS ─────────────────────────────────────────────────────────────
def parse_address(addr):
    """Try to extract city, state, zip from a free-form address string."""
    if not addr or addr.strip() in ('', '-'):
        return {'address': '', 'city': '', 'state': '', 'zip': ''}
    addr = addr.strip()
    # Pattern: ..., City, ST ZZZZZ  or  City, ST ZZZZZ
    m = re.search(r',\s*([^,]+),\s*([A-Z]{2})[,\s]+(\d{5})', addr)
    if m:
        return {'address': addr, 'city': m.group(1).strip(), 'state': m.group(2), 'zip': m.group(3)}
    m = re.search(r'\b([A-Z]{2})\s+(\d{5})\b', addr)
    if m:
        return {'address': addr, 'city': '', 'state': m.group(1), 'zip': m.group(2)}
    m = re.search(r',\s*([A-Z]{2})\b', addr)
    if m:
        return {'address': addr, 'city': '', 'state': m.group(1), 'zip': ''}
    # SolarEdge format: "Street Number, City, ST, ZIP"
    parts = [p.strip() for p in addr.split(',')]
    if len(parts) >= 3:
        return {'address': addr, 'city': parts[-3] if len(parts) >= 3 else '',
                'state': parts[-2][:2] if len(parts) >= 2 else '',
                'zip': parts[-1].strip()[:5] if parts[-1].strip()[:5].isdigit() else ''}
    return {'address': addr, 'city': '', 'state': 'FL', 'zip': ''}

def map_case_status(s):
    s = (s or '').strip().lower()
    mapping = {
        'resolved': 'WO Completed',
        'in progress': 'In Progress',
        'in progress.': 'In Progress',
        'on hold': 'Standby',
        'system down': 'Contact Client',
        'closed - no opportunity': 'Standby',
    }
    return mapping.get(s, 'O&M')

def map_trello_status(s):
    mapping = {'SALES': 'In Progress', 'O&M': 'O&M', 'PERMIT': 'Quote Sent', '': 'Contacted'}
    return mapping.get(s, 'Contacted')

def normalize_client_id(cid):
    if not cid:
        return ''
    return cid.strip().upper().replace('US-', 'US-')

# ─── 4. LOAD SOLAREDGE CSV ───────────────────────────────────────────────────
se_sites = []  # list of dicts
se_by_client = defaultdict(list)  # clientId → [sites]
se_by_siteid = {}  # siteId → site

with open('/Users/cex/SolarOps÷/fl_sites.csv') as f:
    for row in csv.DictReader(f):
        site = {
            'siteId': row['SolarEdge Site ID'].strip(),
            'clientId': normalize_client_id(row['Conexsol Client ID']),
            'siteName': row['Site Name'].strip(),
            'address': row['Address'].strip(),
            'status': row['Status'].strip(),
            'peakPower': float(row['Peak Power (kW)'] or 0),
            'installDate': row['Install Date'].strip(),
            'ptoDate': row['PTO Date'].strip(),
            'alerts': int(row['Alerts'] or 0),
            'highestImpact': row['Highest Impact'].strip(),
            'systemType': row['System Type'].strip(),
            'module': row['Module'].strip(),
            'todayKwh': float(row['Today (kWh)'] or 0),
            'monthKwh': float(row['Month (kWh)'] or 0),
            'yearKwh': float(row['Year (kWh)'] or 0),
            'lifetimeKwh': float(row['Lifetime (kWh)'] or 0),
            'lastUpdate': row['Last Update'].strip(),
        }
        # Some sites have clientId embedded in siteName (e.g. siteName='US-15015', clientId='')
        if not site['clientId']:
            m = re.match(r'^(US-\d+)\s*$', site['siteName'], re.IGNORECASE)
            if m:
                site['clientId'] = m.group(1).upper()
                site['siteName'] = site['clientId']  # will be overwritten from importedClients
        se_sites.append(site)
        se_by_siteid[site['siteId']] = site
        if site['clientId']:
            se_by_client[site['clientId']].append(site)

# ─── 5. LOAD GOOGLE SHEET ────────────────────────────────────────────────────
gs_rows = []
gs_by_client = {}

reader = csv.DictReader(StringIO(GOOGLE_SHEET_CSV))
for row in reader:
    proj = normalize_client_id(row.get('project number', ''))
    entry = {
        'name': (row.get('Client') or '').strip(),
        'address': (row.get('address') or '').strip(),
        'phone': (row.get('Phone') or '').strip(),
        'email': (row.get('Email') or '').strip(),
        'issue': (row.get('issue') or '').strip(),
        'clientId': proj,
        'caseStatus': (row.get('case status') or '').strip(),
        'rmaNumber': (row.get('Case Number SolarEdge RMA') or '').strip(),
        'notes': (row.get('Notes') or '').strip(),
    }
    gs_rows.append(entry)
    if proj and proj not in gs_by_client:
        gs_by_client[proj] = entry

# ─── 6. BUILD MASTER CUSTOMER MAP ───────────────────────────────────────────
# Start with importedClients as the base registry
customers = {}  # clientId → customer dict

for ic in IMPORTED_CLIENTS:
    cid = ic['clientId']
    customers[cid] = {
        'clientId': cid,
        'name': ic['name'],
        'email': '',
        'phone': '',
        'address': '',
        'city': '',
        'state': 'FL',
        'zip': '',
        'type': 'residential',
        'clientStatus': map_trello_status(ic['status']),
        'solarEdgeSiteId': '',
        'systemType': '',
        'notes': '',
        'installDate': '',
        'peakPower': 0,
        'isPowerCare': ic['status'] == 'O&M',
        'flagged': False,
    }

# ─── 7. ENRICH FROM GOOGLE SHEET ────────────────────────────────────────────
for cid, gs in gs_by_client.items():
    if cid not in customers:
        # New client only in Google Sheet
        customers[cid] = {
            'clientId': cid,
            'name': gs['name'],
            'email': gs['email'],
            'phone': gs['phone'],
            'address': gs['address'],
            'city': '', 'state': 'FL', 'zip': '',
            'type': 'residential',
            'clientStatus': map_case_status(gs['caseStatus']),
            'solarEdgeSiteId': '',
            'systemType': '',
            'notes': gs['notes'],
            'installDate': '',
            'peakPower': 0,
            'isPowerCare': False,
            'flagged': False,
        }
    else:
        c = customers[cid]
        if gs['phone']: c['phone'] = gs['phone']
        if gs['email']: c['email'] = gs['email']
        if gs['address'] and len(gs['address']) > len(c['address']):
            c['address'] = gs['address']
        if gs['caseStatus']:
            c['clientStatus'] = map_case_status(gs['caseStatus'])
        # Append notes
        parts = []
        if gs['notes']: parts.append(gs['notes'])
        if gs['issue']: parts.append(f"Issue: {gs['issue']}")
        if gs['rmaNumber'] and gs['rmaNumber'].upper() not in ('NONE', ''):
            parts.append(f"RMA: {gs['rmaNumber']}")
        if parts:
            existing = c.get('notes', '')
            c['notes'] = (existing + '\n' + ' | '.join(parts)).strip()
        if gs['name'] and len(gs['name']) < 40:  # prefer shorter real names
            c['name'] = gs['name']

# ─── 8. ENRICH FROM SOLAREDGE CSV ───────────────────────────────────────────
# Handle duplicates first
DUPLICATE_CLIENTS = {cid for cid, sites in se_by_client.items() if len(sites) > 1}

for cid, sites in se_by_client.items():
    if cid in DUPLICATE_CLIENTS:
        # Flag both as US-15XXXXX
        for i, site in enumerate(sites, 1):
            flagged_id = cid + 'XX'
            if flagged_id not in customers:
                base = customers.get(cid, {})
                customers[flagged_id] = {
                    'clientId': flagged_id,
                    'name': site['siteName'],
                    'email': base.get('email', ''),
                    'phone': base.get('phone', ''),
                    'address': site['address'],
                    'city': '', 'state': 'FL', 'zip': '',
                    'type': 'residential',
                    'clientStatus': 'Standby',
                    'solarEdgeSiteId': site['siteId'],
                    'systemType': 'SolarEdge',
                    'notes': f'⚠️ DUPLICATE CLIENT ID — needs review. Original ID: {cid}. SolarEdge site: {site["siteId"]}. Sites: {", ".join(s["siteName"] for s in sites)}',
                    'installDate': site['installDate'],
                    'peakPower': site['peakPower'],
                    'isPowerCare': site['status'] == 'Active',
                    'flagged': True,
                }
                break  # Only one flagged record per duplicate group
        # Still keep original cid record, attach first site
        site = sites[0]
        if cid in customers:
            c = customers[cid]
            c['solarEdgeSiteId'] = site['siteId']
            c['systemType'] = 'SolarEdge'
            c['address'] = site['address']  # overwrite per spec
            c['installDate'] = site['installDate']
            c['peakPower'] = site['peakPower']
            c['isPowerCare'] = site['status'] == 'Active'
    else:
        site = sites[0]
        if cid in customers:
            c = customers[cid]
            c['solarEdgeSiteId'] = site['siteId']
            c['systemType'] = 'SolarEdge'
            c['address'] = site['address']  # overwrite per spec
            c['installDate'] = site['installDate']
            c['peakPower'] = site['peakPower']
            c['isPowerCare'] = site['status'] == 'Active'
        else:
            # Site has clientId not in importedClients — add it
            customers[cid] = {
                'clientId': cid,
                'name': site['siteName'],
                'email': '',
                'phone': '',
                'address': site['address'],
                'city': '', 'state': 'FL', 'zip': '',
                'type': 'residential',
                'clientStatus': 'O&M' if site['status'] == 'Active' else 'Standby',
                'solarEdgeSiteId': site['siteId'],
                'systemType': 'SolarEdge',
                'notes': '',
                'installDate': site['installDate'],
                'peakPower': site['peakPower'],
                'isPowerCare': site['status'] == 'Active',
                'flagged': False,
            }

# ─── 9. HANDLE SITES WITH NO CLIENT ID ──────────────────────────────────────
# Find existing max clientId number to assign new ones after
existing_nums = []
for cid in customers:
    m = re.match(r'US-(\d+)', cid)
    if m:
        existing_nums.append(int(m.group(1)))
next_num = max(existing_nums) + 1 if existing_nums else 15300

no_id_counter = 1
for site in se_sites:
    if not site['clientId']:
        new_id = f'US-{next_num}.{no_id_counter}'
        no_id_counter += 1
        customers[new_id] = {
            'clientId': new_id,
            'name': site['siteName'],
            'email': '',
            'phone': '',
            'address': site['address'],
            'city': '', 'state': 'FL', 'zip': '',
            'type': 'commercial' if any(w in site['siteName'].lower() for w in ['fire', 'hospital', 'commercial', 'corp', 'llc', 'park']) else 'residential',
            'clientStatus': 'O&M' if site['status'] == 'Active' else 'Standby',
            'solarEdgeSiteId': site['siteId'],
            'systemType': 'SolarEdge',
            'notes': f'Auto-assigned ID — original SolarEdge site had no Conexsol Client ID.',
            'installDate': site['installDate'],
            'peakPower': site['peakPower'],
            'isPowerCare': site['status'] == 'Active',
            'flagged': False,
        }

# ─── 10. ADD GOOGLE SHEET ENTRIES WITH NO CLIENT ID ─────────────────────────
gs_no_id_counter = 1
for gs in gs_rows:
    if not gs['clientId'] and gs['name'] and gs['name'].strip():
        new_id = f'US-{next_num}.{no_id_counter}'
        no_id_counter += 1
        parsed = parse_address(gs['address'])
        customers[new_id] = {
            'clientId': new_id,
            'name': gs['name'],
            'email': gs['email'],
            'phone': gs['phone'],
            'address': gs['address'],
            'city': parsed['city'],
            'state': parsed['state'] or 'FL',
            'zip': parsed['zip'],
            'type': 'residential',
            'clientStatus': map_case_status(gs['caseStatus']) if gs['caseStatus'] else 'Contacted',
            'solarEdgeSiteId': '',
            'systemType': '',
            'notes': (gs['notes'] + (' | Issue: ' + gs['issue'] if gs['issue'] else '')).strip(' |'),
            'installDate': '',
            'peakPower': 0,
            'isPowerCare': False,
            'flagged': False,
        }

# ─── 11. PARSE ADDRESSES FOR ALL CUSTOMERS ──────────────────────────────────
for c in customers.values():
    if c['address'] and not c['city']:
        parsed = parse_address(c['address'])
        c['city'] = parsed['city']
        if parsed['state']: c['state'] = parsed['state']
        if parsed['zip']: c['zip'] = parsed['zip']

# ─── 12. DETECT COMMERCIAL vs RESIDENTIAL ───────────────────────────────────
COMMERCIAL_KEYWORDS = ['fire station', 'fire dept', 'hospital', 'pet hospital',
                       'park', 'school', 'highschool', 'stadium', 'retail',
                       'commercial', 'corporation', 'corp', 'llc', 'inc',
                       'center', 'hotel', 'restaurant', 'cafe', 'padel',
                       'parque solar', 'telefo', 'rbi bk', 'mcdonald',
                       'ikea', 'volvo', 'corpotool', 'bodega', 'village',
                       'place', 'isles', 'infinity herbs', 'atlantic']
for c in customers.values():
    name_lower = c['name'].lower()
    if any(kw in name_lower for kw in COMMERCIAL_KEYWORDS):
        c['type'] = 'commercial'

# ─── 13. GENERATE OUTPUT STATS ───────────────────────────────────────────────
total = len(customers)
with_site = sum(1 for c in customers.values() if c['solarEdgeSiteId'])
with_email = sum(1 for c in customers.values() if c['email'])
with_phone = sum(1 for c in customers.values() if c['phone'])
flagged = sum(1 for c in customers.values() if c['flagged'])
print(f"Total customers: {total}", file=sys.stderr)
print(f"  With SolarEdge site: {with_site}", file=sys.stderr)
print(f"  With email: {with_email}", file=sys.stderr)
print(f"  With phone: {with_phone}", file=sys.stderr)
print(f"  Flagged duplicates: {flagged}", file=sys.stderr)

# ─── 14. OUTPUT JSON ─────────────────────────────────────────────────────────
output = sorted(customers.values(), key=lambda c: c['clientId'])
print(json.dumps(output, indent=2, ensure_ascii=False))
