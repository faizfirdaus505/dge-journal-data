# Edge Journal — Jurnal Trading Kripto

Aplikasi jurnal trading pribadi berbasis HTML, CSS, dan JavaScript. Antarmuka berbahasa Indonesia dan dioptimalkan untuk layar desktop maupun ponsel.

## Fitur

- Dashboard saldo Spot dalam IDR dan Futures dalam USDT.
- Grafik kurva hasil Spot dan Futures secara terpisah.
- Pencatatan, pembukaan kembali, penyuntingan, pencarian, penyaringan, dan penghapusan jurnal transaksi.
- Pair Spot otomatis menggunakan kuotasi IDR (contoh `BTC/IDR`); Futures menggunakan USDT (contoh `BTC/USDT`) dan menyimpan nilai leverage.
- Evaluasi harian dengan catatan bebas dan riwayat yang dapat dibuka kembali.
- Ekspor PDF per transaksi dan laporan jurnal, termasuk ringkasan serta grafik visual berdasarkan data yang dicatat.
- Impor Excel (.xlsx/.xls), CSV, dan backup JSON dengan pemetaan otomatis kolom berbahasa Indonesia maupun Inggris ke format jurnal.
- Deteksi jenis pasar Spot/Futures, pair, mata uang kuotasi, arah posisi, leverage, tanggal, harga masuk/keluar, biaya, dan P/L dari judul kolom yang dikenali.
- Pemeriksaan duplikat dasar saat impor agar file yang sama tidak mudah masuk dua kali.
- Ekspor CSV dan backup JSON.
- Harga pasar kripto publik melalui CoinPaprika.
- Sinkronisasi GitHub untuk memuat serta menyimpan jurnal di antara perangkat.

## Impor riwayat trading dari Excel

1. Klik **Impor Excel / CSV** di panel pengembang.
2. Pilih file `.xlsx`, `.xls`, atau `.csv` yang baris pertamanya berisi judul kolom. File ekspor exchange dan spreadsheet buatan sendiri didukung selama judul kolomnya menunjukkan data seperti `Symbol/Pair`, `Date`, `Entry Price`, `Exit Price`, `Quantity`, `Leverage`, dan `PnL` (judul Bahasa Indonesia juga dikenali).
3. Aplikasi membaca sheet transaksi yang namanya paling relevan; jika tidak ada, sheet pertama digunakan.
4. Periksa ringkasan kolom yang dikenali dan contoh hasil pemetaan, lalu konfirmasi impor. Baris kosong/tidak dikenali dilewati dan transaksi yang terdeteksi sudah ada akan dilewati.
5. Setelah impor, periksa beberapa jurnal terutama mata uang P/L, jumlah aset, biaya, dan arah posisi. Format ekspor setiap exchange bisa berbeda, jadi selalu verifikasi hasil pemetaan sebelum mengandalkan statistiknya.

Pembaca Excel menggunakan SheetJS dari CDN, sehingga koneksi internet diperlukan ketika pustaka belum tersimpan di cache browser.

## Jalankan secara lokal

1. Ekstrak folder `edge-journal`.
2. Buka folder di VS Code.
3. Jalankan `index.html` menggunakan ekstensi Live Server atau host statis lokal.
4. Data lokal disimpan di `localStorage` browser. Sebelum GitHub terhubung, data belum dibagikan ke perangkat lain.

## Konfigurasi GitHub untuk sinkronisasi lintas perangkat

Aplikasi situs dan data jurnal sengaja dipisahkan agar data trading tidak ikut dipublikasikan melalui GitHub Pages.

