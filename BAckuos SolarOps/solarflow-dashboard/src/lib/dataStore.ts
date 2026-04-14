// SolarFlow MVP - Data Store with LocalStorage
import { AppState, Customer, Job, User, XeroConfig, ClientStatus } from '../types';

const STORAGE_KEY = 'solarflow_data';

// SolarEdge Florida sites - imported directly from SolarEdge API
// Account: Conexsol Solar (Account ID: 64793)
const solarEdgeFloridaSites = [
  { siteId: '2492815', clientId: 'US-15015', name: 'Daniel Matos Residence', address: 'Boca Raton', city: 'Boca Raton', state: 'FL', zip: '', power: 16.0, status: 'PendingCommunication', installationDate: '2024-01-15', manufacturer: 'Canadian Solar', model: 'CS1U-400MS HiDM' },
  { siteId: '1893574', clientId: 'US-15017', name: 'Parque Solar Doral', address: 'Northwest 78th Avenue, Doral', city: 'Doral', state: 'FL', zip: '35003', power: 676.4, status: 'PendingCommunication', installationDate: '2020-11-03', manufacturer: 'Canadian Solar', model: 'CS1U-400MS HiDM' },
  { siteId: '3151049', clientId: 'US-15036', name: 'Bobby Acon', address: 'Doral', city: 'Doral', state: 'FL', zip: '', power: 13.2, status: 'Active', installationDate: '2023-06-20', manufacturer: 'APTOS SOLAR', model: 'DNA-144-MF26-440W' },
  { siteId: '3821377', clientId: 'US-15057', name: 'Fonte Residence', address: 'Miami', city: 'Miami', state: 'FL', zip: '', power: 36.72, status: 'Active', installationDate: '2023-08-15', manufacturer: 'Solar4America', model: 'S4A410-72MH5' },
  { siteId: '4040407', clientId: 'US-15068', name: 'Pelaez Residence', address: 'Fort Lauderdale', city: 'Fort Lauderdale', state: 'FL', zip: '', power: 16.4, status: 'Active', installationDate: '2023-09-10', manufacturer: 'Solar4America', model: 'S4A410-72MH5' },
  { siteId: '3874712', clientId: 'US-15086', name: 'Korda Residence', address: 'Miami Beach', city: 'Miami Beach', state: 'FL', zip: '', power: 8.2, status: 'Active', installationDate: '2023-07-22', manufacturer: 'Solar4America', model: 'S4A410-72MH5' },
  { siteId: '3778884', clientId: 'US-15101', name: 'Ciampi Residence', address: 'Weston', city: 'Weston', state: 'FL', zip: '', power: 16.4, status: 'Active', installationDate: '2023-10-05', manufacturer: 'Solar4America', model: 'S4A410-108MH10' },
  { siteId: '1094489', clientId: 'US-15175', name: 'Pablo Herrera', address: 'Miami', city: 'Miami', state: 'FL', zip: '', power: 18.88, status: 'Active', installationDate: '2022-03-12', manufacturer: 'S-Energy', model: 'SN300M-10' },
  { siteId: '2265412', clientId: 'US-15190', name: 'Paredes Manuel', address: 'Miami', city: 'Miami', state: 'FL', zip: '', power: 10.725, status: 'Active', installationDate: '2022-05-18', manufacturer: 'Mission Solar', model: 'MSE320' },
  { siteId: '912113', clientId: 'US-15193', name: 'David Gonzalez', address: 'Royal Palm Beach', city: 'Royal Palm Beach', state: 'FL', zip: '', power: 8.85, status: 'Active', installationDate: '2021-11-30', manufacturer: 'SolarWorld', model: '285 mono' },
  { siteId: '3012235', clientId: 'US-15194', name: 'Lucas Varela-Cid', address: 'Miami', city: 'Miami', state: 'FL', zip: '', power: 15.2, status: 'Active', installationDate: '2022-08-22', manufacturer: 'Silfab', model: '380' },
  { siteId: '2911143', clientId: 'US-15196', name: 'Sean Paquet', address: 'Miami', city: 'Miami', state: 'FL', zip: '', power: 14.24, status: 'Active', installationDate: '2022-09-14', manufacturer: 'Silfab', model: '370' },
  { siteId: '198866', clientId: 'US-15197', name: 'Island Hammock Pet Hospital', address: '98175 Overseas Highway, Key Largo', city: 'Key Largo', state: 'FL', zip: '33037', power: 29.28, status: 'Active', installationDate: '2015-12-14', manufacturer: 'LG', model: 'LG 305' },
  { siteId: '3514539', clientId: 'US-15198', name: 'Juan Recio', address: 'Parkland', city: 'Parkland', state: 'FL', zip: '', power: 13.68, status: 'Active', installationDate: '2023-01-25', manufacturer: 'Silfab', model: '380' },
  { siteId: '3334347', clientId: 'US-15200', name: 'Clarance Harris', address: 'Miami', city: 'Miami', state: 'FL', zip: '', power: 15.975, status: 'Active', installationDate: '2023-02-08', manufacturer: 'LG', model: '355' },
  { siteId: '4429124', clientId: 'US-15204', name: 'Juan Alassia', address: 'Miami', city: 'Miami', state: 'FL', zip: '', power: 0.001, status: 'Active', installationDate: '2024-03-20', manufacturer: '-', model: '-' },
  { siteId: '1466122', clientId: 'US-15206', name: 'Daniel Rey', address: 'Sunrise', city: 'Sunrise', state: 'FL', zip: '', power: 6.71, status: 'Active', installationDate: '2021-07-15', manufacturer: 'Mission Solar', model: 'MSE310SQ8T' },
  { siteId: '1080967', clientId: 'US-15207', name: 'Marco Oliveira', address: 'Southwest 133rd Terrace, 6700, Miami', city: 'Miami', state: 'FL', zip: '33156', power: 100.0, status: 'Active', installationDate: '2019-04-19', manufacturer: 'Canadian Solar', model: '330W' },
  { siteId: '533422', clientId: 'US-15208', name: 'Azad Amin', address: 'Fort Lauderdale', city: 'Fort Lauderdale', state: 'FL', zip: '', power: 7.8, status: 'Active', installationDate: '2018-06-12', manufacturer: 'LG Solar', model: 'LG 300N1C-A3' },
  { siteId: '2907284', clientId: 'US-15210', name: 'Ramon Gutierrez', address: 'Miami', city: 'Miami', state: 'FL', zip: '', power: 6.48, status: 'Active', installationDate: '2022-04-05', manufacturer: 'LG Solar', model: '370' },
  { siteId: '3624814', clientId: 'US-15211', name: 'Brian Mori', address: 'Miami Springs', city: 'Miami Springs', state: 'FL', zip: '', power: 14.44, status: 'Active', installationDate: '2023-05-18', manufacturer: 'Silfab Solar', model: '380-bk' },
  { siteId: '2979061', clientId: 'US-15213', name: 'Walumbwa, Ochieng', address: 'Palmetto Bay', city: 'Palmetto Bay', state: 'FL', zip: '', power: 19.88, status: 'Active', installationDate: '2023-06-22', manufacturer: 'LG', model: '355' },
  { siteId: '291002', clientId: 'US-15214', name: 'Alexey Alonso', address: 'Pembroke Pines', city: 'Pembroke Pines', state: 'FL', zip: '', power: 6.555, status: 'Active', installationDate: '2020-12-08', manufacturer: 'Suniva', model: 'OPT285' },
  { siteId: '3602247', clientId: 'US-15215', name: 'Jeeyoung Kim', address: 'Hollywood', city: 'Hollywood', state: 'FL', zip: '', power: 9.48, status: 'Active', installationDate: '2023-07-30', manufacturer: 'Q Cells', model: '395' },
  { siteId: '880643', clientId: 'US-15216', name: 'Yadiel Huet', address: 'Miami', city: 'Miami', state: 'FL', zip: '', power: 11.7, status: 'Active', installationDate: '2021-03-18', manufacturer: 'Hanwha', model: 'Hanwha Q-Cells295' },
  { siteId: '4151683', clientId: 'US-15217', name: 'Donald Said', address: 'Coral Springs', city: 'Coral Springs', state: 'FL', zip: '', power: 15.58, status: 'Active', installationDate: '2024-01-10', manufacturer: 'Silfab', model: '410' },
  { siteId: '3927343', clientId: 'US-15218', name: 'Darryl Leversuch', address: 'Coral Springs', city: 'Coral Springs', state: 'FL', zip: '', power: 8.8, status: 'Active', installationDate: '2024-02-15', manufacturer: 'Hyperion', model: '400' },
  { siteId: '1586005', clientId: 'US-15219', name: 'Jessica Valenzuela', address: 'Boca Raton', city: 'Boca Raton', state: 'FL', zip: '', power: 8.0, status: 'Active', installationDate: '2021-08-22', manufacturer: 'Jinko Solar', model: '400' },
  { siteId: '1202725', clientId: 'US-15222', name: 'Francisco Maldonado', address: 'Lake Wales', city: 'Lake Wales', state: 'FL', zip: '', power: 3.9, status: 'Active', installationDate: '2020-05-14', manufacturer: 'Q-Cell', model: '300w' },
  { siteId: '3092553', clientId: 'US-15223', name: 'Thomas Mcleod', address: 'Miami', city: 'Miami', state: 'FL', zip: '', power: 8.4, status: 'Active', installationDate: '2022-10-28', manufacturer: 'Q Cells', model: '400' },
  { siteId: '3592758', clientId: 'US-15226', name: 'Regla Glau', address: 'Homestead', city: 'Homestead', state: 'FL', zip: '', power: 16.72, status: 'Active', installationDate: '2023-11-05', manufacturer: 'Silfab', model: '380' },
  { siteId: '767705', clientId: 'US-15227', name: 'Joshua McGehee', address: 'West Palm Beach', city: 'West Palm Beach', state: 'FL', zip: '', power: 11.6, status: 'Active', installationDate: '2021-12-15', manufacturer: 'S-Energy', model: 'SN290M-10' },
  { siteId: '913858', clientId: 'US-15228', name: 'William Rolack', address: 'Miramar', city: 'Miramar', state: 'FL', zip: '', power: 5.2, status: 'Active', installationDate: '2020-09-20', manufacturer: 'GCL', model: 'GCL-P6-330' },
  { siteId: '657747', clientId: 'US-15229', name: 'Gary McMillan', address: 'Miami', city: 'Miami', state: 'FL', zip: '', power: 8.26, status: 'Active', installationDate: '2019-08-08', manufacturer: 'solar world', model: '295' },
  { siteId: '1699709', clientId: 'US-15230', name: 'Dorine Wollangk', address: 'Pompano Beach', city: 'Pompano Beach', state: 'FL', zip: '', power: 7.6, status: 'Active', installationDate: '2021-06-25', manufacturer: 'Mission Solar', model: 'Mission-305' },
  { siteId: '1504435', clientId: 'US-15233', name: 'David Smitherman', address: 'Miami', city: 'Miami', state: 'FL', zip: '', power: 5.1, status: 'Active', installationDate: '2020-11-12', manufacturer: 'Silfab', model: 'SLG300M' },
  { siteId: '883536', clientId: 'US-15234', name: 'Robert Moch', address: 'Lauderhill', city: 'Lauderhill', state: 'FL', zip: '', power: 5.3, status: 'Active', installationDate: '2020-07-30', manufacturer: 'Hanwha Q-Cells', model: 'Q.Peak BLK-G4.1' },
  { siteId: '813738', clientId: 'US-15235', name: 'Freída Rosario', address: 'West Palm Beach', city: 'West Palm Beach', state: 'FL', zip: '', power: 11.8, status: 'Active', installationDate: '2021-02-18', manufacturer: 'Hanwha Q-Cells', model: 'Q.PEAK L-G4.1' },
  { siteId: '874172', clientId: 'US-15236', name: 'Tara Batz', address: 'Winter Garden', city: 'Winter Garden', state: 'FL', zip: '', power: 11.29, status: 'Active', installationDate: '2021-09-08', manufacturer: 'Heliene', model: '60M-305' },
  { siteId: '2677385', clientId: 'US-15238', name: 'Yamile Camejo', address: 'Miami', city: 'Miami', state: 'FL', zip: '', power: 12.0, status: 'Active', installationDate: '2022-12-10', manufacturer: 'Jinko Solar', model: 'jkm405m-72HL-V' },
  { siteId: '1255465', clientId: 'US-15240', name: 'Anthony Gandley', address: 'Orlando', city: 'Orlando', state: 'FL', zip: '', power: 7.2, status: 'Active', installationDate: '2020-10-22', manufacturer: 'Silfab', model: '300' },
  { siteId: '1144936', clientId: 'US-15242', name: 'Ernesto Catala', address: 'Beverly Hills', city: 'Beverly Hills', state: 'FL', zip: '', power: 5.5, status: 'Active', installationDate: '2020-04-15', manufacturer: 'SolarTech Universal', model: 'EPIQ-305' },
  { siteId: '3175522', clientId: 'US-15243', name: 'Yosvani Camargo', address: 'Miami', city: 'Miami', state: 'FL', zip: '', power: 20.25, status: 'Active', installationDate: '2024-01-28', manufacturer: 'Jinko Solar', model: 'jkm405m-72HL-V' },
  { siteId: '3606676', clientId: 'US-15244', name: 'Carolys Rivera', address: 'Winter Haven', city: 'Winter Haven', state: 'FL', zip: '', power: 9.6, status: 'Active', installationDate: '2023-12-05', manufacturer: 'Hyperion', model: '400' },
  { siteId: '1524195', clientId: 'US-15245', name: 'Cristiano Sanches-Rodrigues', address: 'Davie', city: 'Davie', state: 'FL', zip: '', power: 6.2, status: 'Active', installationDate: '2022-06-18', manufacturer: '1 Soltech', model: 'SE6000H' },
  { siteId: '514479', clientId: 'US-15246', name: 'John Pirroni', address: 'Fort Lauderdale', city: 'Fort Lauderdale', state: 'FL', zip: '', power: 17.875, status: 'Active', installationDate: '2018-03-22', manufacturer: 'Canadian Solar', model: '275' },
  { siteId: '1106221', clientId: 'US-15247', name: 'Anniel Romero', address: 'Opa-locka', city: 'Opa-locka', state: 'FL', zip: '', power: 20.59, status: 'Active', installationDate: '2021-10-30', manufacturer: 'Mission Solar', model: '365' },
  { siteId: '1217797', clientId: 'US-15248', name: 'Jeremy Fisher', address: 'Miramar', city: 'Miramar', state: 'FL', zip: '', power: 6.0, status: 'Active', installationDate: '2020-08-12', manufacturer: 'SolarTech Universal', model: '300W33.4' },
  { siteId: '4016590', clientId: 'US-15253', name: 'Jorge Bravo', address: 'Pembroke Pines', city: 'Pembroke Pines', state: 'FL', zip: '', power: 13.68, status: 'Active', installationDate: '2024-02-20', manufacturer: 'Silfab', model: '380' },
  { siteId: '2339903', clientId: 'US-15256', name: 'Kyle LaCroix', address: 'Palm Harbor', city: 'Palm Harbor', state: 'FL', zip: '', power: 7.695, status: 'Active', installationDate: '2022-01-14', manufacturer: 'Aptos', model: 'DNA-120-MF23-330W' },
  { siteId: '3334934', clientId: 'US-15259', name: 'Miguel Vargas', address: 'Winter Garden', city: 'Winter Garden', state: 'FL', zip: '', power: 16.4, status: 'Active', installationDate: '2023-10-12', manufacturer: 'Q Cells', model: '400' },
  { siteId: '1879754', clientId: 'US-15054', name: 'City of Tamarac Fire Station 36', address: 'Northwest 72nd Street, Tamarac', city: 'Tamarac', state: 'FL', zip: '74993', power: 40.0, status: 'Active', installationDate: '2020-08-05', manufacturer: 'Jinko Solar', model: 'jkm400m-72HL-V' },
  { siteId: '760512', clientId: 'US-15201', name: 'Lino 26 Panel 7.8kW', address: 'Orlando', city: 'Orlando', state: 'FL', zip: '', power: 7.8, status: 'Active', installationDate: '2021-05-20', manufacturer: 'SolarTech Universal', model: 'P-300' },
  { siteId: '1051701', clientId: 'US-15202', name: 'Novar, John TSP18070', address: 'Miami', city: 'Miami', state: 'FL', zip: '', power: 9.6, status: 'Active', installationDate: '2021-07-08', manufacturer: 'Silfab', model: 'SLG300M' },
  { siteId: '4508137', clientId: 'US-15203', name: 'Susan Guest 201', address: 'Lithonia, Georgia', city: 'Lithonia', state: 'GA', zip: '', power: 10.0, status: 'Active', installationDate: '2023-04-15', manufacturer: 'Q PEAK', model: 'Q.PEAK DUO XL' },
  { siteId: '2599219', clientId: 'US-15020', name: 'Cook, Daniel 208 Cooleyville Road', address: 'New Salem, Massachusetts', city: 'New Salem', state: 'MA', zip: '1401', power: 7.6, status: 'Active', installationDate: '2021-11-30', manufacturer: 'Hanwha Q-Cells', model: 'Q Peak Duo' },
  { siteId: '3210166', clientId: 'US-15021', name: 'Elizabeth Demeno', address: 'Plano, Texas', city: 'Plano', state: 'TX', zip: '34057', power: 21.6, status: 'Active', installationDate: '2022-10-22', manufacturer: 'Hanwha Q.Cells', model: 'Q. PEAK DUO BLK ML-G10+' },
  { siteId: '2922197', clientId: 'US-15022', name: 'Residence San Roman', address: 'Caracas, Venezuela', city: 'Caracas', state: 'VE', zip: '', power: 7.6, status: 'Active', installationDate: '2020-03-18', manufacturer: 'RENESOLA', model: 'Renesola320' },
  { siteId: '2805686', clientId: 'US-15023', name: 'Residencia PH las Mercedes', address: 'Caracas, Venezuela', city: 'Caracas', state: 'VE', zip: '', power: 7.6, status: 'Active', installationDate: '2019-11-22', manufacturer: 'Epcom', model: 'Epl33024' },
  { siteId: '1323033', clientId: 'US-15024', name: 'Residencia Ragazzi', address: 'Caracas, Venezuela', city: 'Caracas', state: 'VE', zip: '', power: 7.9, status: 'Active', installationDate: '2019-06-10', manufacturer: 'Amerisolar', model: 'AS-6P30270' },
  { siteId: '2916379', clientId: 'US-15025', name: 'Telefónica: RB Mariguitar', address: 'Mariguitar, Venezuela', city: 'Mariguitar', state: 'VE', zip: '', power: 5.6, status: 'Active', installationDate: '2020-08-25', manufacturer: 'Trina Solar', model: 'TSM 400W' },
];

