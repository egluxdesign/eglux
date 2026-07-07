// src/data/indonesianCities.js
// ============================================================================
// Daftar 97 kota (otonom) di Indonesia — exclude kabupaten.
// Sumber: Kemendagri 2024. Format: { value, label } untuk react-select.
// label = "CityName, ProvinceName" supaya searchable by city atau province.
// ============================================================================

export const INDONESIAN_CITIES = [
  // === Aceh (5) ===
  { value: 'Banda Aceh', label: 'Banda Aceh, Aceh' },
  { value: 'Langsa', label: 'Langsa, Aceh' },
  { value: 'Lhokseumawe', label: 'Lhokseumawe, Aceh' },
  { value: 'Sabang', label: 'Sabang, Aceh' },
  { value: 'Subulussalam', label: 'Subulussalam, Aceh' },

  // === Sumatera Utara (8) ===
  { value: 'Binjai', label: 'Binjai, Sumatera Utara' },
  { value: 'Gunungsitoli', label: 'Gunungsitoli, Sumatera Utara' },
  { value: 'Medan', label: 'Medan, Sumatera Utara' },
  { value: 'Padang Sidempuan', label: 'Padang Sidempuan, Sumatera Utara' },
  { value: 'Pematangsiantar', label: 'Pematangsiantar, Sumatera Utara' },
  { value: 'Sibolga', label: 'Sibolga, Sumatera Utara' },
  { value: 'Tanjungbalai', label: 'Tanjungbalai, Sumatera Utara' },
  { value: 'Tebing Tinggi', label: 'Tebing Tinggi, Sumatera Utara' },

  // === Sumatera Barat (7) ===
  { value: 'Bukittinggi', label: 'Bukittinggi, Sumatera Barat' },
  { value: 'Padang', label: 'Padang, Sumatera Barat' },
  { value: 'Padangpanjang', label: 'Padangpanjang, Sumatera Barat' },
  { value: 'Pariaman', label: 'Pariaman, Sumatera Barat' },
  { value: 'Payakumbuh', label: 'Payakumbuh, Sumatera Barat' },
  { value: 'Sawahlunto', label: 'Sawahlunto, Sumatera Barat' },
  { value: 'Solok', label: 'Solok, Sumatera Barat' },

  // === Riau (2) ===
  { value: 'Dumai', label: 'Dumai, Riau' },
  { value: 'Pekanbaru', label: 'Pekanbaru, Riau' },

  // === Jambi (2) ===
  { value: 'Jambi', label: 'Jambi, Jambi' },
  { value: 'Sungaipenuh', label: 'Sungaipenuh, Jambi' },

  // === Sumatera Selatan (4) ===
  { value: 'Lubuklinggau', label: 'Lubuklinggau, Sumatera Selatan' },
  { value: 'Pagaralam', label: 'Pagaralam, Sumatera Selatan' },
  { value: 'Palembang', label: 'Palembang, Sumatera Selatan' },
  { value: 'Prabumulih', label: 'Prabumulih, Sumatera Selatan' },

  // === Bengkulu (1) ===
  { value: 'Bengkulu', label: 'Bengkulu, Bengkulu' },

  // === Lampung (2) ===
  { value: 'Bandar Lampung', label: 'Bandar Lampung, Lampung' },
  { value: 'Metro', label: 'Metro, Lampung' },

  // === Kepulauan Bangka Belitung (1) ===
  { value: 'Pangkalpinang', label: 'Pangkalpinang, Kepulauan Bangka Belitung' },

  // === Kepulauan Riau (2) ===
  { value: 'Batam', label: 'Batam, Kepulauan Riau' },
  { value: 'Tanjungpinang', label: 'Tanjungpinang, Kepulauan Riau' },

  // === DKI Jakarta (5) ===
  { value: 'Jakarta Barat', label: 'Jakarta Barat, DKI Jakarta' },
  { value: 'Jakarta Pusat', label: 'Jakarta Pusat, DKI Jakarta' },
  { value: 'Jakarta Selatan', label: 'Jakarta Selatan, DKI Jakarta' },
  { value: 'Jakarta Timur', label: 'Jakarta Timur, DKI Jakarta' },
  { value: 'Jakarta Utara', label: 'Jakarta Utara, DKI Jakarta' },

  // === Jawa Barat (9) ===
  { value: 'Bandung', label: 'Bandung, Jawa Barat' },
  { value: 'Banjar', label: 'Banjar, Jawa Barat' },
  { value: 'Bekasi', label: 'Bekasi, Jawa Barat' },
  { value: 'Bogor', label: 'Bogor, Jawa Barat' },
  { value: 'Cimahi', label: 'Cimahi, Jawa Barat' },
  { value: 'Cirebon', label: 'Cirebon, Jawa Barat' },
  { value: 'Depok', label: 'Depok, Jawa Barat' },
  { value: 'Sukabumi', label: 'Sukabumi, Jawa Barat' },
  { value: 'Tasikmalaya', label: 'Tasikmalaya, Jawa Barat' },

  // === Jawa Tengah (6) ===
  { value: 'Magelang', label: 'Magelang, Jawa Tengah' },
  { value: 'Pekalongan', label: 'Pekalongan, Jawa Tengah' },
  { value: 'Salatiga', label: 'Salatiga, Jawa Tengah' },
  { value: 'Semarang', label: 'Semarang, Jawa Tengah' },
  { value: 'Surakarta', label: 'Surakarta, Jawa Tengah' },
  { value: 'Tegal', label: 'Tegal, Jawa Tengah' },

  // === DI Yogyakarta (1) ===
  { value: 'Yogyakarta', label: 'Yogyakarta, DI Yogyakarta' },

  // === Jawa Timur (9) ===
  { value: 'Batu', label: 'Batu, Jawa Timur' },
  { value: 'Blitar', label: 'Blitar, Jawa Timur' },
  { value: 'Kediri', label: 'Kediri, Jawa Timur' },
  { value: 'Madiun', label: 'Madiun, Jawa Timur' },
  { value: 'Malang', label: 'Malang, Jawa Timur' },
  { value: 'Mojokerto', label: 'Mojokerto, Jawa Timur' },
  { value: 'Pasuruan', label: 'Pasuruan, Jawa Timur' },
  { value: 'Probolinggo', label: 'Probolinggo, Jawa Timur' },
  { value: 'Surabaya', label: 'Surabaya, Jawa Timur' },

  // === Banten (4) ===
  { value: 'Cilegon', label: 'Cilegon, Banten' },
  { value: 'Serang', label: 'Serang, Banten' },
  { value: 'Tangerang', label: 'Tangerang, Banten' },
  { value: 'Tangerang Selatan', label: 'Tangerang Selatan, Banten' },

  // === Bali (1) ===
  { value: 'Denpasar', label: 'Denpasar, Bali' },

  // === Nusa Tenggara Barat (2) ===
  { value: 'Bima', label: 'Bima, Nusa Tenggara Barat' },
  { value: 'Mataram', label: 'Mataram, Nusa Tenggara Barat' },

  // === Nusa Tenggara Timur (1) ===
  { value: 'Kupang', label: 'Kupang, Nusa Tenggara Timur' },

  // === Kalimantan Barat (2) ===
  { value: 'Pontianak', label: 'Pontianak, Kalimantan Barat' },
  { value: 'Singkawang', label: 'Singkawang, Kalimantan Barat' },

  // === Kalimantan Tengah (1) ===
  { value: 'Palangka Raya', label: 'Palangka Raya, Kalimantan Tengah' },

  // === Kalimantan Selatan (2) ===
  { value: 'Banjarbaru', label: 'Banjarbaru, Kalimantan Selatan' },
  { value: 'Banjarmasin', label: 'Banjarmasin, Kalimantan Selatan' },

  // === Kalimantan Timur (3) ===
  { value: 'Balikpapan', label: 'Balikpapan, Kalimantan Timur' },
  { value: 'Bontang', label: 'Bontang, Kalimantan Timur' },
  { value: 'Samarinda', label: 'Samarinda, Kalimantan Timur' },

  // === Kalimantan Utara (1) ===
  { value: 'Tarakan', label: 'Tarakan, Kalimantan Utara' },

  // === Sulawesi Utara (4) ===
  { value: 'Bitung', label: 'Bitung, Sulawesi Utara' },
  { value: 'Kotamobagu', label: 'Kotamobagu, Sulawesi Utara' },
  { value: 'Manado', label: 'Manado, Sulawesi Utara' },
  { value: 'Tomohon', label: 'Tomohon, Sulawesi Utara' },

  // === Gorontalo (1) ===
  { value: 'Gorontalo', label: 'Gorontalo, Gorontalo' },

  // === Sulawesi Tengah (1) ===
  { value: 'Palu', label: 'Palu, Sulawesi Tengah' },

  // === Sulawesi Selatan (3) ===
  { value: 'Makassar', label: 'Makassar, Sulawesi Selatan' },
  { value: 'Palopo', label: 'Palopo, Sulawesi Selatan' },
  { value: 'Parepare', label: 'Parepare, Sulawesi Selatan' },

  // === Sulawesi Tenggara (2) ===
  { value: 'Bau-Bau', label: 'Bau-Bau, Sulawesi Tenggara' },
  { value: 'Kendari', label: 'Kendari, Sulawesi Tenggara' },

  // === Sulawesi Barat (1) ===
  { value: 'Mamuju', label: 'Mamuju, Sulawesi Barat' },

  // === Maluku (1) ===
  { value: 'Ambon', label: 'Ambon, Maluku' },

  // === Maluku Utara (2) ===
  { value: 'Ternate', label: 'Ternate, Maluku Utara' },
  { value: 'Tidore Kepulauan', label: 'Tidore Kepulauan, Maluku Utara' },

  // === Papua (1) ===
  { value: 'Jayapura', label: 'Jayapura, Papua' },

  // === Papua Barat (1) ===
  { value: 'Sorong', label: 'Sorong, Papua Barat' },
];

// Total: 97 kota (5+8+7+2+2+4+1+2+1+2+5+9+6+1+9+4+1+2+1+2+1+2+3+1+4+1+1+3+2+1+1+2+1+1)
export default INDONESIAN_CITIES;
