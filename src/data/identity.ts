// Regional identity (2.3 Rise & fall): how distinct a region is from the rest of its
// country (0–100): its own language, history or nationhood. These are judgements of
// distinctness only, never of what should happen: whether a region ever seeks
// independence, and whether it gets it, comes from play (how it is governed, how it
// fares, and what its people want), not from a script. Regions not listed have a low
// identity of their own.
export const IDENTITY: Record<string, number> = {
  Quebec: 75, Scotland: 70, Wales: 50, 'Northern Ireland': 60,
  'Chechen Republic': 80, 'Republic of Tatarstan': 55, 'Republic of Bashkortostan': 45, 'Republic of Dagestan': 60, 'Tuva Republic': 55, 'Sakha Republic': 45, 'Kaliningrad Oblast': 25,
  Xinjiang: 70, Tibet: 75, 'Inner Mongolia': 45,
  'Jammu and Kashmir': 70, Punjab: 45, Nagaland: 65, Manipur: 55, 'Tamil Nadu': 45,
  'Western Cape': 35, 'KwaZulu-Natal': 40,
  Texas: 30, California: 25, Hawaii: 40, Alaska: 30, Alberta: 30, Nunavut: 45,
  Bavaria: 30, Okinawa: 40, Jeju: 20,
  Diyarbakır: 65, Şırnak: 65, Van: 55,
  Chiapas: 40, 'Rio Grande do Sul': 30, 'Western Australia': 25, Tasmania: 15, 'Eastern Province': 30,
};
/** Adjectives for the regions most likely to become states (others use the name). */
export const ADJECTIVE: Record<string, string> = {
  Quebec: 'Québécois', Scotland: 'Scottish', Wales: 'Welsh', 'Northern Ireland': 'Northern Irish', 'Chechen Republic': 'Chechen', 'Republic of Tatarstan': 'Tatar',
  Xinjiang: 'Uyghur', Tibet: 'Tibetan', 'Jammu and Kashmir': 'Kashmiri', Punjab: 'Punjabi', Texas: 'Texan', California: 'Californian', Hawaii: 'Hawaiian',
  Alaska: 'Alaskan', Alberta: 'Albertan', Bavaria: 'Bavarian', Okinawa: 'Okinawan', 'Western Australia': 'Western Australian', 'Western Cape': 'Cape',
};
/** Support for independence in 2025 where polls measure it (rounded averages of recent polls);
 * elsewhere it starts from identity alone. Support drifts around this level as times change. */
export const INDEP_2025: Record<string, number> = {
  Scotland: 47, Quebec: 35, Wales: 25, 'Western Australia': 8, Alberta: 20, Texas: 20, California: 20, Bavaria: 15,
};