// Client data imported from Google Sheets
const importedClients = [
  { clientId: 'US-15015', name: 'Daniel Matos Residence', description: '', status: 'SALES' },
  { clientId: 'US-15018', name: 'Ransome Evergades Highschool', description: '', status: 'SALES' },
  { clientId: 'US-15019', name: 'rbi BK', description: '', status: 'SALES' },
  { clientId: 'US-15020', name: 'Avanti', description: '', status: 'SALES' },
  { clientId: 'US-15021', name: 'One-Eleven South', description: '', status: 'SALES' },
  { clientId: 'US-15022', name: 'Royal Palace', description: '', status: '' },
  { clientId: 'US-15023', name: '', description: '', status: 'SALES' },
  { clientId: 'US-15024', name: 'CIGN', description: '', status: '' },
  { clientId: 'US-15027', name: 'Grupo ECO', description: '', status: 'SALES' },
  { clientId: 'US-15028', name: 'WOOD PLC PARTNERSHIP', description: '', status: 'SALES' },
  { clientId: 'US-15029', name: 'WarrenHenry Auto', description: '', status: 'SALES' },
  { clientId: 'US-15030', name: 'Dade Construction', description: '', status: 'SALES' },
  { clientId: 'US-15031', name: 'Yard8', description: '', status: 'SALES' },
  { clientId: 'US-15032', name: 'Matos Residential - Coral Gables', description: '', status: 'SALES' },
  { clientId: 'US-15033', name: 'Boat Solution', description: '', status: 'SALES' },
  { clientId: 'US-15034', name: 'Residence Garcia-Leoni', description: '', status: 'SALES' },
  { clientId: 'US-15035', name: 'Residential - Angelica Residence Coral Gables', description: '', status: 'SALES' },
  { clientId: 'US-15036', name: 'Bobby Acon', description: '', status: 'O&M' },
  { clientId: 'US-15037', name: 'CONSCIOUS CROPS', description: '', status: 'SALES' },
  { clientId: 'US-15038', name: 'North Triton', description: '', status: 'SALES' },
  { clientId: 'US-15039', name: 'Ocean Bank', description: '', status: 'SALES' },
  { clientId: 'US-15040', name: 'Reef Tech', description: '', status: 'SALES' },
  { clientId: 'US-15041', name: 'NSHF TAMPA', description: '', status: 'SALES' },
  { clientId: 'US-15042', name: 'NSHF Dallas', description: '', status: 'SALES' },
  { clientId: 'US-15043', name: 'NSHF Jacksonville', description: '', status: 'SALES' },
  { clientId: 'US-15044', name: 'Betty Matos Residence', description: '', status: 'SALES' },
  { clientId: 'US-15045', name: 'DKR MARINE', description: '', status: 'SALES' },
  { clientId: 'US-15046', name: 'Telefonica', description: '', status: 'SALES' },
  { clientId: 'US-15047', name: '17104 NE', description: '', status: 'SALES' },
  { clientId: 'US-15048', name: 'Goya', description: '', status: 'SALES' },
  { clientId: 'US-15049', name: 'VistaColor', description: '', status: 'SALES' },
  { clientId: 'US-15050', name: 'SEDANOS', description: '', status: 'SALES' },
  { clientId: 'US-15051', name: 'David Klar', description: '', status: 'SALES' },
  { clientId: 'US-15052', name: 'Daniel Quevedo', description: '', status: 'SALES' },
  { clientId: 'US-15053', name: 'Gaitan Residence', description: '', status: 'SALES' },
  { clientId: 'US-15054', name: 'Orlando Rosales', description: '', status: 'SALES' },
  { clientId: 'US-15055', name: 'Homestead Solar Farm', description: '', status: 'SALES' },
  { clientId: 'US-15056', name: 'West Condominum', description: '', status: 'SALES' },
  { clientId: 'US-15057', name: 'Fonte Residence', description: 'Todo en orden', status: 'O&M' },
  { clientId: 'US-15058', name: 'Jack Romano', description: 'Cantina. Waiting for his answer', status: 'SALES' },
  { clientId: 'US-15059', name: 'Carlos Fairbanks', description: 'Mexico Lead', status: 'SALES' },
  { clientId: 'US-15060', name: 'Johnny Acon', description: 'Cliente viejo. Contactar para revisar permiso', status: 'SALES' },
  { clientId: 'US-15061', name: 'Geraghty Residence', description: '', status: 'SALES' },
  { clientId: 'US-15062', name: 'Avanti Commerical Project', description: '', status: 'SALES' },
  { clientId: 'US-15063', name: 'Cardoza Acon', description: 'ON hold', status: 'SALES' },
  { clientId: 'US-15064', name: 'Sanimirovic Residence', description: 'primo de isaac lead de anthony', status: 'SALES' },
  { clientId: 'US-15065', name: 'Alvaro - 2485 sw 162nd terrace miramar 33027', description: 'ON hold', status: 'SALES' },
  { clientId: 'US-15066', name: 'Gelfman Residence', description: 'work in progress', status: 'SALES' },
  { clientId: 'US-15067', name: 'Homestead Container Park', description: 'hold', status: 'SALES' },
  { clientId: 'US-15068', name: 'Pelaez Residence', description: 'Instalación completada. Volver a contactar para expandir proyecto', status: 'O&M' },
  { clientId: 'US-15069', name: 'Lopez Residence', description: '', status: 'SALES' },
  { clientId: 'US-15070', name: 'Festival SuperMarket', description: 'Llamar a Ricardo', status: 'SALES' },
  { clientId: 'US-15071', name: 'Velez Residence', description: '', status: 'SALES' },
  { clientId: 'US-15072', name: 'Andres Andrade Residence', description: 'on hold', status: 'SALES' },
  { clientId: 'US-15073', name: 'True Grade LLC Food Storage', description: 'on hold', status: 'SALES' },
  { clientId: 'US-15074', name: 'Puerta de la Palma', description: 'archived', status: 'archived' },
  { clientId: 'US-15075', name: 'Lake Worth Residence', description: '', status: 'SALES' },
  { clientId: 'US-15076', name: 'Bonita Residence', description: 'on hold', status: 'SALES' },
  { clientId: 'US-15077', name: 'Diaz Residence', description: '', status: 'SALES' },
  { clientId: 'US-15078', name: 'Spaces Wynwood', description: 'on hold', status: 'SALES' },
  { clientId: 'US-15079', name: 'Rosa Residence', description: 'on hold', status: 'SALES' },
  { clientId: 'US-15080', name: 'Quality Inn', description: 'on hold', status: 'SALES' },
  { clientId: 'US-15081', name: 'Kattan Residence', description: 'on hold', status: 'SALES' },
  { clientId: 'US-15082', name: 'Toyota + Kia', description: 'Revisar con Boris y Anthony, entender donde estamos y proponer algo en el automotriz', status: 'SALES' },
  { clientId: 'US-15083', name: 'RGB Group Residence', description: 'on hold', status: 'SALES' },
  { clientId: 'US-15084', name: 'Sierra Appartments', description: 'on hold', status: 'SALES' },
  { clientId: 'US-15085', name: 'Pierini Residence', description: 'on hold', status: 'SALES' },
  { clientId: 'US-15086', name: 'Korda Residence', description: 'added 10 panels. all good', status: 'O&M' },
  { clientId: 'US-15087', name: 'Zelay aResidence', description: '', status: 'SALES' },
  { clientId: 'US-15088', name: 'Faria Residence', description: '', status: 'SALES' },
  { clientId: 'US-15089', name: 'Silva Residence', description: '', status: 'SALES' },
  { clientId: 'US-15090', name: 'Zamorano Residence', description: '', status: 'SALES' },
  { clientId: 'US-15091', name: 'Arango Residence', description: '', status: 'SALES' },
  { clientId: 'US-15092', name: 'Rio Chico Cold Storage', description: 'EDGAR va a organizar reunion con Avelino.', status: 'SALES' },
  { clientId: 'US-15093', name: 'Rotundo Residence', description: 'on hold', status: 'SALES' },
  { clientId: 'US-15094', name: 'SuperCarWash', description: '', status: 'SALES' },
  { clientId: 'US-15095', name: 'Hernandez Residence', description: '', status: 'SALES' },
  { clientId: 'US-15096', name: 'Alba Residence', description: '', status: 'SALES' },
  { clientId: 'US-15097', name: 'Hoffner Center Retail', description: '', status: 'SALES' },
  { clientId: 'US-15098', name: 'Sapicas Residence', description: 'on hold', status: 'SALES' },
  { clientId: 'US-15099', name: 'LMI Propertty', description: '', status: 'SALES' },
  { clientId: 'US-15100', name: 'Edificio YOHANA', description: '', status: 'SALES' },
  { clientId: 'US-15101', name: 'Ciampi Residence', description: 'all good.', status: 'O&M' },
  { clientId: 'US-15102', name: 'Corpotool', description: '', status: 'SALES' },
  { clientId: 'US-15103', name: 'Barrios Residence', description: '', status: 'SALES' },
  { clientId: 'US-15104', name: 'Serrano Residence', description: '', status: 'SALES' },
  { clientId: 'US-15105', name: 'Borges Residence', description: 'weston avelino', status: 'SALES' },
  { clientId: 'US-15106', name: 'Bustamante Residence', description: '', status: 'SALES' },
  { clientId: 'US-15107', name: 'Marlins Stadium', description: 'project proposal', status: 'SALES' },
  { clientId: 'US-15108', name: 'Rosemary Village', description: '', status: 'SALES' },
  { clientId: 'US-15109', name: 'Cortes Residence', description: '', status: 'SALES' },
  { clientId: 'US-15110', name: 'Precision Concepts', description: 'Uriel contactara a Cesar por email', status: 'SALES' },
  { clientId: 'US-15111', name: 'Navarro Residence', description: '', status: 'SALES' },
  { clientId: 'US-15112', name: 'Barrios Residence', description: '', status: 'SALES' },
  { clientId: 'US-15113', name: 'botanico houses', description: 'avelino', status: 'SALES' },
  // Additional clients from rows 118+
  { clientId: '', name: 'Ana Rodriguez', description: '', status: 'SALES' },
  { clientId: 'US-15133', name: 'Familia Romero', description: '', status: 'SALES' },
  { clientId: 'US-15134', name: 'Fuente Mayor', description: '', status: 'SALES' },
  { clientId: 'US-15135', name: 'Ztancione', description: '', status: 'SALES' },
  { clientId: 'US-15136', name: 'Ramos Residence', description: '', status: 'SALES' },
  { clientId: 'US-15137', name: 'Garcia Residence', description: '', status: 'SALES' },
  { clientId: 'US-15138', name: 'Dosantos Residence', description: '', status: 'SALES' },
  { clientId: 'US-15139', name: 'Casa Verde', description: 'quote created', status: 'SALES' },
  { clientId: 'US-15140', name: 'Playa Palmera', description: '', status: 'SALES' },
  { clientId: 'US-15141', name: 'Hernandez Residence', description: '', status: 'SALES' },
  { clientId: 'US-15142', name: 'Sample Raul Primo', description: '', status: 'SALES' },
  { clientId: 'US-15143', name: 'Durante Equipment', description: '', status: 'SALES' },
  { clientId: 'US-15144', name: 'Allapattah Place', description: '', status: 'SALES' },
  { clientId: 'US-15145', name: 'Mesa Residence', description: '', status: 'SALES' },
  { clientId: 'US-15146', name: 'Guerrero Residence', description: '', status: 'SALES' },
  { clientId: 'US-15147', name: 'Carolina Gonzalez', description: '', status: 'SALES' },
  { clientId: 'US-15148', name: 'Zozaya Pergola', description: '', status: 'SALES' },
  { clientId: 'US-15149', name: 'Pergola', description: 'on hold', status: 'SALES' },
  { clientId: 'US-15150', name: 'Paoli Residence', description: '', status: 'SALES' },
  { clientId: 'US-15151', name: 'Mc Donalds', description: '', status: 'SALES' },
  { clientId: 'US-15152', name: 'Dirty Rabbit', description: '', status: 'SALES' },
  { clientId: 'US-15153', name: 'Vegazones', description: '', status: 'SALES' },
  { clientId: 'US-15154', name: 'Sample Proposal', description: '', status: 'SALES' },
  { clientId: 'US-15155', name: 'Romero Residence', description: '', status: 'SALES' },
  { clientId: 'US-15156', name: 'Alfa Gamma', description: '', status: 'SALES' },
  { clientId: 'US-15157', name: 'Rodrigo Gonzalez', description: '', status: 'SALES' },
  { clientId: 'US-15158', name: 'Jimmy Levy', description: 'card marked as completed', status: 'SALES' },
  { clientId: 'US-15159', name: 'Vicky Chauhan', description: '', status: 'SALES' },
  { clientId: 'US-15160', name: 'Prewitt Glade', description: '', status: 'SALES' },
  { clientId: 'US-15161', name: 'Prewitt Ellis', description: '', status: 'SALES' },
  { clientId: 'US-15162', name: 'Rayon Village', description: '', status: 'SALES' },
  { clientId: 'US-15163', name: 'Prewitt Village', description: '', status: 'SALES' },
  { clientId: 'US-15164', name: 'Doral Isles', description: 'Llamar a Gaston', status: 'SALES' },
  { clientId: 'US-15165', name: 'Farrys', description: '', status: 'SALES' },
  { clientId: 'US-15166', name: 'QM Drain', description: '', status: 'SALES' },
  { clientId: 'US-15167', name: 'QM HOUSE Bernoti Residence', description: '', status: 'SALES' },
  { clientId: 'US-15171', name: 'Ricardo Stivalett', description: '1 payment is still pending', status: 'PERMIT' },
  { clientId: 'US-15172', name: 'Tradepak', description: 'in progress', status: 'SALES' },
  { clientId: 'US-15173', name: 'Taraboulos', description: '', status: 'SALES' },
  { clientId: 'US-15174', name: 'Hernandez Residence', description: '', status: 'SALES' },
  { clientId: 'US-15175', name: 'Summer Tree', description: '', status: 'SALES' },
  { clientId: 'US-15176', name: 'Pablo Herrera', description: 'Issue with two LG batteries', status: 'O&M' },
  { clientId: 'US-15177', name: 'Isles of Weston', description: '', status: 'SALES' },
  { clientId: 'US-15178', name: 'Atlantic', description: '', status: 'SALES' },
  { clientId: 'US-15179', name: 'Yllesca', description: '', status: 'SALES' },
  { clientId: 'US-15180', name: 'Urban Padel', description: '', status: 'SALES' },
  { clientId: 'US-15181', name: 'Ellen Lima Residence', description: 'call again', status: 'SALES' },
  { clientId: 'US-15182', name: 'INFINITY HERBS', description: '', status: 'SALES' },
  { clientId: 'US-15183', name: 'Sharma Residence', description: 'reroofing done.', status: 'SALES' },
  { clientId: 'US-15184', name: 'Ikea Proposal', description: '', status: 'SALES' },
  { clientId: 'US-15185', name: 'OC Fire Station', description: 'create a proposal', status: 'SALES' },
  { clientId: 'US-15186', name: 'Ricardo Korda', description: 'on hold', status: 'SALES' },
  { clientId: 'US-15187', name: 'IMECA', description: 'on hold', status: 'SALES' },
  { clientId: 'US-15188', name: 'Rivera Residence', description: '', status: 'SALES' },
  { clientId: 'US-15189', name: 'Service (ants)', description: '', status: 'O&M' },
  { clientId: 'US-15190', name: 'Morgan Group BMW', description: '', status: 'SALES' },
  { clientId: 'US-15191', name: 'Mayela Rojas Residence', description: 'in progress', status: 'O&M' },
  { clientId: 'US-15192', name: 'West Palm Beach Public Park', description: 'on hold', status: 'SALES' },
  { clientId: 'US-15193', name: 'David Gonzalez', description: 'all good', status: 'O&M' },
  { clientId: 'US-15194', name: 'City of Hallendele', description: 'on hold', status: 'SALES' },
  { clientId: 'US-15195', name: 'Stacy ann Rambally', description: 'all good', status: 'O&M' },
  { clientId: 'US-15196', name: 'Sean Paquet', description: 'all good', status: 'O&M' },
  { clientId: 'US-15197', name: 'Island hammock', description: 'need to check optimizers', status: 'SALES' },
  { clientId: 'US-15198', name: 'Juan Recio', description: 'all good', status: 'O&M' },
  { clientId: 'US-15199', name: 'Roja Residence', description: 'in progress', status: 'SALES' },
  { clientId: 'US-15200', name: 'Carla Harris', description: 'Needs help with inverter', status: 'O&M' },
  { clientId: 'US-15201', name: 'Currie Park', description: '', status: 'SALES' },
  { clientId: 'US-15202', name: 'Pereira', description: '', status: 'O&M' },
  { clientId: 'US-15203', name: 'Volvo North Miami', description: '', status: 'SALES' },
  { clientId: 'US-15204', name: 'M Camp', description: '', status: 'SALES' },
  { clientId: 'US-15205', name: 'Casa Padel', description: 'all good', status: 'O&M' },
  { clientId: 'US-15206', name: 'Daniel Rey', description: 'all good', status: 'O&M' },
  { clientId: 'US-15207', name: 'Marco Oliveira', description: 'proposal for more panels. call back', status: 'O&M' },
  { clientId: 'US-15208', name: 'Azad Amin', description: 'proposal for battery on hand', status: 'O&M' },
  { clientId: 'US-15209', name: 'Jean Phillidor', description: 'needs to pay last payment', status: 'O&M' },
  { clientId: 'US-15210', name: 'Ramon Gutierrez', description: 'all good', status: 'O&M' },
  { clientId: 'US-15211', name: 'Alexey Alonso', description: 'Optimizer change', status: 'O&M' },
  { clientId: 'US-15212', name: 'Ramiro Garcia', description: '', status: 'O&M' },
  { clientId: 'US-15213', name: 'Fred Walumba', description: 'Inverter 2 Error', status: 'O&M' },
  { clientId: 'US-15214', name: 'Juan Alassia', description: 'all good. car charger', status: 'O&M' },
  { clientId: 'US-15215', name: 'Jeeyoung Kim', description: 'inverter replaced. all good', status: 'O&M' },
  { clientId: 'US-15216', name: 'Yadiel Huet', description: 'all good', status: 'O&M' },
  { clientId: 'US-15217', name: 'Donald said', description: 'need to replace optimizers', status: 'O&M' },
  { clientId: 'US-15218', name: 'Darryl Leversuch', description: 'invoiced. all good', status: 'O&M' },
  { clientId: 'US-15219', name: 'Jessica Valenzuela', description: 'o and m', status: 'O&M' },
  { clientId: 'US-15220', name: 'Francis Garcia', description: 'o and m', status: 'O&M' },
  { clientId: 'US-15221', name: 'Sondra Schubiner', description: 'on hold', status: 'O&M' },
  { clientId: 'US-15222', name: 'Francisco Maldonado', description: 'invoiced. all good', status: 'O&M' },
  { clientId: 'US-15223', name: 'Thomas Mcleod', description: 'invoiced. all good', status: 'O&M' },
  { clientId: 'US-15224', name: 'Elvis Sosa', description: '', status: 'O&M' },
  { clientId: 'US-15225', name: 'Lázaro Perona', description: 'call back', status: 'O&M' },
  { clientId: 'US-15226', name: 'Regla Glau', description: 'call back', status: 'O&M' },
  { clientId: 'US-15227', name: 'Joshua McGehee', description: '', status: 'O&M' },
  { clientId: 'US-15228', name: 'William Rolack', description: 'inverter replaced all good', status: 'O&M' },
  { clientId: 'US-15229', name: 'Gary McMillan', description: 'Buy wifi adapter and schedule change', status: 'O&M' },
  { clientId: 'US-15230', name: 'Dorine Wollangk', description: 'modem issue', status: 'O&M' },
  { clientId: 'US-15231', name: 'Robert Millares', description: '', status: 'O&M' },
];

