# Panduan LibraCore — dari nol sampai demo

Panduan ini menjelaskan semua langkah: menyiapkan komputer, menjalankan aplikasi, memakai aplikasi sebagai admin dan peminjam, melihat database di pgAdmin, menguji, sampai skenario demo untuk presentasi.

Daftar isi:

1. [Apa itu LibraCore](#1-apa-itu-libracore)
2. [Yang perlu disiapkan](#2-yang-perlu-disiapkan)
3. [Mengambil project](#3-mengambil-project)
4. [Membuat file `.env`](#4-membuat-file-env)
5. [Menjalankan dengan Docker](#5-menjalankan-dengan-docker)
6. [Login pertama kali](#6-login-pertama-kali)
7. [Memakai aplikasi sebagai admin](#7-memakai-aplikasi-sebagai-admin)
8. [Memakai aplikasi sebagai peminjam](#8-memakai-aplikasi-sebagai-peminjam)
9. [Melihat database di pgAdmin](#9-melihat-database-di-pgadmin)
10. [Menjalankan tes otomatis](#10-menjalankan-tes-otomatis)
11. [Skenario demo presentasi](#11-skenario-demo-presentasi)
12. [Perintah Docker sehari-hari](#12-perintah-docker-sehari-hari)
13. [Kalau ada masalah](#13-kalau-ada-masalah)

---

## 1. Apa itu LibraCore

Aplikasi web untuk perpustakaan: mencatat buku, anggota (member), peminjaman, pengembalian, dan denda keterlambatan.

| Bagian | Teknologi | Tugas |
|---|---|---|
| Frontend | React, disajikan Nginx | Tampilan di browser |
| Backend | Node.js + Express | API, login, validasi, aturan peminjaman |
| Database | PostgreSQL 16 | Menyimpan data secara permanen |
| Container | Docker + Docker Compose | Menjalankan ketiganya bersama-sama |

Ada tiga role:

| Role | Bisa apa |
|---|---|
| **Admin** | Semua: katalog, member, peminjaman, laporan, hapus member, arsip buku |
| **Librarian** | Pekerjaan harian staf (tanpa laporan, hapus member, dan arsip buku). Tidak dibuat dari UI. |
| **Peminjam** | Melihat kartu perpustakaan dan pinjamannya **sendiri**, dan melihat katalog |

Gambar arsitektur dan skema database ada di [docs/architecture.md](architecture.md).

## 2. Yang perlu disiapkan

| Kebutuhan | Untuk apa | Cek dengan |
|---|---|---|
| Docker (Docker Desktop, atau Docker Engine di WSL) | Menjalankan aplikasi | `docker --version` dan `docker compose version` |
| Git | Mengambil kode dari GitHub | `git --version` |
| Browser | Membuka aplikasi | — |
| Node.js 20+ (opsional) | Hanya untuk menjalankan tes atau development tanpa Docker | `node --version` |
| pgAdmin (opsional) | Melihat isi database | — |

Di Windows dengan WSL, jalankan perintah Docker dari terminal WSL (Ubuntu).

## 3. Mengambil project

Repository ini private, jadi akun GitHub kamu harus punya akses ke repo ini.

```bash
git clone https://github.com/rixxz142/libracore.git
cd libracore
```

Kalau Git meminta login, pakai `gh auth login` (GitHub CLI) atau Git Credential Manager. Jangan menaruh token di URL.

## 4. Membuat file `.env`

`.env` berisi password dan secret. File ini **tidak ikut ke GitHub** (sudah ada di `.gitignore`), jadi setiap orang membuatnya sendiri dari contoh:

```bash
cp .env.example .env
```

Di PowerShell: `Copy-Item .env.example .env`

Lalu buka `.env` dan ganti semua nilai `replace-with-...`:

| Variabel | Isi | Aturan |
|---|---|---|
| `POSTGRES_PASSWORD` | Password database | Bebas, buat yang acak |
| `JWT_SECRET` | Kunci untuk menandatangani sesi login | **Minimal 32 karakter** acak. Buat dengan `openssl rand -base64 48` |
| `BOOTSTRAP_ADMIN_EMAIL` | Email admin pertama | Contoh: `admin@example.local` |
| `BOOTSTRAP_ADMIN_PASSWORD` | Password admin pertama | **Minimal 12 karakter** |
| `BOOTSTRAP_BORROWER_EMAIL` | Email peminjam demo | Harus email member yang sudah ada. `budi@example.com` ada di data contoh |
| `BOOTSTRAP_BORROWER_PASSWORD` | Password peminjam demo | **Minimal 10 karakter** |

Variabel lain (denda per hari, lama pinjam, dan lain-lain) boleh dibiarkan default. Daftar lengkapnya ada di README bagian *Environment variables*.

> Akun admin dan peminjam demo dibuat **sekali**, waktu aplikasi pertama kali jalan. Kalau password di `.env` diganti setelah itu, password lama **tetap berlaku**. Ganti password lewat aplikasi (halaman **Account**).

## 5. Menjalankan dengan Docker

Dari folder project:

```bash
docker compose up --build -d
```

Perintah ini:

1. membangun image `libracore-api` dan `libracore-web`,
2. menjalankan PostgreSQL dan membuat tabel beserta data contoh (`database/init.sql`),
3. menyalakan API setelah database siap, lalu menyalakan web setelah API siap.

Cek statusnya:

```bash
docker compose ps
```

Tunggu sampai ketiga container berstatus **healthy**:

```text
NAME              STATUS                    PORTS
libracore-api-1   Up (healthy)              3000/tcp
libracore-db-1    Up (healthy)              127.0.0.1:5433->5432/tcp
libracore-web-1   Up (healthy)              0.0.0.0:8080->80/tcp
```

Cek API-nya:

```bash
curl http://localhost:8080/api/health
# {"status":"ok","database":"up",...}
```

Buka aplikasi di **http://localhost:8080**.

## 6. Login pertama kali

| Role | Email | Password |
|---|---|---|
| Admin | nilai `BOOTSTRAP_ADMIN_EMAIL` | nilai `BOOTSTRAP_ADMIN_PASSWORD` |
| Peminjam demo | nilai `BOOTSTRAP_BORROWER_EMAIL` (Budi Santoso) | nilai `BOOTSTRAP_BORROWER_PASSWORD` |

Admin dan peminjam memakai halaman login yang sama. Tampilan setelah login menyesuaikan role-nya.

Tema terang/gelap bisa diganti dengan tombol bulan/matahari di kanan atas, atau di halaman **Account**.

## 7. Memakai aplikasi sebagai admin

Menu di atas: **Daybook · Loans · Catalog · Members · Reports**, lalu klik nama kamu untuk ke **Account**.

### Daybook (beranda)
Ringkasan hari ini: jumlah eksemplar di rak, yang sedang dipinjam, yang terlambat, dan member aktif. Di bawahnya ada daftar **Chase up** (pinjaman terlambat) dan **Lately at the desk** (pinjaman terbaru).

### Catalog — mengelola buku
- **Tambah buku:** klik **New record**, isi judul, pengarang, kategori, dan jumlah eksemplar (*Copies owned*), lalu **Add to catalog**.
- **Ubah buku:** klik **Edit** di baris buku. Jumlah eksemplar tidak bisa dibuat lebih kecil dari jumlah yang sedang dipinjam.
- **Arsipkan buku:** klik **Archive**. Buku hilang dari katalog dan tidak bisa dipinjam lagi, tapi riwayat pinjamannya tetap tersimpan.
- Cari berdasarkan judul, pengarang, atau ISBN, dan filter per kategori.

### Members — mengelola anggota
- **Daftarkan anggota:** klik **Issue a card**, isi nomor kartu (contoh `M-0004`), nama, dan email (dibutuhkan kalau anggota ini mau bisa login).
- **Ubah atau nonaktifkan:** klik **Edit**. Anggota *Inactive* tidak bisa meminjam.
- **Beri akses login (jadikan peminjam):** klik **Give access**, isi password minimal 10 karakter, lalu berikan password itu ke anggotanya. Mereka login dengan email mereka.
- **Reset password atau cabut akses:** klik **Access**, lalu pilih *Set password* atau *Remove access*.
- **Hapus anggota:** klik **Delete** (khusus admin). Anggota yang punya riwayat pinjaman tidak bisa dihapus; nonaktifkan saja.

### Loans — peminjaman dan pengembalian
- **Pinjamkan buku:** klik **Check out books**, pilih anggota (harus aktif), pilih satu atau beberapa buku yang ada di rak, cek tanggal jatuh tempo (default 14 hari), lalu klik **Check out**. Stok buku otomatis berkurang.
- **Kembalikan buku:** di daftar pinjaman, klik **Check in** di samping judul buku. Stok bertambah lagi. Kalau terlambat, denda dihitung otomatis (default Rp2.000 per hari).
- Tab **All / Open / Overdue / Closed** untuk memfilter, dan kotak pencarian untuk mencari nama atau nomor kartu peminjam.

### Reports (khusus admin)
Jumlah pinjaman per bulan (6 bulan terakhir), buku paling sering dipinjam, jumlah keterlambatan dan total denda, serta koleksi per kategori.

### Account
Lihat profil, ganti password, dan pilih tema (ikut perangkat, terang, atau gelap).

## 8. Memakai aplikasi sebagai peminjam

Menu di atas: **My loans · Catalog**, lalu klik nama kamu untuk ke **Account**.

- **My loans:** kartu perpustakaan (nomor kartu, nama, status), satu kalimat ringkasan (berapa buku dipinjam, kapan jatuh tempo berikutnya, denda kalau terlambat), lalu satu "slip" per buku dengan cap tanggal jatuh tempo. Cap berwarna merah kalau terlambat.
  - Tab **History**: buku yang sudah dikembalikan beserta dendanya.
- **Catalog:** melihat koleksi dan jumlah eksemplar di rak. Peminjaman dilakukan di meja perpustakaan oleh staf.
- **Account:** ganti password dan tema. Untuk mengganti nama atau email, minta ke staf.

Peminjam **hanya bisa melihat datanya sendiri**. Pembatasan ini dijaga oleh API, bukan hanya disembunyikan di tampilan: kalau peminjam mencoba membuka endpoint staf (misalnya `/api/loans` atau `/api/members`), API menjawab `403 Forbidden`.

## 9. Melihat database di pgAdmin

Database di Docker dibuka di port **5433**, khusus untuk komputer sendiri (`127.0.0.1`). Port 5433 dipakai supaya tidak bentrok dengan PostgreSQL lokal yang biasanya memakai 5432.

1. Di pgAdmin, klik kanan **Servers** → **Register** → **Server…**
2. Tab **General**: Name `LibraCore (Docker)`.
3. Tab **Connection**:

   | Kolom | Isi |
   |---|---|
   | Host name/address | `127.0.0.1` |
   | Port | `5433` |
   | Maintenance database | nilai `POSTGRES_DB` (default `libracore`) |
   | Username | nilai `POSTGRES_USER` (default `libracore_app`) |
   | Password | nilai `POSTGRES_PASSWORD` |

4. **Save**. Tabelnya ada di **Databases → libracore → Schemas → public → Tables**.

Contoh query:

```sql
-- Pinjaman lengkap dengan nama peminjam dan judul buku
SELECT l.id, m.name AS peminjam, b.title, l.due_date, li.returned_at, li.fine_idr
FROM loans l
JOIN members m ON m.id = l.member_id
JOIN loan_items li ON li.loan_id = l.id
JOIN books b ON b.id = li.book_id
ORDER BY l.id;

-- Akun login: password tersimpan sebagai hash bcrypt, bukan teks asli
SELECT id, name, email, role, member_id, password_hash FROM users;
```

> Data di pgAdmin sama dengan data di aplikasi. Lebih aman mengubah data lewat aplikasi. Kalau `available_copies` diubah manual, stok bisa tidak cocok lagi dengan data pinjaman.

Tanpa pgAdmin, bisa juga lewat terminal:

```bash
docker compose exec db psql -U libracore_app -d libracore
```

## 10. Menjalankan tes otomatis

Tes backend memakai PostgreSQL sungguhan yang dijalankan sementara oleh tes itu sendiri, jadi **tidak perlu Docker** untuk tes ini.

```bash
cd backend
npm install
npm test
```

Hasil yang diharapkan: semua tes `pass` (50 tes). Yang diuji antara lain:

- login benar/salah, cookie `HttpOnly`, sesi kedaluwarsa atau palsu ditolak
- pembatasan role: librarian tidak bisa arsip buku, peminjam tidak bisa membuka endpoint staf
- **isolasi data dua peminjam**: peminjam A tidak bisa melihat pinjaman peminjam B
- validasi input (data kosong, format salah, ISBN atau nomor kartu duplikat)
- stok tidak bisa minus, termasuk saat 5 orang meminjam eksemplar terakhir bersamaan
- buku tidak bisa dikembalikan dua kali, dan denda dihitung per hari
- transaksi dibatalkan seluruhnya kalau salah satu buku tidak tersedia

Build frontend:

```bash
cd frontend
npm install
npm run build
```

## 11. Skenario demo presentasi

Urutan ini mencakup poin-poin yang diminta tugas.

**A. Container berjalan**
```bash
docker compose ps          # 3 container healthy, port 8080 dan 5433
docker images | grep libracore
docker volume ls | grep db_data
```

**B. Komunikasi antarlayanan**: browser → `web` (Nginx) → `api` → `db`.
```bash
curl http://localhost:8080/api/health    # lewat Nginx ke API, API mengecek database
docker compose logs --tail=20 api        # log tiap request
```

**C. Alur aplikasi**
1. Login sebagai admin.
2. **Members → Issue a card**: buat anggota baru dengan email.
3. **Give access**: beri password.
4. **Loans → Check out books**: pinjamkan 1–2 buku ke anggota itu. Stok di **Catalog** berkurang.
5. Logout, lalu login sebagai anggota tadi. Pinjamannya terlihat di **My loans**.
6. Login sebagai peminjam demo (Budi). Pinjaman anggota baru tadi **tidak terlihat**: ini isolasi data.
7. Login lagi sebagai admin, lalu **Check in** buku. Stok kembali.

**D. Data tetap ada setelah container dibuat ulang**
```bash
docker compose down        # container dihapus, volume TIDAK
docker compose up -d
```
Login lagi: semua data masih ada. **Jangan** pakai `docker compose down -v`, karena `-v` menghapus volume database.

**E. Uji input salah**: di **Catalog → New record**, kosongkan judul lalu simpan. Muncul pesan error per kolom (API menjawab `422`).

**F. Gangguan layanan, diagnosis, dan pemulihan**
```bash
docker compose stop db                    # matikan database
curl -i http://localhost:8080/api/health  # 503, database down
docker compose logs --tail=10 api         # diagnosis: "database check failed"
docker compose start db                   # pulihkan
curl -i http://localhost:8080/api/health  # kembali 200
```

## 12. Perintah Docker sehari-hari

| Perintah | Fungsi |
|---|---|
| `docker compose up --build -d` | Build dan jalankan (pakai ini setelah mengubah kode) |
| `docker compose ps` | Lihat status container |
| `docker compose logs -f api` | Ikuti log API (`Ctrl+C` untuk berhenti mengikuti) |
| `docker compose restart api` | Restart satu layanan |
| `docker compose down` | Matikan semua container, **data tetap aman** |
| `docker compose down -v` | Matikan dan **hapus database**. Hati-hati! |

## 13. Kalau ada masalah

| Gejala | Penyebab dan solusi |
|---|---|
| `Set POSTGRES_USER in .env` atau variabel lain wajib diisi | File `.env` belum dibuat atau belum lengkap. Ulangi langkah 4. |
| API tidak mau start, log: `JWT_SECRET must be set...` | `JWT_SECRET` kurang dari 32 karakter. |
| Port 8080 sudah dipakai | Ubah `"8080:80"` di `compose.yml` menjadi misalnya `"8081:80"`, lalu buka `http://localhost:8081`. |
| pgAdmin: *connection refused* | Docker belum jalan. Jalankan `docker compose up -d`. |
| pgAdmin: *password authentication failed* | Password salah salin dari `.env`, atau port-nya 5432 (seharusnya 5433). |
| Login admin gagal setelah mengganti password di `.env` | Akun hanya dibuat sekali, jadi password lama yang berlaku. Untuk database percobaan saja: `docker compose down -v` lalu `up` lagi (**semua data hilang**). |
| Perubahan `init.sql` tidak muncul | `init.sql` hanya jalan untuk volume baru. Untuk database yang sudah ada, jalankan file di `database/migrations/` (lihat README bagian *Troubleshooting*). |
| Build `web` gagal di `npm ci` | `package-lock.json` tidak cocok dengan versi npm di image. Buat ulang lockfile dengan npm versi image: `docker run --rm -v "$PWD/frontend:/app" -w /app node:20-alpine npm install --package-lock-only` |
| Container *unhealthy* | Lihat `docker compose logs --tail=100 api` dan `docker compose logs --tail=100 db`. |
