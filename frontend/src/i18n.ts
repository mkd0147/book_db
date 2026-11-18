import { useSyncExternalStore } from "react";

export type Language = "en" | "cs" | "sk";
const storageKey = "bookdb.language";
function nativeLanguage() {
  return typeof window === "undefined" ? undefined :
    (window as Window & {BookDBLanguage?: {getLanguage(): string; setLanguage(value: string): void}}).BookDBLanguage;
}
export function detectLanguage(saved: string | null, browser = "en"): Language {
  if (saved === "en" || saved === "cs" || saved === "sk") return saved;
  const base = browser.toLowerCase().split("-")[0];
  return base === "cs" || base === "sk" ? base : "en";
}
let language: Language = "en";
try {
  language = detectLanguage(
    nativeLanguage()?.getLanguage() || localStorage.getItem(storageKey),
    navigator.language,
  );
} catch {
  /* Storage may be unavailable. */
}
const listeners = new Set<() => void>();
export function setLanguage(value: Language) {
  language = value;
  try {
    localStorage.setItem(storageKey, value);
    nativeLanguage()?.setLanguage(value);
  } catch {
    /* Keep working in memory. */
  }
  if (typeof document !== "undefined") document.documentElement.lang = value;
  listeners.forEach((listener) => listener());
}
if (typeof document !== "undefined") document.documentElement.lang = language;
try { nativeLanguage()?.setLanguage(language); } catch { /* Optional native preference. */ }
export function useLanguage() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => language,
    () => "en" as Language,
  );
}
export function number(value: number, digits?: number) {
  return new Intl.NumberFormat(
    language,
    digits === undefined
      ? {}
      : { minimumFractionDigits: digits, maximumFractionDigits: digits },
  ).format(value);
}
export const messages: Record<string, { cs: string; sk: string }> = {};
const catalog = `Curated lists|Výběrové seznamy|Výberové zoznamy
Inspect selected version|Prohlédnout vybranou verzi|Prezrieť vybranú verziu
Google Drive returned incomplete library history. Sync was cancelled; retry later.|Google Drive vrátil neúplnou historii knihovny. Synchronizace byla zrušena; zkuste to později.|Google Drive vrátil neúplnú históriu knižnice. Synchronizácia bola zrušená; skúste to neskôr.
User guide|Uživatelská příručka|Používateľská príručka
Find accessible cloud libraries|Najít dostupné cloudové knihovny|Nájsť dostupné cloudové knižnice
More cloud libraries|Další cloudové knihovny|Ďalšie cloudové knižnice
Only libraries already accessible to BookDB appear here. Sharing a folder may require additional authorization.|Zobrazují se pouze knihovny, ke kterým má BookDB přístup. Sdílení složky může vyžadovat další oprávnění.|Zobrazujú sa iba knižnice, ku ktorým má BookDB prístup. Zdieľanie priečinka môže vyžadovať ďalšie oprávnenie.
Books in selected version|Knihy ve vybrané verzi|Knihy vo vybranej verzii
Your library works offline. Use the synchronization controls to upload or download books.|Knihovna funguje offline. Pro nahrávání a stahování knih použijte ovládání synchronizace.|Knižnica funguje offline. Na nahrávanie a sťahovanie kníh použite ovládanie synchronizácie.
Library synchronization|Synchronizace knihovny|Synchronizácia knižnice
Sync applies to the selected library profile. Connect Google above first.|Synchronizace platí pro vybraný profil knihovny. Nejprve připojte Google výše.|Synchronizácia platí pre vybraný profil knižnice. Najprv pripojte Google vyššie.
Reload to use the updated library and permissions.|Znovu načtěte aktualizovanou knihovnu a oprávnění.|Znova načítajte aktualizovanú knižnicu a oprávnenia.
Cloud library linked. Reload, then choose Sync now to download its books.|Cloudová knihovna je propojena. Znovu ji načtěte a poté zvolte Synchronizovat nyní pro stažení knih.|Cloudová knižnica je prepojená. Znova ju načítajte a potom zvoľte Synchronizovať teraz na stiahnutie kníh.
Reload library|Znovu načíst knihovnu|Znova načítať knižnicu
Cloud library name|Název cloudové knihovny|Názov cloudovej knižnice
Create cloud library|Vytvořit cloudovou knihovnu|Vytvoriť cloudovú knižnicu
Existing Google Drive folder ID|ID existující složky Google Disku|ID existujúceho priečinka Google Disku
Link cloud library|Propojit cloudovou knihovnu|Prepojiť cloudovú knižnicu
Open another person's library in a new empty profile. It will be read-only.|Knihovnu jiné osoby otevřete v novém prázdném profilu. Bude pouze pro čtení.|Knižnicu inej osoby otvorte v novom prázdnom profile. Bude iba na čítanie.
Cloud library|Cloudová knihovna|Cloudová knižnica
Open in Google Drive|Otevřít v Google Disku|Otvoriť v Google Disku
To let someone view this library, open its Google Drive folder, choose Share, and add their Google account as Viewer. Connecting Google alone does not share your library.|Chcete-li někomu umožnit prohlížení knihovny, otevřete její složku na Google Disku, zvolte Sdílet a přidejte jeho účet Google s oprávněním Čtenář. Samotné připojení ke Googlu knihovnu nesdílí.|Ak chcete niekomu umožniť prezeranie knižnice, otvorte jej priečinok na Disku Google, zvoľte Zdieľať a pridajte jeho účet Google s oprávnením Čitateľ. Samotné pripojenie ku Googlu knižnicu nezdieľa.
Your library|Vaše knihovna|Vaša knižnica
Synchronizing…|Synchronizuji…|Synchronizujem…
Sync now|Synchronizovat nyní|Synchronizovať teraz
Synchronization finished.|Synchronizace dokončena.|Synchronizácia dokončená.
Conflicting library versions|Konfliktní verze knihovny|Konfliktné verzie knižnice
Choose one complete library. Changes are not merged; earlier cloud versions and local recovery copies are retained.|Vyberte jednu celou knihovnu. Změny se neslučují; starší cloudové verze a místní kopie pro obnovu zůstávají zachovány.|Vyberte jednu celú knižnicu. Zmeny sa nezlučujú; staršie cloudové verzie a miestne kópie na obnovenie zostávajú zachované.
The owner must resolve this conflict.|Tento konflikt musí vyřešit vlastník.|Tento konflikt musí vyriešiť vlastník.
Keep this device's library|Ponechat knihovnu tohoto zařízení|Ponechať knižnicu tohto zariadenia
Cloud version {number}: {books} books, {sessions} reading sessions|Cloudová verze {number}: {books} knih, {sessions} čtení|Cloudová verzia {number}: {books} kníh, {sessions} čítaní
Use the selected complete library on this device and in the cloud?|Použít vybranou celou knihovnu na tomto zařízení i v cloudu?|Použiť vybranú celú knižnicu na tomto zariadení aj v cloude?
Apply selected version|Použít vybranou verzi|Použiť vybranú verziu
This library was replaced by synchronization. Reload the page before editing.|Knihovna byla nahrazena synchronizací. Před úpravami znovu načtěte stránku.|Knižnica bola nahradená synchronizáciou. Pred úpravami znova načítajte stránku.
Refresh|Obnovit|Obnoviť
{count} books|{count} knih|{count} kníh
Recovery copies|Kopie pro obnovu|Kópie na obnovenie
Before cloud data replaces this library, BookDB keeps a recovery copy. Download one to inspect or import into a new profile.|Před nahrazením knihovny daty z cloudu BookDB uloží kopii pro obnovu. Stáhněte ji pro kontrolu nebo import do nového profilu.|Pred nahradením knižnice údajmi z cloudu BookDB uloží kópiu na obnovenie. Stiahnite ju na kontrolu alebo import do nového profilu.
No recovery copies yet.|Zatím nejsou žádné kopie pro obnovu.|Zatiaľ nie sú žiadne kópie na obnovenie.
Download recovery copy|Stáhnout kopii pro obnovu|Stiahnuť kópiu na obnovenie
Recovery history is available only for your own library.|Historie obnovy je dostupná pouze pro vlastní knihovnu.|História obnovenia je dostupná iba pre vlastnú knižnicu.
Recovery copy not found.|Kopie pro obnovu nebyla nalezena.|Kópia na obnovenie sa nenašla.
Invalid Google authorization address.|Neplatná adresa autorizace Googlu.|Neplatná adresa autorizácie Googlu.
Google Drive connection|Připojení ke Google Disku|Pripojenie ku Google Disku
Your library works offline. Connecting Google does not upload any books yet.|Knihovna funguje offline. Připojení ke Googlu zatím nenahrává žádné knihy.|Knižnica funguje offline. Pripojenie ku Googlu zatiaľ nenahráva žiadne knihy.
Google connection is not available in this installation yet.|Připojení ke Googlu zatím není v této instalaci dostupné.|Pripojenie ku Googlu zatiaľ nie je v tejto inštalácii dostupné.
Google connected on this device|Google je na tomto zařízení připojen|Google je na tomto zariadení pripojený
Google disconnected|Google není připojen|Google nie je pripojený
Google authorization failed. Please try again.|Autorizace Googlu se nezdařila. Zkuste to znovu.|Autorizácia Googlu zlyhala. Skúste to znova.
Google authorization expired. Please try again.|Autorizace Googlu vypršela. Zkuste to znovu.|Autorizácia Googlu vypršala. Skúste to znova.
Complete authorization in your browser, then return here.|Dokončete autorizaci v prohlížeči a vraťte se sem.|Dokončite autorizáciu v prehliadači a vráťte sa sem.
Continue to Google|Pokračovat na Google|Pokračovať na Google
Connect Google Drive|Připojit Google Disk|Pripojiť Google Disk
Change Google account|Změnit účet Google|Zmeniť účet Google
The Google connection is shared by all library profiles on this device. Changing accounts keeps your local books.|Připojení Google je společné pro všechny profily knihoven na tomto zařízení. Změna účtu zachová místní knihy.|Pripojenie Google je spoločné pre všetky profily knižníc na tomto zariadení. Zmena účtu zachová miestne knihy.
Choose shared files in Google Drive|Vybrat sdílené soubory na Google Disku|Vybrať zdieľané súbory na Google Disku
Disconnect this device|Odpojit toto zařízení|Odpojiť toto zariadenie
Google connection is unavailable. Check configuration or reconnect.|Připojení ke Googlu není dostupné. Zkontrolujte nastavení nebo se znovu připojte.|Pripojenie ku Googlu nie je dostupné. Skontrolujte nastavenia alebo sa znova pripojte.
Undo completion|Zrušit dokončení|Zrušiť dokončenie
Only completed reading sessions can be reopened.|Znovu otevřít lze pouze dokončená čtení.|Znovu otvoriť možno iba dokončené čítania.
Not started|Nezahájeno|Nezačaté
Start date|Datum zahájení|Dátum začatia
Undo start|Zrušit zahájení|Zrušiť začatie
Add a book to the tracker|Přidat knihu do sledování čtení|Pridať knihu do sledovania čítania
Already in tracker|Již ve sledování|Už v sledovaní
Add to tracker|Přidat do sledování|Pridať do sledovania
Choose a start date to unlock reading actions. Undo start preserves other logged days.|Zvolte datum zahájení pro zpřístupnění akcí čtení. Zrušení zahájení zachová ostatní zaznamenané dny.|Zvoľte dátum začatia na sprístupnenie akcií čítania. Zrušenie začatia zachová ostatné zaznamenané dni.
Reading has already started. Undo start first.|Čtení již začalo. Nejprve zrušte zahájení.|Čítanie už začalo. Najprv zrušte začatie.
Choose a start date on or before existing reading days.|Zvolte datum zahájení nejpozději v první zaznamenaný den.|Zvoľte dátum začatia najneskôr v prvý zaznamenaný deň.
Reading start changed. Refresh and try again.|Zahájení čtení se změnilo. Obnovte stránku a zkuste to znovu.|Začatie čítania sa zmenilo. Obnovte stránku a skúste to znova.
Choose a start date before logging reading.|Před zaznamenáním čtení zvolte datum zahájení.|Pred zaznamenaním čítania zvoľte dátum začatia.
Reading days cannot precede the start date.|Dny čtení nemohou předcházet datu zahájení.|Dni čítania nemôžu predchádzať dátumu začatia.
Library profile|Profil knihovny|Profil knižnice
New library|Nová knihovna|Nová knižnica
Library name|Název knihovny|Názov knižnice
Create library|Vytvořit knihovnu|Vytvoriť knižnicu
Read-only|Pouze pro čtení|Iba na čítanie
Retry|Zkusit znovu|Skúsiť znova
This shared library is read-only.|Tato sdílená knihovna je pouze pro čtení.|Táto zdieľaná knižnica je iba na čítanie.
Switch libraries? Unsaved form changes will be discarded.|Přepnout knihovnu? Neuložené změny formuláře budou ztraceny.|Prepnúť knižnicu? Neuložené zmeny formulára sa stratia.
Library profile not found.|Profil knihovny nebyl nalezen.|Profil knižnice sa nenašiel.
Conflicting library profile selection.|Výběr profilu knihovny je nejednoznačný.|Výber profilu knižnice je nejednoznačný.
Loans|Výpůjčky|Výpožičky
Reading tracker|Čtenářský deník|Čitateľský denník
Number of pages|Počet stran|Počet strán
Currently reading|Právě čtu|Práve čítam
Completed|Dočteno|Dočítané
Stopped without completion|Odloženo bez dočtení|Odložené bez dočítania
Reading history|Historie čtení|História čítania
No reading history yet.|Zatím žádné záznamy o čtení.|Zatiaľ žiadne záznamy o čítaní.
In progress|Probíhá|Prebieha
Reading days|Dny čtení|Dni čítania
Reading pace|Tempo čtení|Tempo čítania
{pace} pages/day|{pace} stran/den|{pace} strán/deň
Start reading a book|Začít číst knihu|Začať čítať knihu
Start reading|Začít číst|Začať čítať
Stop reading {title} without completion on {date}?|Odložit knihu {title} bez dočtení dne {date}?|Odložiť knihu {title} bez dočítania dňa {date}?
Mark {title} completed on {date}?|Označit knihu {title} jako dočtenou dne {date}?|Označiť knihu {title} ako dočítanú dňa {date}?
Previous month|Předchozí měsíc|Predchádzajúci mesiac
Next month|Další měsíc|Ďalší mesiac
Current month|Aktuální měsíc|Aktuálny mesiac
Calendar month|Měsíc|Mesiac
Calendar day|Den|Deň
Use + to log a reading day, − to undo it, ■ to stop, and ✓ to complete the book. Only today and past days can be logged.|Pomocí + zaznamenejte den čtení, − záznam zrušte, ■ odložte knihu a ✓ ji označte jako dočtenou. Zapisovat lze pouze dnešní a minulé dny.|Pomocou + zaznamenajte deň čítania, − záznam zrušte, ■ odložte knihu a ✓ ju označte ako dočítanú. Zapisovať možno iba dnešné a minulé dni.
Pace = number of pages / logged reading days. It is an estimate until the book is completed.|Tempo = počet stran / zaznamenané dny čtení. Do dočtení knihy jde o odhad.|Tempo = počet strán / zaznamenané dni čítania. Do dočítania knihy ide o odhad.
No books tracked in this month. Search your collection above to start.|V tomto měsíci nejsou sledované knihy. Začněte vyhledáním knihy ve sbírce výše.|V tomto mesiaci nie sú sledované knihy. Začnite vyhľadaním knihy v zbierke vyššie.
Remove reading day|Odstranit den čtení|Odstrániť deň čítania
Log reading day|Zaznamenat den čtení|Zaznamenať deň čítania
Stop without completion|Odložit bez dočtení|Odložiť bez dočítania
Complete book|Dočíst knihu|Dočítať knihu
Reading day logged|Zaznamenaný den čtení|Zaznamenaný deň čítania
No reading logged|Bez záznamu čtení|Bez záznamu čítania
{action}: {title}, {date}|{action}: {title}, {date}|{action}: {title}, {date}
This book is already being read.|Tuto knihu již právě čtete.|Túto knihu už práve čítate.
This reading session has ended. Start it again to track a reread.|Toto čtení již skončilo. Pro opakované čtení knihu znovu přidejte.|Toto čítanie už skončilo. Pre opakované čítanie knihu znova pridajte.
Reading can only be logged for today or earlier.|Čtení lze zaznamenat pouze pro dnešek nebo minulost.|Čítanie možno zaznamenať iba pre dnešok alebo minulosť.
Remove later reading days before ending on this date.|Před ukončením k tomuto datu odstraňte pozdější dny čtení.|Pred ukončením k tomuto dátumu odstráňte neskoršie dni čítania.
Reading changed. Refresh and try again.|Záznam čtení se změnil. Obnovte stránku a zkuste to znovu.|Záznam čítania sa zmenil. Obnovte stránku a skúste to znova.
Returned loans appear here after you mark a book returned.|Vrácené výpůjčky se zde zobrazí po označení knihy jako vrácené.|Vrátené výpožičky sa tu zobrazia po označení knihy ako vrátenej.
Lend a book|Půjčit knihu|Požičať knihu
Record loan|Zapsat výpůjčku|Zapísať výpožičku
Choose another book|Vybrat jinou knihu|Vybrať inú knihu
Already lent to {borrower}|Již půjčeno: {borrower}|Už požičané: {borrower}
Filter loan records|Filtrovat záznamy výpůjček|Filtrovať záznamy výpožičiek
Search your collection above to record a new loan.|Vyhledejte knihu ve sbírce výše a zapište novou výpůjčku.|Vyhľadajte knihu v zbierke vyššie a zapíšte novú výpožičku.
This book is already lent out. Mark it returned before recording a new loan.|Tato kniha je již půjčená. Před novou výpůjčkou ji označte jako vrácenou.|Táto kniha je už požičaná. Pred novou výpožičkou ju označte ako vrátenú.
Lent books|Půjčené knihy|Požičané knihy
Returned books|Vrácené knihy|Vrátené knihy
Date returned|Datum vrácení|Dátum vrátenia
Returned loans: {count}|Vrácené výpůjčky: {count}|Vrátené výpožičky: {count}
No returned loans yet|Zatím žádné vrácené výpůjčky|Zatiaľ žiadne vrátené výpožičky
Save the book to record changes. Returned loans remain in loan history.|Změny potvrďte uložením knihy. Vrácené výpůjčky zůstávají v historii.|Zmeny potvrďte uložením knihy. Vrátené výpožičky zostávajú v histórii.
Loan details|Podrobnosti výpůjčky|Podrobnosti výpožičky
Borrower|Komu půjčeno|Komu požičané
Date lent|Datum půjčení|Dátum požičania
Actions|Akce|Akcie
For books you lend to someone else. Leave both fields empty when the book is not on loan.|Pro knihy, které půjčujete někomu jinému. Pokud kniha není půjčená, ponechte obě pole prázdná.|Pre knihy, ktoré požičiavate niekomu inému. Ak kniha nie je požičaná, ponechajte obe polia prázdne.
Clear loan (returned)|Zrušit výpůjčku (vráceno)|Zrušiť výpožičku (vrátené)
Mark {title} as returned?|Označit knihu {title} jako vrácenou?|Označiť knihu {title} ako vrátenú?
Search loans|Hledat výpůjčky|Hľadať výpožičky
Search title, author, or borrower…|Hledat název, autora nebo vypůjčitele…|Hľadať názov, autora alebo vypožičiavateľa…
Active loans: {count}|Aktivní výpůjčky: {count}|Aktívne výpožičky: {count}
No matching loans|Žádné odpovídající výpůjčky|Žiadne zodpovedajúce výpožičky
No books on loan|Žádné půjčené knihy|Žiadne požičané knihy
Open a book’s details to enter its borrower and loan date.|Otevřete podrobnosti knihy a zadejte, komu a kdy jste ji půjčili.|Otvorte podrobnosti knihy a zadajte, komu a kedy ste ju požičali.
Mark returned|Označit jako vrácené|Označiť ako vrátené
Keep track of books you have lent out.|Mějte přehled o knihách, které jste půjčili.|Majte prehľad o knihách, ktoré ste požičali.
Loan date must be a calendar date (YYYY-MM-DD).|Datum půjčení musí být platné datum (RRRR-MM-DD).|Dátum požičania musí byť platný dátum (RRRR-MM-DD).
Enter both borrower and loan date, or clear both to mark the book returned.|Vyplňte vypůjčitele i datum půjčení, nebo obě pole vymažte pro vrácení knihy.|Vyplňte vypožičiavateľa aj dátum požičania, alebo obe polia vymažte pre vrátenie knihy.
Collection|Sbírka|Zbierka
Greatest Books|Nejlepší knihy|Najlepšie knihy
Series|Série|Série
Statistics|Statistiky|Štatistiky
Import / Export|Import / Export|Import / Export
Settings|Nastavení|Nastavenia
Language|Jazyk|Jazyk
A personal library|Osobní knihovna|Osobná knižnica
Local & private|Místní a soukromé|Lokálne a súkromné
Your books. On your computer.|Vaše knihy. Ve vašem počítači.|Vaše knihy. Vo vašom počítači.
YOUR LIBRARY /|VAŠE KNIHOVNA /|VAŠA KNIŽNICA /
+ Add book|+ Přidat knihu|+ Pridať knihu
Every book, one place. Keep track of what you own, read, and want to discover.|Všechny knihy na jednom místě. Sledujte, co vlastníte, čtete a chcete objevit.|Všetky knihy na jednom mieste. Sledujte, čo vlastníte, čítate a chcete objaviť.
Explore curated reading lists and follow your progress.|Procházejte výběrové seznamy knih a sledujte svůj pokrok.|Prezerajte výberové zoznamy kníh a sledujte svoj pokrok.
Keep the next book in sight.|Mějte přehled o dalších knihách v sérii.|Majte prehľad o ďalších knihách v sérii.
A little perspective on your reading life.|Přehled vašeho čtenářského života.|Prehľad vášho čitateľského života.
Bring your library with you. Keep a copy close.|Vezměte si knihovnu s sebou. Uchovávejte zálohu.|Vezmite si knižnicu so sebou. Uchovávajte zálohu.
Your local workspace.|Váš místní pracovní prostor.|Váš lokálny pracovný priestor.
Dismiss|Zavřít|Zavrieť
Made for the books you keep.|Pro knihy, které si uchováváte.|Pre knihy, ktoré si uchovávate.
Author|Autor|Autor
English title|Anglický název|Anglický názov
Czech title|Český název|Český názov
Slovak title|Slovenský název|Slovenský názov
Release year|Rok vydání|Rok vydania
Czech translation year|Rok českého překladu|Rok českého prekladu
Slovak translation year|Rok slovenského překladu|Rok slovenského prekladu
Expected price|Očekávaná cena|Očakávaná cena
Year|Rok|Rok
CZ / SK|CZ / SK|CZ / SK
CZ / SK title|Český / slovenský název|Český / slovenský názov
Owned|Vlastním|Vlastním
Read|Přečteno|Prečítané
Rating|Hodnocení|Hodnotenie
Watch|Sleduji|Sledujem
Wish|Chci|Chcem
Price|Cena|Cena
Series #|Pořadí v sérii|Poradie v sérii
← Previous|← Předchozí|← Predchádzajúca
Next →|Další →|Ďalej →
Search books|Hledat knihy|Hľadať knihy
Search title, author, or series…|Hledat název, autora nebo sérii…|Hľadať názov, autora alebo sériu…
entries|položek|položiek
books|knih|kníh
Ownership|Vlastnictví|Vlastníctvo
Not owned|Nevlastním|Nevlastním
Reading|Čtení|Čítanie
Unread|Nepřečteno|Neprečítané
Translation|Překlad|Preklad
CZ or SK|Český nebo slovenský|Český alebo slovenský
No known CZ/SK|Bez známého CZ/SK překladu|Bez známeho CZ/SK prekladu
Watchlist|Sledované|Sledované
Wishlist|Seznam přání|Zoznam prianí
On watchlist|Sledované|Sledované
Off watchlist|Nesledované|Nesledované
On wishlist|Na seznamu přání|Na zozname prianí
Off wishlist|Mimo seznam přání|Mimo zoznamu prianí
: all|: vše|: všetko
Rating filter|Filtr hodnocení|Filter hodnotenia
Rating: all|Hodnocení: vše|Hodnotenie: všetko
stars|hvězdiček|hviezdičiek
Series filter|Filtr sérií|Filter sérií
All series|Všechny série|Všetky série
Curated list filter|Filtr seznamů|Filter zoznamov
All curated lists|Všechny seznamy|Všetky zoznamy
Clear filters|Zrušit filtry|Zrušiť filtre
Click or drag rows to select. Ctrl-click adds/removes rows; Shift-click selects a range. Selection stays on this page. A checkbox in a selected row applies to all selected books.|Řádky vyberete kliknutím nebo tažením. Ctrl-klik přidá či odebere řádek, Shift-klik vybere rozsah. Výběr platí na této stránce. Zaškrtávací políčko ve vybraném řádku upraví všechny vybrané knihy.|Riadky vyberiete kliknutím alebo ťahaním. Ctrl-klik pridá či odoberie riadok, Shift-klik vyberie rozsah. Výber platí na tejto stránke. Zaškrtávacie políčko vo vybranom riadku upraví všetky vybrané knihy.
Batch edit selected books|Hromadná úprava vybraných knih|Hromadná úprava vybraných kníh
selected|vybráno|vybraných
CZ/SK available|Dostupný CZ/SK překlad|Dostupný CZ/SK preklad
Keep unchanged|Ponechat beze změny|Ponechať bez zmeny
Yes|Ano|Áno
No|Ne|Nie
Saving…|Ukládání…|Ukladanie…
Apply changes|Použít změny|Použiť zmeny
Clear selection|Zrušit výběr|Zrušiť výber
Select all books on this page|Vybrat všechny knihy na stránce|Vybrať všetky knihy na stránke
On list|Na seznamu|Na zozname
Not on list|Mimo seznam|Mimo zoznamu
Not entered|Neuvedeno|Neuvedené
Collapse|Sbalit|Zbaliť
Expand|Rozbalit|Rozbaliť
Loading…|Načítání…|Načítavanie…
Updating…|Aktualizace…|Aktualizácia…
Loading your books…|Načítání knih…|Načítavanie kníh…
No matching books|Žádné odpovídající knihy|Žiadne zodpovedajúce knihy
A place for your next chapter|Místo pro vaši další kapitolu|Miesto pre vašu ďalšiu kapitolu
Try another search or clear the filters.|Zkuste jiné hledání nebo zrušte filtry.|Skúste iné hľadanie alebo zrušte filtre.
Add a book or import a list to start building your library.|Začněte přidáním knihy nebo importem seznamu.|Začnite pridaním knihy alebo importom zoznamu.
0 books|0 knih|0 kníh
BOOK DETAILS|PODROBNOSTI KNIHY|PODROBNOSTI KNIHY
Edit book|Upravit knihu|Upraviť knihu
Add a book|Přidat knihu|Pridať knihu
Close book editor|Zavřít úpravu knihy|Zavrieť úpravu knihy
Entry type|Typ položky|Typ položky
A book|Kniha|Kniha
A book series|Knižní série|Knižná séria
No series|Bez série|Bez série
Book rating|Hodnocení knihy|Hodnotenie knihy
Clear|Vymazat|Vymazať
A Czech or Slovak title automatically marks that translation as available. Clearing the title keeps the flag; you can then uncheck it if needed.|Český nebo slovenský název automaticky označí překlad jako dostupný. Vymazání názvu označení zachová; poté ho můžete podle potřeby zrušit.|Český alebo slovenský názov automaticky označí preklad ako dostupný. Vymazanie názvu označenie zachová; potom ho môžete podľa potreby zrušiť.
CZ/SK translation (either language)|CZ/SK překlad (kterýkoli jazyk)|CZ/SK preklad (ktorýkoľvek jazyk)
CZ/SK translation|CZ/SK překlad|CZ/SK preklad
Czech translation|Český překlad|Český preklad
Slovak translation|Slovenský překlad|Slovenský preklad
Notes|Poznámky|Poznámky
Appears in|V seznamech|V zoznamoch
Unranked|Bez pořadí|Bez poradia
In this series|V této sérii|V tejto sérii
Discard unsaved changes?|Zahodit neuložené změny?|Zahodiť neuložené zmeny?
Delete this book and its curated-list memberships?|Smazat tuto knihu i její zařazení do seznamů?|Vymazať túto knihu aj jej zaradenie do zoznamov?
Delete book|Smazat knihu|Vymazať knihu
Cancel|Zrušit|Zrušiť
Save book|Uložit knihu|Uložiť knihu
Books|Knihy|Knihy
CZ / SK translated|S CZ/SK překladem|S CZ/SK prekladom
No known CZ / SK|Bez známého CZ/SK překladu|Bez známeho CZ/SK prekladu
← All|← Všechny|← Všetky
Edit|Upravit|Upraviť
Delete|Smazat|Vymazať
ranked entries, including|seřazených položek, z toho|zoradených položiek, z toho
series. Progress above counts the|sérií. Pokrok výše počítá|sérií. Pokrok vyššie počíta
distinct books represented by this list.|jednotlivých knih zastoupených v tomto seznamu.|jednotlivých kníh zastúpených v tomto zozname.
Original author:|Původní autor:|Pôvodný autor:
Czech name:|Český název:|Český názov:
Slovak name:|Slovenský název:|Slovenský názov:
Czech:|Česky:|Česky:
· Slovak:|· Slovensky:|· Slovensky:
Assign an existing book|Přiřadit existující knihu|Priradiť existujúcu knihu
View source|Zobrazit zdroj|Zobraziť zdroj
View books →|Zobrazit knihy →|Zobraziť knihy →
A reading list worth exploring|Seznam knih k objevování|Zoznam kníh na objavovanie
Every story has a place|Každý příběh má své místo|Každý príbeh má svoje miesto
Import a curated list below, or create your own.|Importujte seznam níže nebo si vytvořte vlastní.|Importujte zoznam nižšie alebo si vytvorte vlastný.
Create a series, then assign books from their edit forms.|Vytvořte sérii a přiřaďte knihy v jejich formulářích.|Vytvorte sériu a priraďte knihy v ich formulároch.
Create|Vytvořit|Vytvoriť
a list|seznam|zoznam
a series|sérii|sériu
Name|Název|Názov
Original author|Původní autor|Pôvodný autor
Import from Digital Dream Door|Import z Digital Dream Door|Import z Digital Dream Door
Fetch once, review, then keep the list offline. Refreshes replace list memberships and ranks while preserving all personal book details.|Načtěte seznam, zkontrolujte ho a uchovejte offline. Obnovení nahradí položky a pořadí v seznamu a zachová všechny osobní údaje knih.|Načítajte zoznam, skontrolujte ho a uchovajte offline. Obnovenie nahradí položky a poradie v zozname a zachová všetky osobné údaje kníh.
Source URL|URL zdroje|URL zdroja
Working…|Zpracování…|Spracovanie…
Preview source|Náhled zdroje|Náhľad zdroja
Exact matches reuse the same book automatically. If possible matches need review, choices will appear below before anything is imported.|Přesné shody automaticky použijí stejnou knihu. Případné podobné knihy se zobrazí níže ke kontrole před importem.|Presné zhody automaticky použijú rovnakú knihu. Prípadné podobné knihy sa zobrazia nižšie na kontrolu pred importom.
Reviewed import JSON|Zkontrolovaný import JSON|Skontrolovaný import JSON
Preview appears here. You can also paste a saved preview.|Zde se zobrazí náhled. Můžete vložit i uložený náhled.|Tu sa zobrazí náhľad. Môžete vložiť aj uložený náhľad.
Import with these choices|Importovat s těmito volbami|Importovať s týmito voľbami
Import reviewed list|Importovat zkontrolovaný seznam|Importovať skontrolovaný zoznam
Save details|Uložit podrobnosti|Uložiť podrobnosti
Book assigned.|Kniha přiřazena.|Kniha priradená.
Search existing books|Hledat existující knihy|Hľadať existujúce knihy
Book|Kniha|Kniha
Choose a book|Vyberte knihu|Vyberte knihu
Rank|Pořadí|Poradie
Series position|Pořadí v sérii|Poradie v sérii
Assign|Přiřadit|Priradiť
Loading statistics…|Načítání statistik…|Načítavanie štatistík…
On your shelves|Ve vaší knihovně|Vo vašej knižnici
Unread owned books|Vlastněné nepřečtené knihy|Vlastnené neprečítané knihy
Average rating|Průměrné hodnocení|Priemerné hodnotenie
No ratings yet|Zatím bez hodnocení|Zatiaľ bez hodnotení
In your language|Ve vašem jazyce|Vo vašom jazyku
Czech translation known|Známý český překlad|Známy český preklad
Slovak translation known|Známý slovenský překlad|Známy slovenský preklad
Either Czech or Slovak|Český nebo slovenský|Český alebo slovenský
No known Czech / Slovak translation|Bez známého českého / slovenského překladu|Bez známeho českého / slovenského prekladu
Knihobot plans|Plány pro Knihobot|Plány pre Knihobot
Watchlist expected total|Očekávaná cena sledovaných knih|Očakávaná cena sledovaných kníh
Wishlist expected total|Očekávaná cena seznamu přání|Očakávaná cena zoznamu prianí
Combined expected total|Celková očekávaná cena|Celková očakávaná cena
Combined total counts each book once. Unknown prices contribute nothing; amounts use your entered currency.|Celková cena počítá každou knihu jednou. Neznámé ceny se nezapočítávají; částky jsou ve vámi zadané měně.|Celková cena počíta každú knihu raz. Neznáme ceny sa nezapočítavajú; sumy sú vo vami zadanej mene.
Progress through the lists|Pokrok v seznamech|Pokrok v zoznamoch
No curated lists yet. Import a list to track your progress.|Zatím nemáte žádné seznamy. Importujte seznam a sledujte svůj pokrok.|Zatiaľ nemáte žiadne zoznamy. Importujte zoznam a sledujte svoj pokrok.
Export your library|Export knihovny|Export knižnice
Download a complete UTF-8 YAML backup, including books, translations, personal details, series, lists and memberships.|Stáhněte úplnou zálohu UTF-8 YAML včetně knih, překladů, osobních údajů, sérií, seznamů a jejich položek.|Stiahnite úplnú zálohu UTF-8 YAML vrátane kníh, prekladov, osobných údajov, sérií, zoznamov a ich položiek.
↓ Download YAML backup|↓ Stáhnout zálohu YAML|↓ Stiahnuť zálohu YAML
Import a backup|Import zálohy|Import zálohy
Validate and preview before importing. Imports are atomic: malformed records leave the database unchanged. Records are matched by identity; backup IDs are remapped.|Před importem ověřte data a zobrazte náhled. Chybné záznamy ponechají databázi beze změny. Záznamy se párují podle identity; ID ze zálohy se přemapují.|Pred importom overte údaje a zobrazte náhľad. Chybné záznamy ponechajú databázu bez zmeny. Záznamy sa párujú podľa identity; ID zo zálohy sa premapujú.
YAML file|Soubor YAML|Súbor YAML
Backup exceeds the 10 MB limit.|Záloha překračuje limit 10 MB.|Záloha prekračuje limit 10 MB.
Backup content|Obsah zálohy|Obsah zálohy
Existing records|Existující záznamy|Existujúce záznamy
Keep existing details (recommended)|Ponechat existující údaje (doporučeno)|Ponechať existujúce údaje (odporúčané)
Overwrite matching records with backup values|Přepsat shodné záznamy údaji ze zálohy|Prepísať zhodné záznamy údajmi zo zálohy
This will replace personal metadata on matching books. Export a current backup first.|Tímto nahradíte osobní údaje u shodných knih. Nejprve exportujte aktuální zálohu.|Týmto nahradíte osobné údaje pri zhodných knihách. Najprv exportujte aktuálnu zálohu.
Validate & preview|Ověřit a zobrazit náhled|Overiť a zobraziť náhľad
Import backup|Importovat zálohu|Importovať zálohu
Preview — no data saved|Náhled — žádná data neuložena|Náhľad — žiadne údaje neuložené
Import complete|Import dokončen|Import dokončený
Local storage|Místní úložiště|Lokálne úložisko
All library data is stored in a SQLite database on this computer.|Všechna data knihovny jsou uložena v databázi SQLite v tomto počítači.|Všetky údaje knižnice sú uložené v databáze SQLite v tomto počítači.
Schema version:|Verze schématu:|Verzia schémy:
Expected prices use the currency you choose when entering them. Use one currency consistently; BookDB does not convert currencies.|Očekávané ceny jsou v měně, kterou zvolíte při zadávání. Používejte jednotnou měnu; BookDB měny nepřevádí.|Očakávané ceny sú v mene, ktorú zvolíte pri zadávaní. Používajte jednotnú menu; BookDB meny neprevádza.
Review possible duplicates|Kontrola možných duplicit|Kontrola možných duplicít
Review|Zkontrolujte|Skontrolujte
possible|možných|možných
match|shod|zhôd
matches|shod|zhôd
Nothing has been imported yet. For each entry, choose the existing book if it is the same work, or create a separate book if it is different. Existing book details will be kept.|Zatím nebylo nic importováno. U každé položky vyberte existující knihu, pokud jde o stejné dílo, nebo vytvořte samostatnou knihu. Údaje existujících knih zůstanou zachovány.|Zatiaľ nebolo nič importované. Pri každej položke vyberte existujúcu knihu, ak ide o rovnaké dielo, alebo vytvorte samostatnú knihu. Údaje existujúcich kníh zostanú zachované.
Same book — use existing|Stejná kniha — použít existující|Rovnaká kniha — použiť existujúcu
(Book #|(Kniha č.|(Kniha č.
Different book — create separately|Jiná kniha — vytvořit samostatně|Iná kniha — vytvoriť samostatne
Add this work to the collection with its own Book ID.|Přidat toto dílo do sbírky s vlastním ID knihy.|Pridať toto dielo do zbierky s vlastným ID knihy.
Rate this book|Ohodnotit knihu|Ohodnotiť knihu
Mark as read to change rating|Pro změnu hodnocení označte jako přečtené|Pre zmenu hodnotenia označte ako prečítané
Unrated|Nehodnoceno|Nehodnotené
0 stars|0 hvězdiček|0 hviezdičiek
Edit series|Upravit sérii|Upraviť sériu
Close series details|Zavřít podrobnosti série|Zavrieť podrobnosti série
Series name|Název série|Názov série
Czech name|Český název|Český názov
Slovak name|Slovenský název|Slovenský názov
These details are shared wherever this series appears. Original author prefills new books; existing book authors stay unchanged.|Tyto údaje se sdílejí všude, kde se série objevuje. Původní autor se předvyplní u nových knih; autoři existujících knih se nemění.|Tieto údaje sa zdieľajú všade, kde sa séria objavuje. Pôvodný autor sa predvyplní pri nových knihách; autori existujúcich kníh sa nemenia.
Edit list entry|Upravit položku seznamu|Upraviť položku zoznamu
Discard unsaved series changes?|Zahodit neuložené změny série?|Zahodiť neuložené zmeny série?
Save series|Uložit sérii|Uložiť sériu
List entry|Položka seznamu|Položka zoznamu
Close series editor|Zavřít úpravu série|Zavrieť úpravu série
Curated list|Výběrový seznam|Výberový zoznam
Choose a list|Vyberte seznam|Vyberte zoznam
Create a new series|Vytvořit novou sérii|Vytvoriť novú sériu
Choose an existing series|Vybrat existující sérii|Vybrať existujúcu sériu
Search series|Hledat série|Hľadať série
Series name or original author|Název série nebo původní autor|Názov série alebo pôvodný autor
Choose a series|Vyberte sérii|Vyberte sériu
No matching series. You can create one above.|Žádná odpovídající série. Novou můžete vytvořit výše.|Žiadna zodpovedajúca séria. Novú môžete vytvoriť vyššie.
List rank|Pořadí v seznamu|Poradie v zozname
This changes only the selected list entry. The existing book, its personal details, and other list memberships are kept. Books are assigned to the series separately.|Změní se pouze vybraná položka seznamu. Existující kniha, její osobní údaje a zařazení v jiných seznamech zůstanou zachovány. Knihy se do série přiřazují samostatně.|Zmení sa iba vybraná položka zoznamu. Existujúca kniha, jej osobné údaje a zaradenie v iných zoznamoch zostanú zachované. Knihy sa do série priraďujú samostatne.
Save series entry|Uložit položku série|Uložiť položku série
Description|Popis|Popis
Source name|Název zdroje|Názov zdroja
Select {title}|Vybrat {title}|Vybrať {title}
Rating: {title}|Hodnocení: {title}|Hodnotenie: {title}
{count} stars|Hvězdičky: {count}|Hviezdičky: {count}
{action} series {series} for {title}|{action} sérii {series} u knihy {title}|{action} sériu {series} pri knihe {title}
Parsed {count} entries. Review before importing.|Načtené položky: {count}. Před importem je zkontrolujte.|Načítané položky: {count}. Pred importom ich skontrolujte.
Imported {entries} entries: {created} new books, {reused} existing books, {series} series.|Importované položky: {entries}. Nové knihy: {created}, existující knihy: {reused}, série: {series}.|Importované položky: {entries}. Nové knihy: {created}, existujúce knihy: {reused}, série: {series}.
Delete this list and its memberships? Books will be kept.|Smazat tento seznam a jeho položky? Knihy zůstanou zachovány.|Vymazať tento zoznam a jeho položky? Knihy zostanú zachované.
Delete this series? Books will be kept.|Smazat tuto sérii? Knihy zůstanou zachovány.|Vymazať túto sériu? Knihy zostanú zachované.
{start}–{end} of {total}|{start}–{end} z {total}|{start}–{end} z {total}
{label}: {created} new, {matched} matched, {updated} updated|{label}: nové: {created}, shodné: {matched}, aktualizované: {updated}|{label}: nové: {created}, zhodné: {matched}, aktualizované: {updated}
Memberships|Zařazení|Zaradenia
{status} in {list}|{status} v seznamu {list}|{status} v zozname {list}
Choose how to handle every possible match before importing.|Před importem vyberte řešení pro každou možnou shodu.|Pred importom vyberte riešenie pre každú možnú zhodu.
The preview changed. Check the list again before resolving matches.|Náhled se změnil. Před řešením shod znovu zkontrolujte seznam.|Náhľad sa zmenil. Pred riešením zhôd znova skontrolujte zoznam.
Choose one of the displayed books.|Vyberte jednu ze zobrazených knih.|Vyberte jednu zo zobrazených kníh.
Record not found|Záznam nenalezen|Záznam sa nenašiel
This record already exists or references a missing record.|Tento záznam již existuje nebo odkazuje na chybějící záznam.|Tento záznam už existuje alebo odkazuje na chýbajúci záznam.
A book with this author and title already exists.|Kniha s tímto autorem a názvem již existuje.|Kniha s týmto autorom a názvom už existuje.
Mark this book as read before changing its rating in the table.|Před změnou hodnocení v tabulce označte knihu jako přečtenou.|Pred zmenou hodnotenia v tabuľke označte knihu ako prečítanú.
The entry is no longer in this list.|Položka již není v tomto seznamu.|Položka už nie je v tomto zozname.
This series is already in the list. No changes were made.|Série již je v seznamu. Nebyly provedeny žádné změny.|Séria už je v zozname. Neboli vykonané žiadne zmeny.
Series name or membership already exists. No changes were made.|Název série nebo její zařazení již existuje. Nebyly provedeny žádné změny.|Názov série alebo jej zaradenie už existuje. Neboli vykonané žiadne zmeny.
Membership not found|Zařazení nenalezeno|Zaradenie sa nenašlo
Choose an existing series or create a new series.|Vyberte existující sérii nebo vytvořte novou.|Vyberte existujúcu sériu alebo vytvorte novú.
Choose only one entry to replace.|Vyberte pouze jednu položku k nahrazení.|Vyberte iba jednu položku na nahradenie.
This list name already belongs to a different source.|Tento název seznamu již patří jinému zdroji.|Tento názov zoznamu už patrí inému zdroju.
Multiple entries link to the same canonical book.|Více položek odkazuje na stejnou knihu.|Viaceré položky odkazujú na rovnakú knihu.
Possible duplicates need review. Link a book_id or explicitly set create_separate for each entry, then retry.|Možné duplicity vyžadují kontrolu. U každé položky vyberte existující nebo samostatnou knihu a opakujte import.|Možné duplicity vyžadujú kontrolu. Pri každej položke vyberte existujúcu alebo samostatnú knihu a zopakujte import.
Conflicting list name or duplicate entries. Nothing imported.|Konfliktní název seznamu nebo duplicitní položky. Nic nebylo importováno.|Konfliktný názov zoznamu alebo duplicitné položky. Nič nebolo importované.
Could not connect to BookDB. Check that the launcher is running.|Nelze se připojit k BookDB. Zkontrolujte, zda je aplikace spuštěna.|Nedá sa pripojiť k BookDB. Skontrolujte, či je aplikácia spustená.
Check the entered values.|Zkontrolujte zadané hodnoty.|Skontrolujte zadané hodnoty.
Required field|Povinné pole|Povinné pole
Invalid value|Neplatná hodnota|Neplatná hodnota
Invalid JSON. Check the preview content.|Neplatný JSON. Zkontrolujte obsah náhledu.|Neplatný JSON. Skontrolujte obsah náhľadu.
← All lists|← Všechny seznamy|← Všetky zoznamy
← All series|← Všechny série|← Všetky série
Edit list details|Upravit podrobnosti seznamu|Upraviť podrobnosti zoznamu
Edit series details|Upravit podrobnosti série|Upraviť podrobnosti série
Delete list|Smazat seznam|Vymazať zoznam
Delete series|Smazat sérii|Vymazať sériu
Review possible matches: {count}|Kontrola možných shod: {count}|Kontrola možných zhôd: {count}
(Book #{id})|(Kniha č. {id})|(Kniha č. {id})`;
for (const line of catalog.split("\n")) {
  const [key, cs, sk] = line.split("|");
  if (!key || !cs || !sk || messages[key])
    throw new Error("Invalid translation: " + key);
  messages[key] = { cs, sk };
}
export function t(
  key: string,
  params: Record<string, string | number> = {},
  locale: Language = language,
): string {
  const value = locale === "en" ? key : (messages[key]?.[locale] ?? key);
  return value.replace(/\{(\w+)\}/g, (match, name) =>
    params[name] === undefined ? match : String(params[name]),
  );
}
export function errorText(error: unknown): string {
  if (error instanceof SyntaxError)
    return t("Invalid JSON. Check the preview content.");
  const message = error instanceof Error ? error.message : String(error);
  if (/Failed to fetch|NetworkError|Load failed/.test(message))
    return t(
      "Could not connect to BookDB. Check that the launcher is running.",
    );
  return t(message);
}
