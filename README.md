# iCare — Demo GitHub Pages

Versi statis untuk presentasi antarmuka iCare Smart Irrigation. Dibuat dari kode proyek iCare milik pengguna.

## Publikasi

1. Buat repository GitHub publik, misalnya `icare-demo`.
2. Unggah **isi folder ini** ke root repository (pastikan `index.html` ada di root).
3. Di **Settings → Pages**, pilih **Deploy from a branch**, `main` dan `/(root)`.
4. Tunggu proses deployment GitHub selesai, kemudian buka `https://USERNAME.github.io/icare-demo/`.

Alternatif: `python -m http.server 8000` dari folder ini dan buka `http://localhost:8000` untuk pengujian lokal.

## Cara memakai

- Klik Masuk sebagai Admin/Pengguna, lalu **MASUK DEMO**.
- Tidak ada username/password yang perlu dimasukkan.
- Monitoring, grafik dan kontrol pompa merupakan simulasi di browser, bukan data live.
- Admin dapat mencoba tambah/ubah/nonaktifkan pengguna dan tambah perangkat sementara; semua data kembali ke awal saat refresh.
- Tombol ekspor CSV menghasilkan **data simulasi**.

## Batasan keamanan dan teknis

- Tidak ada PHP, MySQL, API asli, maupun komunikasi ke ESP32.
- Jangan menganggap login demo sebagai autentikasi atau menggunakan versi ini untuk kontrol perangkat sesungguhnya.
- **Jangan unggah** file `config/.env`, kredensial, database nyata, atau kode backend ke repository publik.
- Data simulasi dihasilkan di browser; tidak menyimpan data pribadi dan tidak mengirim data ke server.
- Teks cuaca adalah simulasi, bukan informasi BMKG.