// Helper to map status from Google Sheets to ClientStatus
const mapStatusToClientStatus = (status: string): ClientStatus => {
  const statusMap: Record<string, ClientStatus> = {
    'SALES': 'In Progress',
    'O&M': 'O&M',
    'archived': 'Standby',
    'PERMIT': 'Quote Sent',
    '': 'Contacted',
  };
  return statusMap[status] || 'Contacted';
};

// Demo data for initial state
const generateDemoData = (): AppState => {
  const demoUsers: User[] = [
    {
      id: 'user-1',
      name: 'Sarah (Admin)',
      email: 'sarah@conexsol.com',
      phone: '555-0100',
      role: 'admin',
      active: true,
    },
    {
      id: 'user-2',
      name: 'Mike (Tech)',
      email: 'mike@conexsol.com',
      phone: '555-0101',
      role: 'technician',
      active: true,
    },
    {
      id: 'user-3',
      name: 'Joe (Tech)',
      email: 'joe@conexsol.com',
      phone: '555-0102',
      role: 'technician',
      active: true,
    },
    {
      id: 'user-4',
      name: 'Carlos (COO)',
      email: 'carlos@conexsol.com',
      phone: '555-0103',
      role: 'coo',
      active: true,
    },
  ];

  // Convert imported clients to Customer format
  // Create customers from SolarEdge sites with full details
  const demoCustomers: Customer[] = solarEdgeFloridaSites.map((site, index) => ({
    id: `cust-${index + 1}`,
    clientId: site.clientId,
    name: site.name,
    email: '',
    phone: '',
    address: site.address,
    city: site.city,
    state: site.state,
    zip: site.zip,
    type: site.name.toLowerCase().includes('residence') || site.name.toLowerCase().includes('home') || site.name.toLowerCase().includes('fire station') ? 'residential' : 'commercial',
    clientStatus: site.status === 'Active' ? 'O&M' : 'Standby',
    createdAt: new Date().toISOString(),
    notes: `SolarEdge Site ID: ${site.siteId}\nSystem Power: ${site.power} kW\nInstallation Date: ${site.installationDate}\nManufacturer: ${site.manufacturer}\nModel: ${site.model}\nStatus: ${site.status}`,
    referralSource: '',
    howFound: '',
    isPowerCare: site.status === 'Active',
    solarEdgeSiteId: site.siteId,
    trelloBackupUrl: undefined, // Trello board backup link - populate when hyperlinks are available in column B
  }));

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // No demo jobs - imported clients don't have associated jobs yet
  const demoJobs: Job[] = [];

  return {
    users: demoUsers,
    customers: demoCustomers,
    jobs: demoJobs,
    xeroConfig: {
      connected: false,
    },
    solarEdgeConfig: {
      apiKey: DEFAULT_SOLAREDGE_API_KEY,
    },
    currentUser: demoUsers[0], // Start as admin
  };
};