1. Pertahankan situs di repository `faizfirdaus505/porto2` dan aktifkan GitHub Pages seperti biasa.
2. Buat repository baru bernama `edge-journal-data` dengan visibilitas **Private**. Pastikan branch yang digunakan adalah `main`.
3. Buat *fine-grained personal access token* dengan akses hanya ke repository `edge-journal-data`, izin **Contents: Read and write**, serta akses metadata baca bawaan.
4. Unggah versi terbaru `index.html`, `style.css`, dan `app.js` ke `porto2`, lalu tunggu GitHub Pages selesai memperbarui situs.
5. Buka situs di perangkat pertama, buka **Pengaturan GitHub**, masukkan token, username `faizfirdaus505`, repository situs `porto2`, repository data `edge-journal-data`, branch `main`, dan URL Pages `https://faizfirdaus505.github.io/porto2/`.
6. Tekan **Uji Koneksi**, lalu **Simpan**. Pastikan status menunjukkan jurnal tersinkron ke repository privat.
7. Ulangi pengaturan token yang sama di perangkat kedua. Gunakan **Sinkronkan jurnal** jika ingin mengambil pembaruan saat itu juga. Ketika aplikasi tetap terbuka, aplikasi juga memeriksa perubahan GitHub secara berkala.

File data yang dibuat di repository privat adalah `.edge-journal/journal.json`.

## Keamanan penting

- Jangan memasukkan token exchange, API key exchange, kata sandi, atau informasi login lain ke aplikasi ini.
- Token GitHub pada versi statis ini disimpan dalam `localStorage` browser agar tidak perlu diketik ulang setiap kali. Siapa pun yang memiliki akses ke profil browser tersebut berpotensi mengakses token. Gunakan izin minimum, aktifkan autentikasi perangkat, dan cabut token dari pengaturan GitHub jika perangkat hilang atau token tidak lagi diperlukan.
- Repository `edge-journal-data` wajib **Private**. GitHub Pages hanya meng-host kode situs; jangan menaruh jurnal, token, atau file ekspor pribadi di repository situs yang publik.
- Sinkronisasi memerlukan internet dan token GitHub yang valid. Status lokal tidak berarti sinkronisasi cloud berhasil; lihat indikator sinkronisasi di panel pengembang.
- Grafik dan hasil transaksi dihitung dari angka yang dimasukkan secara manual, bukan data transaksi yang dibaca langsung dari exchange. Verifikasi angka sebelum menjadikannya dasar keputusan.

## Catatan teknis

- Harga pasar publik membutuhkan koneksi internet.
- Ekspor PDF menggunakan jsPDF dan AutoTable melalui CDN, sehingga memerlukan koneksi internet saat pustaka belum tersedia di cache.
- Jika browser menolak penyimpanan lokal atau penyimpanan penuh, ekspor cadangan JSON secara berkala.


## Impor laporan transaksi exchange (CSV)

Edge Journal mengenali laporan `Transaction History Report` yang berisi kolom seperti `Order Date`, `Order Number`, `Transaction`, `Transaction Type`, `Product Name`, `Status`, `Currency`, `Order Price`, `Quantity`, `Fees`, `Taxes`, `TP`, dan `SL`. Baris metadata di awal file akan dilewati otomatis.

- Hanya order `Crypto` dan `Crypto Futures` berstatus `SUCCESS` atau `PARTIALLY_FILLED` (dengan harga dan kuantitas valid) yang diimpor.
- Baris `CANCELLED`, top up, cash out, transfer, dan funding dilewati karena bukan order pembukaan/penutupan yang bisa langsung dijadikan jurnal posisi.
- Order diimpor sebagai draft berstatus **Terbuka**, tanpa P/L otomatis. Laporan sumber adalah riwayat order, bukan jurnal posisi lengkap dan tidak menyediakan P/L terealisasi/leverage untuk semua baris.
- Spot `SELL` tidak otomatis dianggap posisi Short. Untuk Futures, arah awal BUY/SELL hanyalah perkiraan; periksa apakah order tersebut membuka atau menutup posisi sebelum mengubah status ke Selesai.
- Nomor order sumber disimpan sebagai identitas impor untuk membantu menghindari impor ganda.
