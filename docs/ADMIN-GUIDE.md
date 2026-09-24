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
8. [Când ceva nu merge](#8-când-ceva-nu-merge)

---

## 1. Conținutul site-ului

**Meniu: Conținut site**

Aici sunt toate textele și fotografiile de pe site, împărțite în secțiuni:
Identitate, Rețele sociale, Meniu, Pagina de start, Despre mine, Întrebări
frecvente, Blog, Subsol, SEO și firmă, Pagini legale. Alegi secțiunea din
lista din stânga (pe telefon, din lista de sus).

- **RO / EN** schimbă toate câmpurile secțiunii între română și engleză. În
  engleză, deasupra fiecărui câmp vezi textul în română. Un câmp englezesc gol
  folosește automat textul în română. Cifrele de lângă EN arată câte texte au
  deja traducere.
- **Tradu ce lipsește** (în modul EN) traduce toate câmpurile englezești goale.
  Citește traducerea, apoi salvează.
- Sub fiecare câmp scrie ce apare pe site cât timp e gol.
- **Salvează modificările**, sus, salvează toată secțiunea deodată. Dacă pleci
  din secțiune fără să salvezi, site-ul te întreabă înainte.
- Textele lungi (prezentarea, povestea ta, paginile legale) au o mică bară de
  formatare: aldin, cursiv, liste și linkuri. Enter face un paragraf nou.

### Ce e important să completezi

Câmpurile necompletate apar pe site cu un chenar punctat și numele părții pe
care o țin, de exemplu „Titlu principal" sau „Portret". Sunt vizibile
intenționat, ca să știi ce mai ai de făcut. Lista completă, în ordinea
priorității, e în `docs/CONTENT-NEEDED.md`.

Cele trei care contează cel mai mult:

1. **Fotografia principală** (Pagina de start)
2. **Scurtă prezentare**: 2–3 fraze despre tine (Pagina de start → Cine sunt)
3. **Povestea ta** (Despre mine)

Motivul e simplu: oamenii aleg un **om**, nu un site. Fotografia ta și povestea
ta conving mai mult decât orice altceva de pe site.

### Întrebări frecvente

În secțiunea **Întrebări frecvente**. Apeși **Adaugă o întrebare**, scrii
întrebarea și răspunsul, apoi **Salvează modificările**. O întrebare nouă e
**ascunsă** până bifezi **Publicată pe site**. Schimbi ordinea trăgând de
mânerul din stânga sau cu săgețile sus și jos.

Merită efortul: întrebările practice („ce aduc cu mine?", „sunt începătoare, pot
să vin?") sunt exact lucrurile care opresc pe cineva să se înscrie. Sunt și
lucrurile pe care oamenii le caută pe Google, deci aduc vizitatori care nu te
cunosc încă.

### Paginile legale

În secțiunea **Pagini legale** completezi datele firmei (denumirea, CUI-ul,
sediul, emailul pentru date personale, TVA). Ele apar singure în politica de
confidențialitate, în termeni și în politica de cookie-uri, care sunt deja
scrise ca ciorne. Tot acolo încarci pictograma ANPC SAL. Un avocat ar trebui să
citească documentele o dată înainte de lansare; ce anume, e în
`docs/PRIVACY.md`.

---

## 2. Evenimente

**Meniu: Evenimente** → **Eveniment Nou**

| Câmp | Ce înseamnă |
|---|---|
| Titlu (RO) | Numele evenimentului. Obligatoriu. |
| Titlu (EN) | Traducerea. Butonul **→ EN** traduce automat; verifică rezultatul. |
| Slug | Partea din adresă: `/events/atelier-de-yoga`. Litere mici și liniuțe. |
| Data | Ziua în care **începe**. Singurul câmp obligatoriu dintre cele patru. |
| Ora | Ora la care începe, ora României. **Poți lăsa gol** dacă nu știi încă: atunci pe site nu apare nicio oră, doar data. O completezi mai târziu și apare. |
| Data de final | Doar dacă ține mai multe zile. Lasă gol pentru un eveniment de o singură zi. |
| Ora de final | Când se termină. Lasă gol dacă nu vrei să promiți o oră de final. |
| Locație | Orașul sau adresa. Este textul care se vede pe site. |
| Link hartă | **Opțional.** Deschizi Google Maps, apeși *Share/Distribuie* și lipești linkul aici. Sau scrii coordonatele: `46.7712, 23.5949` — util pentru un loc din parc, care nu are adresă. Dacă e completat, adresa de pe pagina evenimentului devine apăsabilă și deschide harta. Dacă lași gol, adresa rămâne text simplu. |
| Preț | **0 înseamnă gratuit.** Orice număr mai mare cere plata prin card. Nu poate fi negativ. |
| Moneda | RON, EUR, USD sau GBP. Implicit RON. Clientul plătește exact în moneda aleasă aici. |
| Participanți maxim | Câte locuri pot fi rezervate pe site — singurul loc unde se poate rezerva. Scade numărul dacă vrei să păstrezi locuri pentru cineva: din 15 pui 13 și rămân două ale tale. **Gol sau 0** înseamnă „locuri epuizate”: nimeni nu se mai poate înscrie, se poate intra doar pe lista de așteptare. Când pui la loc un număr și rămân locuri libere, primele persoane de pe listă primesc un email — vezi mai jos. |
| URL Imagine | Deocamdată lipești adresa completă a imaginii. Un buton care deschide Biblioteca Media direct aici nu există încă. |
| Link WhatsApp | Grupul evenimentului. Se trimite automat în emailul de confirmare. Vezi mai jos. |
| Publicat | **Cât timp e debifat, evenimentul nu se vede pe site.** |

> **Cum apare pe site.** Data și ora se hotărăsc separat.
>
> *Data:* o singură zi („9 octombrie 2026”), sau intervalul de zile dacă ai pus
> și o dată de final („28 – 29 octombrie 2026”).
>
> *Ora:* dacă ai pus ora de început **și** ora de final, se vede intervalul
> („18:30 – 19:45”). La un eveniment de mai multe zile asta se citește ca
> programul ținut în fiecare zi. Dacă ai pus doar ora de început, se vede doar
> ea. Dacă n-ai pus ora de început, nu apare niciun ceas — nici dacă ai
> completat ora de final, pentru că „se termină la 17:00” fără o oră de început
> nu ajută pe nimeni.
>
> **Dacă evenimentul trece de miezul nopții** — începe la 22:00 și se termină la
> 01:00 — pune ziua următoare la **Data de final**. Site-ul arată atunci
> „7 – 8 noiembrie 2026” și „22:00 – 01:00”.
>
> În calendarul oamenilor evenimentul intră întotdeauna cu durata reală, chiar
> și când site-ul n-o scrie. Fără oră de început intră ca eveniment „toată
> ziua”, adică o bandă peste zilele respective.

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

- pe site apare **„Locuri epuizate”**;
- formularul de înscriere e înlocuit cu **lista de așteptare**.

Dacă se eliberează un loc — cineva nu finalizează plata, sau (după ce restituirile sunt activate în Stripe) ceri o restituire —
prima persoană de pe listă primește automat un email cu un link valabil **24 de
ore**. Dacă nu îl folosește, linkul expiră, dar locul rămâne liber și oricine se
poate înscrie normal.

Vezi cine așteaptă: **Evenimente** → butonul **Vezi lista de așteptare**.

#### Când dai drumul la locuri, lista pleacă

La un eveniment cu **Participanți maxim** gol sau 0 nu există niciun loc de dat,
așa că nimeni de pe listă nu primește nimic, oricât ar aștepta. Lista pornește
doar când pui tu un număr.

**De fiecare dată când salvezi un eveniment**, site-ul se uită câte locuri sunt
libere și trimite atâtea linkuri, în ordinea în care oamenii s-au înscris pe
listă. Dacă sunt 3 locuri libere și 10 pe listă, pleacă 3 emailuri. Dacă nu e
niciun loc liber, nu pleacă nimic.

După salvare îți spune câte au plecat, într-o bară verde sus. Nimeni nu
primește același link de două ori: dacă salvezi din nou peste cinci minute, cei
care au deja un link valabil sunt săriți.

> **Deci:** înainte să pui un număr mare la un eveniment cu listă de așteptare,
> gândește-te că fiecare loc liber înseamnă un email plecat imediat, în numele
> tău.

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
| Restituit | Ai returnat banii. Locul se eliberează automat după ce restituirile sunt activate în Stripe (încă nu sunt). |

> **Datele acestea sunt personale.** Numele, emailurile și telefoanele
> participantelor sunt vizibile **doar** aici, doar pentru tine. Nu apar nicăieri
> pe site public. Pe site se vede doar numărul de locuri ocupate.

---

## 4. Articole pe blog

**Meniu: Articole** → **Articol Nou**

Editorul funcționează ca un document normal: selectezi text și apeși pe butoane
pentru **îngroșat**, titluri, liste, citate și aliniere (stânga, centru, dreapta).

- **Scurtături:** butonul cu tastatură, ultimul din bară (sau Ctrl+/, ⌘/ pe Mac),
  arată tot ce poți face fără mouse, cu rezultatul lângă fiecare. Multe merg și
  doar scriind, inclusiv pe telefon: `## ` la început de rând face un titlu,
  `- ` o listă, `**cuvânt**` îl îngroașă. Dacă nu voiai formatarea, apasă
  Backspace imediat după și rămâne exact ce ai scris.
- **Imagini, audio, video:** butonul cu imagine deschide Biblioteca Media.
- **Video de pe YouTube / Vimeo / Instagram:** butonul cu ▶ — lipești linkul
  paginii, nu ai nevoie de cod. Reels-urile și Shorts-urile apar în format
  vertical, ca pe telefon.
- **Corectură ortografică:** butonul RO/EN/off, în editorul în română; cel în
  engleză verifică mereu în engleză. Pentru română, Chrome are nevoie de
  dicționarul românesc instalat (Setări → Limbi → adaugă Română).
- **Ascuns:** articolul rămâne salvat dar dispare de pe site.

Butonul **→ EN** de lângă titlu traduce titlul. Cel de lângă **Conținut (RO)**
traduce tot articolul în editorul **Conținut (EN)**, cu formatare cu tot:
titlurile, listele, textul îngroșat, linkurile, alinierea, imaginile și
videourile rămân la locul lor. Dacă ai deja un text în engleză, te întreabă
înainte să-l înlocuiască, iar dacă te răzgândești, **Desfă** din bara
editorului în engleză îl aduce înapoi. E o traducere automată — merită citită
înainte de publicare.

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
| Cerere testimonial | Deocamdată nu pleacă niciodată: site-ul nu are încă butonul care să-l trimită. |

Fiecare confirmare are atașată invitația pentru calendar, cu ora corectă a
României.

---

## 8. Când ceva nu merge

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