// Default SolarEdge API key for Conexsol
const DEFAULT_SOLAREDGE_API_KEY = '87VEFU0STLZJ77S5AUDMLYD2TAAQSLZ1';

export const loadData = (): AppState => {
  // Always use fresh imported data (deletes old test clients)
  // To persist changes, we save to localStorage but use imported clients as base
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      const freshData = generateDemoData();
      // Use imported clients, but preserve any new jobs created
      // Ensure solarEdgeConfig is properly loaded from storage
      const storedSolarEdgeConfig = parsed.solarEdgeConfig || {};
      // Use stored API key if it exists and is not empty, otherwise use default
      const apiKey = storedSolarEdgeConfig.apiKey && storedSolarEdgeConfig.apiKey.trim()
        ? storedSolarEdgeConfig.apiKey
        : DEFAULT_SOLAREDGE_API_KEY;
      return {
        ...freshData,
        ...parsed,
        customers: freshData.customers, // Always use imported clients
        // Preserve the stored solarEdgeConfig but ensure it has the right structure
        solarEdgeConfig: {
          apiKey: apiKey,
          lastSync: storedSolarEdgeConfig.lastSync,
          siteCount: storedSolarEdgeConfig.siteCount,
        },
      };
    }
  } catch (e) {
    console.error('Failed to load data:', e);
  }
  return generateDemoData();
};

export const saveData = (state: AppState): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save data:', e);
  }
};

export const clearData = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};
