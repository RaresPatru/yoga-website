# Ghid de administrare

Tot ce poți face singură pe site, fără să ceri ajutor. Nu ai nevoie de
cunoștințe tehnice pentru nimic din ce urmează.

**Adresa panoului:** `/admin` — te autentifici cu emailul și parola ta.

---

## Cuprins

1. [Conținutul site-ului (poze, text despre tine)](#1-conținutul-site-ului)
2. [Evenimente](#2-evenimente)
3. [Înscrieri și lista de așteptare](#3-înscrieri-și-lista-de-așteptare)
4. [Articole pe blog](#4-articole-pe-blog)
5. [Testimoniale](#5-testimoniale)
6. [Mesaje de la vizitatori](#6-mesaje)
7. [Emailuri automate](#7-emailuri-automate)
8. [Imagini pentru Instagram](#8-imagini-pentru-instagram)
9. [Când ceva nu merge](#9-când-ceva-nu-merge)

---

## 1. Conținutul site-ului

**Meniu: Conținut site**

Aici sunt textele și fotografiile de pe pagina principală și de pe pagina
„Despre mine".

Fiecare câmp are două casete:

- **prima** este textul în română — cel pe care îl vede aproape toată lumea;
- **a doua** este traducerea în engleză, opțională. Dacă o lași goală, se
  afișează automat textul în română. Nu rămâne nimic gol pe site.

Apeși **Salvează** sub fiecare câmp. Apare un „Salvat" verde pentru câteva
secunde.

### Ce e important să completezi

Câmpurile necompletate apar pe site cu un chenar punctat și un mesaj de tipul
„Fotografia ta principală — adaugă din panoul de administrare". Sunt vizibile
intenționat, ca să știi ce mai ai de făcut. Lista completă, în ordinea
priorității, e în `docs/CONTENT-NEEDED.md`.

Cele trei care contează cel mai mult:

1. **Fotografia ta principală** (pagina de start)
2. **Scurtă prezentare** — 2–3 fraze despre tine
3. **Povestea ta** (pagina „Despre mine")

Motivul e simplu: oamenii aleg un **om**, nu un site. Fotografia ta și povestea
ta conving mai mult decât orice altceva de pe site.

### Întrebări frecvente

Tot pe pagina „Conținut site", jos. Apeși **Adaugă**, scrii întrebarea și
răspunsul, apoi **Salvează**.

Merită efortul: întrebările practice („ce aduc cu mine?", „sunt începătoare, pot
să vin?") sunt exact lucrurile care opresc pe cineva să se înscrie. Sunt și
lucrurile pe care oamenii le caută pe Google, deci aduc vizitatori care nu te
cunosc încă.

Debifezi **Vizibil pe site** dacă vrei să ascunzi temporar o întrebare.

---

## 2. Evenimente

**Meniu: Evenimente** → **Eveniment Nou**

| Câmp | Ce înseamnă |
|---|---|
| Titlu (RO) | Numele evenimentului. Obligatoriu. |
| Titlu (EN) | Traducerea. Butonul **→ EN** traduce automat; verifică rezultatul. |
| Slug | Partea din adresă: `/events/atelier-de-yoga`. Litere mici și liniuțe. |
| Data, Ora | Ora la care începe, ora României. |
| Locație | Orașul sau adresa. |
| Preț | **0 înseamnă gratuit.** Orice număr mai mare cere plata prin card. Nu poate fi negativ. |
| Moneda | RON, EUR, USD sau GBP. Implicit RON. Clientul plătește exact în moneda aleasă aici. |
| Participanți maxim | Câte locuri sunt. Lasă gol dacă nu limitezi. Minim 1. |
| URL Imagine | Alegi din Biblioteca Media. |
| Link WhatsApp | Grupul evenimentului. Se trimite automat în emailul de confirmare. Vezi mai jos. |
| Publicat | **Cât timp e debifat, evenimentul nu se vede pe site.** |

### Moneda

Alege moneda din căsuța de lângă preț. Este important: **suma introdusă se
încasează în moneda aleasă**. Dacă scrii `80` și alegi `EUR`, clientul plătește
80 de euro, nu 80 de lei. Prețul apare peste tot pe site în moneda aleasă —
inclusiv în imaginea pentru Instagram și în rezultatele Google.

Dacă nu atingi această căsuță, rămâne pe RON. Toate evenimentele create înainte
de această modificare sunt în RON.

### Linkuri WhatsApp salvate

Fiindcă folosești aproape mereu același grup, nu mai e nevoie să lipești linkul
de fiecare dată.

- Lipește linkul o dată, apasă butonul **🔖** de lângă câmp, scrie-i un nume
  (de exemplu „Grup general") și apasă **Salvează linkul**.
- La următorul eveniment apeși **🔖** și apoi **Folosește** — linkul se
  completează singur.
- Un link care nu mai e folosit se șterge cu coșul de gunoi.

**Ștergerea unui link salvat nu strică evenimentele existente.** Linkul se
copiază în eveniment în momentul în care îl alegi, deci evenimentele trimise
deja rămân exact cum au fost trimise.

### Locuri și lista de așteptare

Site-ul numără singur locurile ocupate. Când se umple:

- pe site apare **„Locuri epuizate"**;
- formularul de înscriere e înlocuit cu **lista de așteptare**.

Dacă se eliberează un loc — cineva nu finalizează plata, sau ceri o restituire —
prima persoană de pe listă primește automat un email cu un link valabil **24 de
ore**. Dacă nu îl folosește, linkul expiră, dar locul rămâne liber și oricine se
poate înscrie normal.

Vezi cine așteaptă: **Evenimente** → butonul **Vezi lista de așteptare**.

---

## 3. Înscrieri și lista de așteptare

**Meniu: Înscrieri**

Toate persoanele înscrise, cu nume, email și telefon. Poți căuta după nume sau
email.

Starea plății:

| Etichetă | Ce înseamnă |
|---|---|
| Gratuit | Eveniment fără plată. Locul e confirmat. |
| În așteptare | A început plata dar nu a finalizat-o încă. Locul e rezervat temporar. |
| Plătit | Banii au intrat. Locul e confirmat. |
| Restituit | Ai returnat banii. Locul s-a eliberat automat. |

> **Datele acestea sunt personale.** Numele, emailurile și telefoanele
> participantelor sunt vizibile **doar** aici, doar pentru tine. Nu apar nicăieri
> pe site public. Pe site se vede doar numărul de locuri ocupate.

---

## 4. Articole pe blog

**Meniu: Articole** → **Articol Nou**

Editorul funcționează ca un document normal: selectezi text și apeși pe butoane
pentru **bold**, titluri, liste, citate.

- **Imagini, audio, video:** butonul cu imagine deschide Biblioteca Media.
- **Video de pe YouTube / Vimeo / Instagram:** butonul cu ▶ — lipești linkul
  paginii, nu ai nevoie de cod. Reels-urile și Shorts-urile apar în format
  vertical, ca pe telefon.
- **Corectură ortografică:** butonul RO/EN/off. Pentru română, Chrome are nevoie
  de dicționarul românesc instalat (Setări → Limbi → adaugă Română).
- **Ascuns:** articolul rămâne salvat dar dispare de pe site.

Butonul **→ EN** traduce automat titlul sau conținutul. E o traducere
automată — merită citită înainte de publicare.

---

## 5. Testimoniale

**Meniu: Testimoniale**

Testimonialele trimise de participante apar aici ca **Neaprobat** și **nu se
văd pe site** până le aprobi tu (bifa verde). Butonul X le șterge definitiv.

Pentru fiecare poți completa:

- **Nume** — un testimonial cu nume convinge mult mai mult decât unul anonim.
  Dacă îl lași gol, se afișează „Participantă".
- **Rating** (1–5) — **opțional**. Dacă îl lași pe „Fără", nu se afișează stele
  deloc. Asta e intenționat: mai bine fără stele decât cu stele inventate.
- **Link video** — dacă testimonialul e o filmare.

> **Testimonialele video merită cerute.** Sunt cea mai convingătoare formă de
> recomandare pentru ateliere și retreaturi. Un clip de 20–30 de secunde filmat
> cu telefonul e suficient. Îl încarci în Biblioteca Media și lipești linkul aici.

---

## 6. Mesaje

**Meniu: Mesaje** — mesajele trimise din formularul de contact. Le poți citi și
șterge.

Formularul e protejat împotriva roboților, deci nu ar trebui să primești spam.

---

## 7. Emailuri automate

**Meniu: Email-uri**

Textele emailurilor trimise automat. Poți schimba conținutul; **nu schimba
cuvintele dintre acolade** — `{{user_name}}`, `{{event_name}}` — pentru că
acolo se completează automat datele reale.

| Email | Când se trimite |
|---|---|
| Confirmare înscriere | Imediat, la evenimente gratuite. |
| Confirmare plată | După ce plata a intrat, la evenimentele cu preț. |
| Cerere testimonial | Când o trimiți tu. |

Fiecare confirmare are atașată invitația pentru calendar, cu ora corectă a
României.

---

## 8. Imagini pentru Instagram

Pe fiecare pagină de eveniment și de articol există butonul **„Descarcă pentru
Instagram"**.

Îți generează o imagine verticală (formatul de story) cu titlul, data, locația
și prețul evenimentului, gata de postat. Nu trebuie să faci nimic în alt program.

Avantajul: imaginea se face din datele reale ale evenimentului. Dacă muți
evenimentul pe altă dată, imaginea se schimbă odată cu el — nu ai cum să postezi
din greșeală o dată veche.

---

## 9. Când ceva nu merge

**Nu pot intra în panou.** Verifică emailul și parola. Dacă apare mesajul
„Contul acesta nu are acces la panoul de administrare", contul există dar nu are
drepturi de administrare — trebuie adăugat în lista de administratori.

**Am publicat un eveniment și nu apare pe site.** Verifică bifa **Publicat** și
data — evenimentele trecute nu apar în lista principală.

**Nu pot încărca un fișier.** Limita e 50 MB. Pentru filme mai mari, urcă-le pe
YouTube sau Vimeo și lipește linkul în editor. Fișierele `.svg` sunt respinse
intenționat, din motive de siguranță — folosește `.jpg`, `.png` sau `.webp`.

**Cineva a plătit dar înscrierea arată „În așteptare".** Confirmarea vine de la
procesatorul de plăți și durează de obicei câteva secunde. Dacă rămâne așa mai
mult de câteva minute, e de verificat tehnic.

**Am șters din greșeală.** Ștergerile sunt definitive. Ștergerea unui eveniment
șterge și înscrierile lui. Întreabă înainte dacă nu ești sigură.
