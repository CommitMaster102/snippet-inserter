# Translation glossary

This file fixes how each recurring term of Snippet Inserter is translated into the 29 languages that
ship next to English. Translators of `extension/_locales/<code>/messages.json`, and of the store
description in the store repository's `store/descriptions/<code>.md`, use it together with the
English catalog, `extension/_locales/en/messages.json`. The description on each English message
says where the text appears, what each `$PLACEHOLDER$` holds, and how long the text may be.

## How to use it

- Use the term from your language's table wherever the English uses that term, in the form the
  sentence needs: case, number, or verb form. Do not swap in a synonym, so that each thing has one
  name in the panel, the snippet manager, the menus, and the store description.
- A semicolon in a table cell separates the terms of a row, in the order of the English column. A
  comma separates forms of one term, such as the singular and the plural.
- "Placeholder" in this extension means a word in braces, such as `{date}`, that is replaced when a
  snippet is inserted. It never means the grey hint inside an empty box, which the message
  descriptions call a grey hint.
- Where a term contains JSON, Google Docs, Ko-fi, or a key name, the message has a placeholder in
  that spot, such as `$JSON$` in `Format $JSON$`. Keep the placeholder; the term shows only the
  words around it.
- Some Persian and Indic terms contain the zero-width non-joiner (U+200C), as Chrome writes them.
  Copy terms from this file instead of retyping them.
- The Source column quotes Chrome's own text that the term follows. "Chrome:" quotes the Chromium
  translation files `ui/strings/translations/ui_strings_<code>.xtb` and
  `components/strings/components_strings_<code>.xtb`, and "DevTools:" quotes the Chrome DevTools
  translation in `front_end/core/i18n/locales/<code>.json`, all read on 25 November 2026. The quote
  can differ from the term in capitals or form, as "Chrome: Nueva carpeta" does for carpeta.
- An empty Source means that the language model that drafted this file chose the term, from the
  wording of Gmail and Microsoft Office as it knows them, without checking those products. A native
  speaker's correction wins over any term here.

## What stays in English

Never translate these, in the catalog or in the store description:

- **Snippet Inserter**, the extension's name. The catalog fills it in through `extName` and the
  `$NAME$` placeholders.
- **Ko-fi**, **Google Docs**, and **JSON**, which the catalog fills in through placeholders, and in
  the store description **Gmail**, **Outlook**, and **Slack**.
- **Prism**, the library that colors code blocks, wherever a text names it, and the code languages
  JavaScript, TypeScript, Python, HTML, CSS, SQL, and Shell, which the code block menu of the
  snippet manager shows as they are.
- Placeholder syntax, because users type it: `{date}`, `{time}`, `{cursor}`, `{date+3d}`,
  `{date-1w}`, `{date+1fri}`, `{time+30min}`, `{snippet:;sig}`, and the `{input:` part of
  `{input:Name}`. The label after `input:` is the user's own text, so the store description may
  translate it, as in `{input:Nombre}`.
- Example abbreviations and addresses: `;addr`, `;sig`, `example.com`, and `mail.example.com`, and
  the address beginnings `https://`, `http://`, `mailto:`, and `tel:`.
- The letter or digit of a shortcut, such as the B in Ctrl+B and the 2 in Ctrl+2. Key names follow
  the next section.

## Key names

The catalog lets each language write a key's name as its own software does, provided the catalog
writes each key one way in every message and puts no space around a plus sign. `npm run
test:locales` fails a catalog that breaks either rule. Each language section below fixes the names.
They are the names Chrome shows for these keys in that language, with these exceptions:

- Where Chrome's name for the Tab key is also its word for a browser tab (am, bn, gu, hi, ja, kn, ml,
  mr, sw, tr), the key is written Tab, because the messages `deletedElsewhere` and
  `changedElsewhere` mention a browser tab. In am, Enter stays Enter for the same reason: Chrome's
  name for that key, አስገባ, also means insert.
- Where Chrome writes a key in capitals, as an abbreviation, or with a word for another action, the
  language section names Chrome's text and the name used instead: it, pt_BR, ru, tr, and vi.
- The Mac Command key stays Cmd in every language.

## Plural forms

The English catalog has 2 forms of each counted message, such as `importedCount_one` and
`importedCount_other`. A translation has one message for each plural category of its language,
named with the category at the end, such as `importedCount_few`, and each form has the same
placeholders. The extension picks the form with `Intl.PluralRules`, and `npm run test:locales` fails
a catalog that lacks a form its language needs or has one it does not use. Each language section
lists its categories and the numbers each one covers.

A form that covers more than one number keeps the number's placeholder in its text. French uses
`one` for 0 as well as for 1, so `$COUNT$ extrait importé.` must not become `Un extrait importé.`
Only a form that covers a single number may leave the number out, such as the Arabic `two`.

These messages always get the same number, so they have no plural forms. Write the noun in the form
that goes with that number: `abbreviationLength` (2 and 32), `deletedNote` (20), `jsonHexDigits`
(4), `jsonTooDeep` (100), and `referenceLimit` (100).

The extension fills in every count and every fixed number through placeholders, in the digits of
the language (Persian, Bengali, and Marathi use their own), so do not type those numbers yourself.

## Lengths

Some messages have a budget in characters, listed in `i18n/width-budgets.json` and repeated in their
descriptions. Every other message may be at most 3 times as long as its English plus 20 characters.
A character here is a Unicode code point, so each vowel sign and virama of an Indic script counts as
one. The budget counts characters, but the room on screen is measured in pixels, so a wide script
needs fewer characters: a Tamil sample of the abbreviation hint measured 382 pixels in a 326-pixel
box, which cut off its end and the example `;addr`.

## Languages

Each section gives the name to write in `languageName`, the form of address Chrome uses in that
language, the key names, the plural categories, and the table of terms.

### es: Spanish

- **languageName:** español
- **Address:** informal tú, as Chrome writes "Si esta pantalla no es táctil, pulsa Esc." This file
  also serves Latin America, so prefer words used on both sides of the Atlantic.
- **Keys:** Ctrl, Mayús, Alt, Intro, Esc, Tabulador, Espacio, Cmd
- **Plural forms:** `one` for 1; `many` for exact millions, written as `other` with "de" before the
  noun ("1.000.000 de fragmentos"); `other` for every other number, 0 included.

| English | Term | Source |
| --- | --- | --- |
| snippet, snippets | fragmento, fragmentos | DevTools: Fragmentos |
| snippet panel; the panel | panel de fragmentos; el panel | DevTools: Panel |
| snippet manager | administrador de fragmentos | |
| abbreviation | abreviatura | |
| placeholder (`{date}`) | marcador de posición | |
| fill-in form; a field in it | formulario para completar; campo | |
| text field; text box | campo de texto; cuadro de texto | |
| rich-text editor | editor de texto enriquecido | |
| folder | carpeta | Chrome: Nueva carpeta |
| formatted text; formatting | texto con formato; formato | |
| code; code block | código; bloque de código | |
| Format JSON | Formatear JSON | |
| plain text | texto sin formato | Chrome: Texto sin formato |
| list | lista | |
| link; address | enlace; dirección | |
| trigger key | tecla de activación | |
| double tap; tap twice | doble pulsación; pulsar dos veces | |
| keyboard shortcut | combinación de teclas | DevTools: Combinaciones de teclas |
| right-click menu | menú contextual | |
| site; turn off, turn on | sitio; desactivar, activar | Chrome: Desactivar, Activar |
| Off (menu entry) | Desactivado | |
| tab (in the browser) | pestaña | Chrome: Nueva pestaña |
| Recently deleted | Eliminados recientemente | |
| Undo | Deshacer | Chrome: Deshacer |
| insert | insertar | |
| inserted as written | se inserta tal cual | |
| include; Includes | incluir; Incluye | |
| save | guardar | Chrome: Guardar |
| delete; Delete forever | eliminar; Eliminar definitivamente | Chrome: Eliminar |
| restore | restaurar | Chrome: Restaurar |
| remove (a folder, a link) | quitar | Chrome: Quitar |
| move | mover | |
| duplicate; Copy of | duplicar; Copia de | |
| edit | editar | Chrome: Editar |
| create; New snippet | crear; Nuevo fragmento | DevTools: Nuevo fragmento |
| name | nombre | Chrome: Nombre |
| optional | opcional | Chrome: Opcional |
| character, characters | carácter, caracteres | |
| selected text | texto seleccionado | |
| caret (text cursor) | cursor | |
| Settings; Settings and backup | Configuración; Configuración y copia de seguridad | Chrome: Configuración |
| backup file; export; import | archivo de copia de seguridad; exportar; importar | |
| Failed to; Could not | No se ha podido | |
| JSON terms: string; value; property name | cadena; valor; nombre de propiedad | |

### pt_BR: Portuguese (Brazil)

- **languageName:** português (Brasil)
- **Address:** você, with verbs in the third person and no pronoun where Portuguese drops it, as
  Chrome writes "Se a tela não for touch, pressione Esc."
- **Keys:** Ctrl, Shift, Alt, Enter, Esc, Tab, Espaço, Cmd. Chrome writes Entrar for Enter, a verb
  for signing in, so Enter stays English, as Chrome's pt_PT writes it.
- **Plural forms:** `one` for 0 and 1; `many` for exact millions, written as `other` with "de"
  before the noun; `other` for every other number.

| English | Term | Source |
| --- | --- | --- |
| snippet, snippets | snippet, snippets | DevTools: Snippets |
| snippet panel; the panel | painel de snippets; o painel | DevTools: Painel |
| snippet manager | gerenciador de snippets | |
| abbreviation | abreviação | |
| placeholder (`{date}`) | espaço reservado | |
| fill-in form; a field in it | formulário de preenchimento; campo | |
| text field; text box | campo de texto; caixa de texto | |
| rich-text editor | editor de texto formatado | |
| folder | pasta | Chrome: Nova pasta |
| formatted text; formatting | texto formatado; formatação | |
| code; code block | código; bloco de código | |
| Format JSON | Formatar JSON | DevTools: Formatar |
| plain text | texto simples | Chrome: Texto simples |
| list | lista | |
| link; address | link; endereço | |
| trigger key | tecla de ativação | |
| double tap; tap twice | toque duplo; pressionar duas vezes | |
| keyboard shortcut | atalho do teclado | DevTools: Atalhos do teclado |
| right-click menu | menu de contexto | |
| site; turn off, turn on | site; desativar, ativar | Chrome: Desativar, Ativar |
| Off (menu entry) | Desativado | |
| tab (in the browser) | guia | Chrome: Nova guia |
| Recently deleted | Excluídos recentemente | |
| Undo | Desfazer | Chrome: Desfazer |
| insert | inserir | |
| inserted as written | é inserido como está escrito | |
| include; Includes | incluir; Inclui | |
| save | salvar | Chrome: Salvar |
| delete; Delete forever | excluir; Excluir permanentemente | Chrome: Excluir |
| restore | restaurar | Chrome: Restaurar |
| remove (a folder, a link) | remover | Chrome: Remover |
| move | mover | |
| duplicate; Copy of | duplicar; Cópia de | |
| edit | editar | Chrome: Editar |
| create; New snippet | criar; Novo snippet | DevTools: Novo snippet |
| name | nome | Chrome: Nome |
| optional | opcional | Chrome: Opcional |
| character, characters | caractere, caracteres | |
| selected text | texto selecionado | |
| caret (text cursor) | cursor | |
| Settings; Settings and backup | Configurações; Configurações e backup | Chrome: Configurações |
| backup file; export; import | arquivo de backup; exportar; importar | |
| Failed to; Could not | Não foi possível | |
| JSON terms: string; value; property name | string; valor; nome da propriedade | |

### pt_PT: Portuguese (Portugal)

- **languageName:** português (Portugal)
- **Address:** formal, with verbs in the third person and "o seu" or "a sua", never "tu", as Chrome
  writes "Se este ecrã não for um ecrã tátil, prima Esc."
- **Keys:** Ctrl, Shift, Alt, Enter, Esc, Tab, Espaço, Cmd
- **Plural forms:** `one` for 1; `many` for exact millions, written as `other` with "de" before the
  noun; `other` for every other number, 0 included.

| English | Term | Source |
| --- | --- | --- |
| snippet, snippets | fragmento, fragmentos | DevTools: Fragmentos |
| snippet panel; the panel | painel de fragmentos; o painel | DevTools: Painel |
| snippet manager | gestor de fragmentos | |
| abbreviation | abreviatura | |
| placeholder (`{date}`) | marcador de posição | |
| fill-in form; a field in it | formulário de preenchimento; campo | |
| text field; text box | campo de texto; caixa de texto | |
| rich-text editor | editor de texto formatado | |
| folder | pasta | Chrome: Nova pasta |
| formatted text; formatting | texto formatado; formatação | |
| code; code block | código; bloco de código | |
| Format JSON | Formatar JSON | |
| plain text | texto simples | Chrome: Texto simples |
| list | lista | |
| link; address | link; endereço | |
| trigger key | tecla de ativação | |
| double tap; tap twice | toque duplo; premir duas vezes | |
| keyboard shortcut | atalho de teclado | DevTools: Atalhos de teclado |
| right-click menu | menu de contexto | |
| site; turn off, turn on | site; desativar, ativar | Chrome: Desativar, Ativar |
| Off (menu entry) | Desativado | |
| tab (in the browser) | separador | Chrome: Novo separador |
| Recently deleted | Eliminados recentemente | |
| Undo | Anular | Chrome: Anular |
| insert | inserir | |
| inserted as written | é inserido tal como está escrito | |
| include; Includes | incluir; Inclui | |
| save | guardar | Chrome: Guardar |
| delete; Delete forever | eliminar; Eliminar permanentemente | Chrome: Eliminar |
| restore | restaurar | Chrome: Restaurar |
| remove (a folder, a link) | remover | Chrome: Remover |
| move | mover | |
| duplicate; Copy of | duplicar; Cópia de | |
| edit | editar | Chrome: Editar |
| create; New snippet | criar; Novo fragmento | DevTools: Novo fragmento |
| name | nome | Chrome: Nome |
| optional | opcional | Chrome: Opcional |
| character, characters | caráter, carateres | |
| selected text | texto selecionado | |
| caret (text cursor) | cursor | |
| Settings; Settings and backup | Definições; Definições e cópia de segurança | Chrome: Definições |
| backup file; export; import | ficheiro de cópia de segurança; exportar; importar | |
| Failed to; Could not | Não foi possível | |
| JSON terms: string; value; property name | cadeia; valor; nome da propriedade | |

### fr: French

- **languageName:** français
- **Address:** vous, as Chrome writes "Si cet écran n'est pas tactile, appuyez sur Échap."
- **Keys:** Ctrl, Maj, Alt, Entrée, Échap, Tabulation, Espace, Cmd
- **Plural forms:** `one` for 0 and 1; `many` for exact millions, written as `other` with "d'" or
  "de" before the noun ("1 000 000 d'extraits"); `other` for every other number.

| English | Term | Source |
| --- | --- | --- |
| snippet, snippets | extrait, extraits | DevTools: Extraits |
| snippet panel; the panel | panneau des extraits; le panneau | DevTools: Panneau |
| snippet manager | gestionnaire d'extraits | |
| abbreviation | abréviation | |
| placeholder (`{date}`) | espace réservé | |
| fill-in form; a field in it | formulaire à remplir; champ | |
| text field; text box | champ de texte; zone de texte | |
| rich-text editor | éditeur de texte enrichi | |
| folder | dossier | Chrome: Nouveau dossier |
| formatted text; formatting | texte mis en forme; mise en forme | |
| code; code block | code; bloc de code | |
| Format JSON | Formater le JSON | |
| plain text | texte brut | Chrome: Texte brut |
| list | liste | |
| link; address | lien; adresse | |
| trigger key | touche de déclenchement | |
| double tap; tap twice | double appui; appuyer deux fois | |
| keyboard shortcut | raccourci clavier | DevTools: Raccourcis clavier |
| right-click menu | menu contextuel | |
| site; turn off, turn on | site; désactiver, activer | Chrome: Désactiver, Activer |
| Off (menu entry) | Désactivé | |
| tab (in the browser) | onglet | Chrome: Nouvel onglet |
| Recently deleted | Supprimés récemment | |
| Undo | Annuler | Chrome: Annuler |
| insert | insérer | |
| inserted as written | est inséré tel quel | |
| include; Includes | inclure; Inclut | |
| save | enregistrer | Chrome: Enregistrer |
| delete; Delete forever | supprimer; Supprimer définitivement | Chrome: Supprimer |
| restore | restaurer | Chrome: Restaurer |
| remove (a folder, a link) | supprimer | Chrome: Supprimer |
| move | déplacer | |
| duplicate; Copy of | dupliquer; Copie de | |
| edit | modifier | Chrome: Modifier |
| create; New snippet | créer; Nouvel extrait | DevTools: Nouvel extrait |
| name | nom | Chrome: Nom |
| optional | facultatif | Chrome: Facultatif |
| character, characters | caractère, caractères | |
| selected text | texte sélectionné | |
| caret (text cursor) | curseur | |
| Settings; Settings and backup | Paramètres; Paramètres et sauvegarde | Chrome: Paramètres |
| backup file; export; import | fichier de sauvegarde; exporter; importer | |
| Failed to; Could not | Impossible de | |
| JSON terms: string; value; property name | chaîne; valeur; nom de propriété | |

Chrome uses Supprimer both for deleting and for removing, and Annuler both for Undo and for Cancel;
this file does the same.

### it: Italian

- **languageName:** italiano
- **Address:** informal tu, as Chrome writes "Se il display non è un touchscreen, premi Esc."
- **Keys:** Ctrl, Maiusc, Alt, Invio, Esc, Tab, Barra spaziatrice, Cmd. Chrome writes BARRA
  SPAZIATRICE in capitals; write it in sentence case.
- **Plural forms:** `one` for 1; `many` for exact millions, written as `other` with "di" before the
  noun; `other` for every other number, 0 included.

| English | Term | Source |
| --- | --- | --- |
| snippet, snippets | snippet, snippet (lo snippet, gli snippet) | DevTools: Snippet |
| snippet panel; the panel | riquadro degli snippet; il riquadro | DevTools: Riquadro |
| snippet manager | gestione snippet | |
| abbreviation | abbreviazione | |
| placeholder (`{date}`) | segnaposto | |
| fill-in form; a field in it | modulo da compilare; campo | |
| text field; text box | campo di testo; casella di testo | |
| rich-text editor | editor di testo formattato | |
| folder | cartella | Chrome: Nuova cartella |
| formatted text; formatting | testo formattato; formattazione | |
| code; code block | codice; blocco di codice | |
| Format JSON | Formatta JSON | DevTools: Formatta |
| plain text | testo normale | Chrome: Testo normale |
| list | elenco | |
| link; address | link; indirizzo | |
| trigger key | tasto di attivazione | |
| double tap; tap twice | doppia pressione; premere due volte | |
| keyboard shortcut | scorciatoia da tastiera | DevTools: Scorciatoie da tastiera |
| right-click menu | menu contestuale | |
| site; turn off, turn on | sito; disattivare, attivare | Chrome: Disattiva, Attiva |
| Off (menu entry) | Disattivato | |
| tab (in the browser) | scheda | Chrome: Nuova scheda |
| Recently deleted | Eliminati di recente | |
| Undo | Annulla | Chrome: Annulla |
| insert | inserire | |
| inserted as written | viene inserito così com'è | |
| include; Includes | includere; Include | |
| save | salvare | Chrome: Salva |
| delete; Delete forever | eliminare; Elimina definitivamente | Chrome: Elimina |
| restore | ripristinare | Chrome: Ripristina |
| remove (a folder, a link) | rimuovere | Chrome: Rimuovi |
| move | spostare | |
| duplicate; Copy of | duplicare; Copia di | |
| edit | modificare | Chrome: Modifica |
| create; New snippet | creare; Nuovo snippet | DevTools: Nuovo snippet |
| name | nome | Chrome: Nome |
| optional | facoltativo | Chrome: Facoltativo |
| character, characters | carattere, caratteri | |
| selected text | testo selezionato | |
| caret (text cursor) | cursore | |
| Settings; Settings and backup | Impostazioni; Impostazioni e backup | Chrome: Impostazioni |
| backup file; export; import | file di backup; esportare; importare | |
| Failed to; Could not | Impossibile | |
| JSON terms: string; value; property name | stringa; valore; nome della proprietà | |

Chrome uses Annulla both for Undo and for Cancel; this file does the same.

### de: German

- **languageName:** Deutsch
- **Address:** informal du, as Chrome writes "Wenn du keinen Touchscreen verwendest, drücke die
  Esc-Taste." Chrome's German components file has "du" 363 times and "Sie" 16 times.
- **Keys:** Strg, Umschalttaste, Alt, Eingabetaste, Esc, Tab, Leertaste, Cmd
- **Plural forms:** `one` for 1; `other` for every other number, 0 included.

| English | Term | Source |
| --- | --- | --- |
| snippet, snippets | Snippet, Snippets (das Snippet) | DevTools: Snippets |
| snippet panel; the panel | Snippet-Panel; das Panel | |
| snippet manager | Snippet-Manager | |
| abbreviation | Kürzel | |
| expand (an abbreviation) | ersetzen | |
| placeholder (`{date}`) | Platzhalter | |
| fill-in form; a field in it | Ausfüllformular; Feld | |
| text field; text box | Textfeld; Textfeld | |
| rich-text editor | Rich-Text-Editor | |
| folder | Ordner | Chrome: Neuer Ordner |
| formatted text; formatting | formatierter Text; Formatierung | |
| code; code block | Code; Codeblock | |
| Format JSON | JSON formatieren | |
| plain text | Nur-Text | Chrome: Nur-Text |
| list | Liste | |
| link; address | Link; Adresse | |
| trigger key | Auslösetaste | |
| double tap; tap twice | Doppeldruck; zweimal drücken | |
| keyboard shortcut | Tastenkombination | DevTools: Tastenkombinationen |
| right-click menu | Kontextmenü | |
| site; turn off, turn on | Website; deaktivieren, aktivieren | Chrome: Deaktivieren, Aktivieren |
| Off (menu entry) | Aus | |
| tab (in the browser) | Tab | Chrome: Neuer Tab |
| Recently deleted | Zuletzt gelöscht | |
| Undo | Rückgängig | Chrome: Rückgängig |
| insert | einfügen | |
| inserted as written | wird unverändert eingefügt | |
| include; Includes | enthalten; Enthält | |
| save | speichern | Chrome: Speichern |
| delete; Delete forever | löschen; Endgültig löschen | Chrome: Löschen |
| restore | wiederherstellen | Chrome: Wiederherstellen |
| remove (a folder, a link) | entfernen | Chrome: Entfernen |
| move | verschieben | |
| duplicate; Copy of | duplizieren; Kopie von | |
| edit | bearbeiten | Chrome: Bearbeiten |
| create; New snippet | erstellen; Neues Snippet | DevTools: Neues Snippet |
| name | Name | Chrome: Name |
| optional | optional | Chrome: Optional |
| character, characters | Zeichen | |
| selected text | ausgewählter Text | |
| caret (text cursor) | Cursor | |
| Settings; Settings and backup | Einstellungen; Einstellungen und Sicherung | Chrome: Einstellungen |
| backup file; export; import | Sicherungsdatei; exportieren; importieren | |
| Failed to; Could not | konnte nicht ... werden ("Das Snippet konnte nicht gespeichert werden.") | |
| JSON terms: string; value; property name | String; Wert; Eigenschaftsname | |

DevTools calls its own panels Steuerfeld, a word for a control area; the snippet panel is a list
that opens at the cursor, so this file uses Panel.

### pl: Polish

- **languageName:** polski
- **Address:** informal, second person singular, as Chrome writes "Spróbuj później." When the
  pronoun is written, capitalize it as Chrome does: Twój, Twoje.
- **Keys:** Ctrl, Shift, Alt, Enter, Esc, Tab, Spacja, Cmd
- **Plural forms:** `one` for 1; `few` for numbers ending in 2, 3, or 4, except those ending in 12,
  13, or 14 (2, 3, 4, 22, 32, ...); `many` for every other whole number (0, 5 to 21, 25, 100, ...);
  `other` for fractions, which the extension never shows, written with the genitive singular.

| English | Term | Source |
| --- | --- | --- |
| snippet, snippets | fragment, fragmenty | DevTools: Fragmenty |
| snippet panel; the panel | panel fragmentów; panel | DevTools: Panel |
| snippet manager | menedżer fragmentów | |
| abbreviation | skrót | |
| placeholder (`{date}`) | symbol zastępczy | |
| fill-in form; a field in it | formularz do wypełnienia; pole | |
| text field; text box | pole tekstowe; pole tekstowe | |
| rich-text editor | edytor tekstu sformatowanego | |
| folder | folder | Chrome: Nowy folder |
| formatted text; formatting | tekst sformatowany; formatowanie | |
| code; code block | kod; blok kodu | |
| Format JSON | Formatuj JSON | DevTools: Formatuj |
| plain text | zwykły tekst | Chrome: Zwykły tekst |
| list | lista | |
| link; address | link; adres | |
| trigger key | klawisz aktywujący | |
| double tap; tap twice | dwukrotne naciśnięcie; nacisnąć dwa razy | |
| keyboard shortcut | skrót klawiszowy | DevTools: Skróty klawiszowe |
| right-click menu | menu kontekstowe | |
| site; turn off, turn on | witryna; wyłączyć, włączyć | Chrome: Wyłącz, Włącz |
| Off (menu entry) | Wyłączone | |
| tab (in the browser) | karta | Chrome: Nowa karta |
| Recently deleted | Ostatnio usunięte | |
| Undo | Cofnij | Chrome: Cofnij |
| insert | wstawić | |
| inserted as written | jest wstawiany dosłownie | |
| include; Includes | zawierać; Zawiera | |
| save | zapisać | Chrome: Zapisz |
| delete; Delete forever | usunąć; Usuń na zawsze | Chrome: Usuń |
| restore | przywrócić | Chrome: Przywróć |
| remove (a folder, a link) | usunąć | Chrome: Usuń |
| move | przenieść | |
| duplicate; Copy of | duplikować; Kopia: | |
| edit | edytować | Chrome: Edytuj |
| create; New snippet | utworzyć; Nowy fragment | DevTools: Nowy fragment |
| name | nazwa | |
| optional | opcjonalne | Chrome: Opcjonalne |
| character, characters | znak, znaki, znaków | |
| selected text | zaznaczony tekst | |
| caret (text cursor) | kursor | |
| Settings; Settings and backup | Ustawienia; Ustawienia i kopia zapasowa | Chrome: Ustawienia |
| backup file; export; import | plik kopii zapasowej; eksportować; importować | |
| Failed to; Could not | Nie udało się | |
| JSON terms: string; value; property name | ciąg; wartość; nazwa właściwości | |

A keyboard shortcut is always "skrót klawiszowy", never a bare "skrót", which this file keeps for
an abbreviation. Chrome's word for a name, "Imię i nazwisko", is a person's name; a snippet's name is
"nazwa".

### ru: Russian

- **languageName:** русский
- **Address:** вы in lower case, with imperatives such as "нажмите", as Chrome writes "Если этот
  экран не является сенсорным, нажмите Esc." Write е, not ё, as Chrome does ("Подчеркнутый").
- **Keys:** Ctrl, Shift, Alt, Enter, Esc, Tab, Пробел, Cmd. Chrome writes ВВОД in capitals for
  Enter; write Enter, as Russian keyboards print it and as Chrome writes the other keys.
- **Plural forms:** `one` for numbers ending in 1, except those ending in 11 (1, 21, 31, 101, ...);
  `few` for numbers ending in 2, 3, or 4, except those ending in 12, 13, or 14; `many` for every
  other whole number (0, 5 to 20, 100, 111, ...); `other` for fractions, which the extension never
  shows, written with the genitive singular.

| English | Term | Source |
| --- | --- | --- |
| snippet, snippets | фрагмент, фрагменты | DevTools: Фрагменты |
| snippet panel; the panel | панель фрагментов; панель | DevTools: Панель |
| snippet manager | диспетчер фрагментов | |
| abbreviation | сокращение | |
| placeholder (`{date}`) | заполнитель | |
| fill-in form; a field in it | форма заполнения; поле | |
| text field; text box | текстовое поле; текстовое поле | |
| rich-text editor | редактор форматированного текста | |
| folder | папка | Chrome: Новая папка |
| formatted text; formatting | форматированный текст; форматирование | |
| code; code block | код; блок кода | |
| Format JSON | Форматировать JSON | |
| plain text | обычный текст | Chrome: Обычный текст |
| list | список | |
| link; address | ссылка; адрес | |
| trigger key | клавиша вызова | |
| double tap; tap twice | двойное нажатие; нажать дважды | |
| keyboard shortcut | сочетание клавиш | DevTools: Сочетание клавиш |
| right-click menu | контекстное меню | |
| site; turn off, turn on | сайт; отключить, включить | Chrome: Отключить, Включить |
| Off (menu entry) | Отключено | |
| tab (in the browser) | вкладка | Chrome: Новая вкладка |
| Recently deleted | Недавно удаленные | |
| Undo | Отменить | Chrome: Отменить |
| insert | вставить | |
| inserted as written | вставляется как есть | |
| include; Includes | включать; Включает | |
| save | сохранить | Chrome: Сохранить |
| delete; Delete forever | удалить; Удалить навсегда | Chrome: Удалить |
| restore | восстановить | Chrome: Восстановить |
| remove (a folder, a link) | удалить | Chrome: Удалить |
| move | переместить | |
| duplicate; Copy of | создать копию; Копия: | |
| edit | изменить | Chrome: Изменить |
| create; New snippet | создать; Новый фрагмент | DevTools: Новый фрагмент |
| name | название | |
| optional | необязательно | Chrome: Необязательно |
| character, characters | символ, символа, символов | |
| selected text | выделенный текст | |
| caret (text cursor) | курсор | |
| Settings; Settings and backup | Настройки; Настройки и резервное копирование | Chrome: Настройки |
| backup file; export; import | файл резервной копии; экспортировать; импортировать | |
| Failed to; Could not | Не удалось | |
| JSON terms: string; value; property name | строка; значение; имя свойства | |

Chrome's "Имя" is a person's name; a snippet's name is "название".

### tr: Turkish

- **languageName:** Türkçe
- **Address:** siz, as Chrome writes "Bu ekran dokunmatik ekran değilse Esc tuşuna basın."
- **Keys:** Ctrl, Shift, Alt, Enter, Esc, Tab, Boşluk, Cmd. Chrome writes ÜstKrktr, an
  abbreviation, for Shift, and Sekme, its word for a browser tab, for Tab; write Shift and Tab.
- **Plural forms:** `one` for 1; `other` for every other number. A Turkish noun after a number stays
  singular, so the 2 forms usually have the same text.

| English | Term | Source |
| --- | --- | --- |
| snippet, snippets | snippet, snippet'lar | DevTools: Snippet'lar |
| snippet panel; the panel | snippet paneli; panel | DevTools: Panel |
| snippet manager | snippet yöneticisi | |
| abbreviation | kısaltma | |
| placeholder (`{date}`) | yer tutucu | |
| fill-in form; a field in it | doldurma formu; alan | |
| text field; text box | metin alanı; metin kutusu | |
| rich-text editor | zengin metin düzenleyici | |
| folder | klasör | Chrome: Yeni klasör |
| formatted text; formatting | biçimlendirilmiş metin; biçimlendirme | |
| code; code block | kod; kod bloğu | |
| Format JSON | JSON'u biçimlendir | |
| plain text | düz metin | Chrome: Düz Metin |
| list | liste | |
| link; address | bağlantı; adres | |
| trigger key | tetikleyici tuş | |
| double tap; tap twice | çift basma; iki kez basmak | |
| keyboard shortcut | klavye kısayolu | DevTools: Klavye kısayolları |
| right-click menu | sağ tıklama menüsü | |
| site; turn off, turn on | site; kapatmak, etkinleştirmek | Chrome: Kapat, Etkinleştir |
| Off (menu entry) | Kapalı | |
| tab (in the browser) | sekme | Chrome: Yeni Sekme |
| Recently deleted | Son silinenler | |
| Undo | Geri al | Chrome: Geri al |
| insert | eklemek | |
| inserted as written | yazıldığı gibi eklenir | |
| include; Includes | içermek; İçerir | |
| save | kaydetmek | Chrome: Kaydet |
| delete; Delete forever | silmek; Kalıcı olarak sil | Chrome: Sil |
| restore | geri yüklemek | Chrome: Geri yükle |
| remove (a folder, a link) | kaldırmak | Chrome: Kaldır |
| move | taşımak | |
| duplicate; Copy of | çoğaltmak; ... kopyası ("Adres kopyası") | |
| edit | düzenlemek | Chrome: Düzenle |
| create; New snippet | oluşturmak; Yeni snippet | DevTools: Yeni snippet |
| name | ad | Chrome: Ad |
| optional | isteğe bağlı | Chrome: İsteğe bağlı |
| character, characters | karakter | |
| selected text | seçili metin | |
| caret (text cursor) | imleç | |
| Settings; Settings and backup | Ayarlar; Ayarlar ve yedekleme | Chrome: Ayarlar |
| backup file; export; import | yedek dosyası; dışa aktarmak; içe aktarmak | |
| Failed to; Could not | the verb with -(y)AmA-, as in "Snippet kaydedilemedi." | |
| JSON terms: string; value; property name | dize; değer; özellik adı | |

Suffixes follow "snippet" after an apostrophe, as DevTools writes Snippet'lar.

### id: Indonesian

- **languageName:** Indonesia
- **Address:** Anda, capitalized, as Chrome writes "Ketik chrome://extensions di browser Anda".
- **Keys:** Ctrl, Shift, Alt, Enter, Esc, Tab, Space, Cmd
- **Plural forms:** `other` only, for every number. Each counted message has one form, named
  `_other`, and no `_one`.

| English | Term | Source |
| --- | --- | --- |
| snippet, snippets | cuplikan | DevTools: Cuplikan |
| snippet panel; the panel | panel cuplikan; panel | DevTools: Panel |
| snippet manager | pengelola cuplikan | |
| abbreviation | singkatan | |
| placeholder (`{date}`) | tempat penampung | |
| fill-in form; a field in it | formulir isian; kolom | |
| text field; text box | kolom teks; kotak teks | |
| rich-text editor | editor teks kaya | |
| folder | folder | Chrome: Folder baru |
| formatted text; formatting | teks berformat; pemformatan | |
| code; code block | kode; blok kode | |
| Format JSON | Format JSON | DevTools: Format |
| plain text | teks biasa | Chrome: Teks Biasa |
| list | daftar | |
| link; address | link; alamat | |
| trigger key | tombol pemicu | |
| double tap; tap twice | tekan dua kali; tekan dua kali | |
| keyboard shortcut | pintasan keyboard | DevTools: Pintasan keyboard |
| right-click menu | menu klik kanan | |
| site; turn off, turn on | situs; nonaktifkan, aktifkan | Chrome: Nonaktifkan, Aktifkan |
| Off (menu entry) | Nonaktif | |
| tab (in the browser) | tab | Chrome: Tab Baru |
| Recently deleted | Baru dihapus | |
| Undo | Urungkan | Chrome: Urungkan |
| insert | sisipkan | |
| inserted as written | disisipkan apa adanya | |
| include; Includes | menyertakan; Menyertakan | |
| save | simpan | Chrome: Simpan |
| delete; Delete forever | hapus; Hapus permanen | Chrome: Hapus |
| restore | pulihkan | Chrome: Pulihkan |
| remove (a folder, a link) | hapus | Chrome: Hapus |
| move | pindahkan | |
| duplicate; Copy of | duplikat; Salinan | |
| edit | edit | Chrome: Edit |
| create; New snippet | buat; Cuplikan baru | |
| name | nama | Chrome: Nama |
| optional | opsional | Chrome: Opsional |
| character, characters | karakter | |
| selected text | teks yang dipilih | |
| caret (text cursor) | kursor | |
| Settings; Settings and backup | Setelan; Setelan dan cadangan | Chrome: Setelan |
| backup file; export; import | file cadangan; ekspor; impor | |
| Failed to; Could not | Gagal | |
| JSON terms: string; value; property name | string; nilai; nama properti | |

DevTools writes Cuplikan for its list but "Snippet baru" for a new one; this file uses cuplikan in
both, so the thing has one name.

### vi: Vietnamese

- **languageName:** Tiếng Việt
- **Address:** bạn, as Chrome writes "Gọi cho số này bằng điện thoại của bạn?"
- **Keys:** Ctrl, Shift, Alt, Enter, Esc, Phím Tab, Phím cách, Cmd. Chrome writes Thoát (exit) for
  Esc; write Esc, as Vietnamese keyboards print it.
- **Plural forms:** `other` only, for every number. Each counted message has one form, named
  `_other`, and no `_one`.

| English | Term | Source |
| --- | --- | --- |
| snippet, snippets | đoạn văn bản | |
| snippet panel; the panel | bảng điều khiển đoạn văn bản; bảng điều khiển | DevTools: Bảng điều khiển |
| snippet manager | trình quản lý đoạn văn bản | |
| abbreviation | từ viết tắt | |
| placeholder (`{date}`) | chỗ dành sẵn | |
| fill-in form; a field in it | biểu mẫu điền; trường | |
| text field; text box | trường văn bản; hộp văn bản | |
| rich-text editor | trình soạn thảo văn bản có định dạng | |
| folder | thư mục | Chrome: Thư mục mới |
| formatted text; formatting | văn bản có định dạng; định dạng | |
| code; code block | mã; khối mã | |
| Format JSON | Định dạng JSON | DevTools: Định dạng |
| plain text | văn bản thuần túy | Chrome: Văn bản thuần túy |
| list | danh sách | |
| link; address | đường liên kết; địa chỉ | |
| trigger key | phím kích hoạt | |
| double tap; tap twice | nhấn đúp; nhấn hai lần | |
| keyboard shortcut | phím tắt | DevTools: Phím tắt |
| right-click menu | menu chuột phải | |
| site; turn off, turn on | trang web; tắt, bật | Chrome: Tắt, Bật |
| Off (menu entry) | Tắt | Chrome: Tắt |
| tab (in the browser) | thẻ | Chrome: Thẻ mới |
| Recently deleted | Đã xoá gần đây | |
| Undo | Hoàn tác | Chrome: Hoàn tác |
| insert | chèn | |
| inserted as written | được chèn nguyên văn | |
| include; Includes | bao gồm; Bao gồm | |
| save | lưu | Chrome: Lưu |
| delete; Delete forever | xoá; Xoá vĩnh viễn | Chrome: Xoá |
| restore | khôi phục | Chrome: Khôi phục |
| remove (a folder, a link) | xoá | Chrome: Xoá |
| move | di chuyển | |
| duplicate; Copy of | nhân bản; Bản sao của | |
| edit | chỉnh sửa | Chrome: Chỉnh sửa |
| create; New snippet | tạo; Đoạn văn bản mới | |
| name | tên | Chrome: Tên |
| optional | không bắt buộc | Chrome: Không bắt buộc |
| character, characters | ký tự | |
| selected text | văn bản đã chọn | |
| caret (text cursor) | con trỏ | |
| Settings; Settings and backup | Cài đặt; Cài đặt và sao lưu | Chrome: Cài đặt |
| backup file; export; import | tệp sao lưu; xuất; nhập | |
| Failed to; Could not | Không thể | |
| JSON terms: string; value; property name | chuỗi; giá trị; tên thuộc tính | |

DevTools writes Đoạn mã, a passage of code; a snippet here is text, so this file uses đoạn văn bản.
Place tone marks as Chrome does in xoá and huỷ.

### th: Thai

- **languageName:** ไทย
- **Address:** neutral and polite, with no particles such as ครับ or ค่ะ, and คุณ only where a
  pronoun is needed, as Chrome writes "หากหน้าจอนี้ไม่ใช่หน้าจอสัมผัส ให้กด Esc".
- **Keys:** Ctrl, Shift, Alt, Enter, Esc, Tab, Space, Cmd
- **Plural forms:** `other` only, for every number. Each counted message has one form, named
  `_other`, and no `_one`.

| English | Term | Source |
| --- | --- | --- |
| snippet, snippets | ข้อความสำเร็จรูป | |
| snippet panel; the panel | แผงข้อความสำเร็จรูป; แผง | DevTools: แผง |
| snippet manager | ตัวจัดการข้อความสำเร็จรูป | |
| abbreviation | คำย่อ | |
| placeholder (`{date}`) | ตัวยึดตำแหน่ง | |
| fill-in form; a field in it | แบบฟอร์มกรอกข้อมูล; ช่อง | |
| text field; text box | ช่องข้อความ; กล่องข้อความ | |
| rich-text editor | เครื่องมือแก้ไขข้อความแบบมีรูปแบบ | |
| folder | โฟลเดอร์ | Chrome: โฟลเดอร์ใหม่ |
| formatted text; formatting | ข้อความที่จัดรูปแบบ; การจัดรูปแบบ | |
| code; code block | โค้ด; บล็อกโค้ด | |
| Format JSON | จัดรูปแบบ JSON | |
| plain text | ข้อความธรรมดา | Chrome: ข้อความธรรมดา |
| list | รายการ | |
| link; address | ลิงก์; ที่อยู่ | |
| trigger key | ปุ่มเรียกใช้ | |
| double tap; tap twice | การกดสองครั้ง; กดสองครั้ง | |
| keyboard shortcut | แป้นพิมพ์ลัด | DevTools: แป้นพิมพ์ลัด |
| right-click menu | เมนูคลิกขวา | |
| site; turn off, turn on | เว็บไซต์; ปิด, เปิด | Chrome: ปิด, เปิด |
| Off (menu entry) | ปิด | Chrome: ปิด |
| tab (in the browser) | แท็บ | Chrome: แท็บใหม่ |
| Recently deleted | ที่ลบล่าสุด | |
| Undo | เลิกทำ | Chrome: เลิกทำ |
| insert | แทรก | |
| inserted as written | แทรกตามที่เขียนไว้ | |
| include; Includes | รวม; รวมถึง | |
| save | บันทึก | Chrome: บันทึก |
| delete; Delete forever | ลบ; ลบถาวร | Chrome: ลบ |
| restore | กู้คืน | |
| remove (a folder, a link) | นำออก | Chrome: นำออก |
| move | ย้าย | |
| duplicate; Copy of | ทำสำเนา; สำเนาของ | |
| edit | แก้ไข | Chrome: แก้ไข |
| create; New snippet | สร้าง; ข้อความสำเร็จรูปใหม่ | |
| name | ชื่อ | Chrome: ชื่อ |
| optional | ไม่บังคับ | Chrome: ไม่บังคับ |
| character, characters | อักขระ | |
| selected text | ข้อความที่เลือก | |
| caret (text cursor) | เคอร์เซอร์ | |
| Settings; Settings and backup | การตั้งค่า; การตั้งค่าและการสำรองข้อมูล | Chrome: การตั้งค่า |
| backup file; export; import | ไฟล์สำรองข้อมูล; ส่งออก; นำเข้า | |
| Failed to; Could not | ...ไม่สำเร็จ ("บันทึกข้อความสำเร็จรูปไม่สำเร็จ") | |
| JSON terms: string; value; property name | สตริง; ค่า; ชื่อพร็อพเพอร์ตี | |

DevTools writes ข้อมูลโค้ด, code data; a snippet here is saved text, so this file uses
ข้อความสำเร็จรูป, ready-made text. Chrome's word for Restore, คืนค่า, means resetting a setting;
bringing back a deleted snippet is กู้คืน. Thai puts no space between words; a space separates
phrases and sentences.

### fil: Filipino

- **languageName:** Filipino
- **Address:** informal, with mo, iyong, and ikaw and no "po", as Chrome writes "I-type ang
  chrome://extensions sa iyong browser". Chrome keeps many English words with Filipino verb
  prefixes, such as I-save and I-delete; this file does the same.
- **Keys:** Ctrl, Shift, Alt, Enter, Esc, Tab, Space, Cmd
- **Plural forms:** `one` for every whole number that does not end in 4, 6, or 9 (0, 1, 2, 3, 5, 7,
  8, 10, ...); `other` for numbers ending in 4, 6, or 9. Both forms keep the number, and since a
  Filipino noun does not change with the number, both usually have the same text.

| English | Term | Source |
| --- | --- | --- |
| snippet, snippets | snippet, mga snippet | DevTools: Mga Snippet |
| snippet panel; the panel | panel ng snippet; panel | DevTools: Panel |
| snippet manager | snippet manager | |
| abbreviation | abbreviation | |
| placeholder (`{date}`) | placeholder | |
| fill-in form; a field in it | form na pupunan; field | |
| text field; text box | text field; text box | |
| rich-text editor | rich text editor | |
| folder | folder | Chrome: Bagong folder |
| formatted text; formatting | naka-format na text; pag-format | |
| code; code block | code; code block | |
| Format JSON | I-format ang JSON | |
| plain text | plain text | Chrome: Plain Text |
| list | listahan | |
| link; address | link; address | |
| trigger key | trigger key | |
| double tap; tap twice | double tap; pindutin nang dalawang beses | |
| keyboard shortcut | keyboard shortcut | DevTools: Mga keyboard shortcut |
| right-click menu | right-click menu | |
| site; turn off, turn on | site; i-off, i-on | Chrome: I-off, I-on |
| Off (menu entry) | Naka-off | |
| tab (in the browser) | tab | Chrome: Bagong Tab |
| Recently deleted | Kamakailang na-delete | |
| Undo | I-undo | Chrome: I-undo |
| insert | ilagay | |
| inserted as written | inilalagay nang eksakto sa pagkakasulat | |
| include; Includes | isama; Kasama | |
| save | i-save | Chrome: I-save |
| delete; Delete forever | i-delete; I-delete nang tuluyan | Chrome: I-delete |
| restore | ipanumbalik | Chrome: Ipanumbalik |
| remove (a folder, a link) | alisin | Chrome: Alisin |
| move | ilipat | |
| duplicate; Copy of | i-duplicate; Kopya ng | |
| edit | i-edit | Chrome: I-edit |
| create; New snippet | gumawa; Bagong snippet | DevTools: Bagong snippet |
| name | pangalan | Chrome: Pangalan |
| optional | opsyonal | Chrome: Opsyonal |
| character, characters | character | |
| selected text | napiling text | |
| caret (text cursor) | cursor | |
| Settings; Settings and backup | Mga Setting; Mga Setting at backup | Chrome: Mga Setting |
| backup file; export; import | backup file; i-export; i-import | |
| Failed to; Could not | Hindi ma- ("Hindi ma-save ang snippet.") | |
| JSON terms: string; value; property name | string; value; pangalan ng property | |

### sw: Swahili

- **languageName:** Kiswahili
- **Address:** second person singular, as Chrome writes "Je, ungependa kutumia simu yako kupigia
  namba hii?"
- **Keys:** Ctrl, Hama, Alt, Enter, Esc, Tab, Nafasi, Cmd. Chrome writes Kichupo, its word for a
  browser tab, for the Tab key; write Tab.
- **Plural forms:** `one` for 1; `other` for every other number, 0 included. Agree each word with
  the noun class: kijisehemu 1, vijisehemu 3.

| English | Term | Source |
| --- | --- | --- |
| snippet, snippets | kijisehemu, vijisehemu | DevTools: Vijisehemu |
| snippet panel; the panel | kidirisha cha vijisehemu; kidirisha | DevTools: Kidirisha |
| snippet manager | kidhibiti cha vijisehemu | |
| abbreviation | kifupisho, vifupisho | |
| placeholder (`{date}`) | kishikilia nafasi | |
| fill-in form; a field in it | fomu ya kujaza; sehemu | |
| text field; text box | sehemu ya maandishi; kisanduku cha maandishi | |
| rich-text editor | kihariri cha maandishi yenye muundo | |
| folder | folda | Chrome: Folda mpya |
| formatted text; formatting | maandishi yenye muundo; muundo | |
| code; code block | msimbo; kizuizi cha msimbo | |
| Format JSON | Badilisha muundo wa JSON | DevTools: Badilisha muundo |
| plain text | maandishi dhahiri | |
| list | orodha | |
| link; address | kiungo; anwani | |
| trigger key | kitufe cha kuamsha | |
| double tap; tap twice | kubonyeza mara mbili; bonyeza mara mbili | |
| keyboard shortcut | mkato wa kibodi | DevTools: Mikato ya kibodi |
| right-click menu | menyu ya kubofya kulia | |
| site; turn off, turn on | tovuti; zima, washa | Chrome: Zima, Washa |
| Off (menu entry) | Imezimwa | |
| tab (in the browser) | kichupo | Chrome: Kichupo Kipya |
| Recently deleted | Vilivyofutwa hivi karibuni | |
| Undo | Tendua | Chrome: Tendua |
| insert | ingiza | |
| inserted as written | huingizwa jinsi kilivyoandikwa | |
| include; Includes | jumuisha; Inajumuisha | |
| save | hifadhi | Chrome: Hifadhi |
| delete; Delete forever | futa; Futa kabisa | Chrome: Futa |
| restore | rejesha | Chrome: Rejesha |
| remove (a folder, a link) | ondoa | Chrome: Ondoa |
| move | sogeza | |
| duplicate; Copy of | tengeneza nakala; Nakala ya | |
| edit | badilisha | Chrome: Badilisha |
| create; New snippet | unda; Kijisehemu kipya | DevTools: Kijisehemu kipya |
| name | jina | Chrome: Jina |
| optional | ya hiari | Chrome: Ya hiari |
| character, characters | herufi | |
| selected text | maandishi yaliyochaguliwa | |
| caret (text cursor) | kiteuzi | |
| Settings; Settings and backup | Mipangilio; Mipangilio na hifadhi rudufu | Chrome: Mipangilio |
| backup file; export; import | faili ya hifadhi rudufu; hamisha; leta | |
| Failed to; Could not | Imeshindwa | |
| JSON terms: string; value; property name | mfuatano; thamani; jina la sifa | |

Chrome's components file writes "Mandishi Dhahiri" for plain text, a misspelling of maandishi; write
maandishi dhahiri.

### zh_CN: Chinese (Simplified)

- **languageName:** 中文（简体）
- **Address:** 您, as Chrome writes "点按您屏幕上的触摸目标。" Chrome's Simplified Chinese components
  file has 您 1,118 times and 你 11 times.
- **Keys:** Ctrl, Shift, Alt, Enter, Esc, Tab 键, 空格键, Cmd
- **Plural forms:** `other` only, for every number. Each counted message has one form, named
  `_other`, and no `_one`.

| English | Term | Source |
| --- | --- | --- |
| snippet, snippets | 片段 | |
| snippet panel; the panel | 片段面板; 面板 | DevTools: 面板 |
| snippet manager | 片段管理器 | |
| abbreviation | 缩写 | |
| placeholder (`{date}`) | 占位符 | |
| fill-in form; a field in it | 填写表单; 字段 | |
| text field; text box | 文本框; 文本框 | |
| rich-text editor | 富文本编辑器 | |
| folder | 文件夹 | Chrome: 新建文件夹 |
| formatted text; formatting | 带格式的文本; 格式 | |
| code; code block | 代码; 代码块 | |
| Format JSON | 格式化 JSON | |
| plain text | 纯文本 | Chrome: 纯文本 |
| list | 列表 | |
| link; address | 链接; 地址 | |
| trigger key | 触发键 | |
| double tap; tap twice | 连按两次; 连按两次 | |
| keyboard shortcut | 键盘快捷键 | DevTools: 键盘快捷键 |
| right-click menu | 右键菜单 | |
| site; turn off, turn on | 网站; 关闭, 开启 | Chrome: 关闭, 开启 |
| Off (menu entry) | 关闭 | Chrome: 关闭 |
| tab (in the browser) | 标签页 | Chrome: 新标签页 |
| Recently deleted | 最近删除 | |
| Undo | 撤销 | Chrome: 撤销 |
| insert | 插入 | |
| inserted as written | 按原样插入 | |
| include; Includes | 包含; 包含 | |
| save | 保存 | Chrome: 保存 |
| delete; Delete forever | 删除; 永久删除 | Chrome: 删除 |
| restore | 恢复 | Chrome: 恢复 |
| remove (a folder, a link) | 移除 | Chrome: 移除 |
| move | 移动 | |
| duplicate; Copy of | 创建副本; 副本 ("$TITLE$ 副本") | |
| edit | 修改 | Chrome: 修改 |
| create; New snippet | 创建; 新建片段 | |
| name | 名称 | |
| optional | 选填 | Chrome: 选填 |
| character, characters | 个字符 | |
| selected text | 所选文本 | |
| caret (text cursor) | 光标 | |
| Settings; Settings and backup | 设置; 设置和备份 | Chrome: 设置 |
| backup file; export; import | 备份文件; 导出; 导入 | |
| Failed to; Could not | 无法 | |
| JSON terms: string; value; property name | 字符串; 值; 属性名称 | |

DevTools writes 代码段, a piece of code; a snippet here is text, so this file uses 片段. Chrome's
姓名 is a person's name; a snippet's name is 名称. Use full-width punctuation, and put a space
between Chinese and a Latin word or a number, as Chrome writes "请按 Esc 键".

### zh_TW: Chinese (Traditional)

- **languageName:** 中文（繁體）
- **Address:** 你, as Chrome writes "要透過你的手機撥打這個號碼嗎？" Chrome's Traditional Chinese
  components file has 你 637 times and 您 56 times.
- **Keys:** Ctrl, Shift, Alt, Enter, Esc, Tab 鍵, 空格鍵, Cmd
- **Plural forms:** `other` only, for every number. Each counted message has one form, named
  `_other`, and no `_one`.

| English | Term | Source |
| --- | --- | --- |
| snippet, snippets | 片段 | |
| snippet panel; the panel | 片段面板; 面板 | DevTools: 面板 |
| snippet manager | 片段管理員 | |
| abbreviation | 縮寫 | |
| placeholder (`{date}`) | 預留位置 | |
| fill-in form; a field in it | 填寫表單; 欄位 | |
| text field; text box | 文字欄位; 文字方塊 | |
| rich-text editor | 富文字編輯器 | |
| folder | 資料夾 | Chrome: 新增資料夾 |
| formatted text; formatting | 格式化文字; 格式 | |
| code; code block | 程式碼; 程式碼區塊 | |
| Format JSON | 格式化 JSON | |
| plain text | 純文字 | Chrome: 純文字 |
| list | 清單 | |
| link; address | 連結; 網址 | |
| trigger key | 觸發鍵 | |
| double tap; tap twice | 連按兩下; 連按兩下 | |
| keyboard shortcut | 鍵盤快速鍵 | DevTools: 鍵盤快速鍵 |
| right-click menu | 右鍵選單 | |
| site; turn off, turn on | 網站; 關閉, 開啟 | Chrome: 關閉, 開啟 |
| Off (menu entry) | 關閉 | Chrome: 關閉 |
| tab (in the browser) | 分頁 | Chrome: 新分頁 |
| Recently deleted | 最近刪除 | |
| Undo | 復原 | Chrome: 復原 |
| insert | 插入 | |
| inserted as written | 依原樣插入 | |
| include; Includes | 包含; 包含 | |
| save | 儲存 | Chrome: 儲存 |
| delete; Delete forever | 刪除; 永久刪除 | Chrome: 刪除 |
| restore | 還原 | Chrome: 還原 |
| remove (a folder, a link) | 移除 | Chrome: 移除 |
| move | 移動 | |
| duplicate; Copy of | 建立副本; 副本 ("$TITLE$ 副本") | |
| edit | 編輯 | Chrome: 編輯 |
| create; New snippet | 建立; 新增片段 | |
| name | 名稱 | |
| optional | 選填 | Chrome: 選填 |
| character, characters | 個字元 | |
| selected text | 選取的文字 | |
| caret (text cursor) | 游標 | |
| Settings; Settings and backup | 設定; 設定與備份 | Chrome: 設定 |
| backup file; export; import | 備份檔案; 匯出; 匯入 | |
| Failed to; Could not | 無法 | |
| JSON terms: string; value; property name | 字串; 值; 屬性名稱 | |

DevTools writes 程式碼片段, a piece of code; a snippet here is text, so this file uses 片段. Undo is
復原 and Restore is 還原, as Chrome writes them. Use full-width punctuation, and put a space between
Chinese and a Latin word or a number, as Chrome writes "請按下 Esc 鍵".

### ja: Japanese

- **languageName:** 日本語
- **Address:** です and ます, as Chrome writes "しばらくしてからもう一度お試しください。"
- **Keys:** Ctrl, Shift, Alt, Enter, Esc, Tab, Space, Cmd. Chrome writes タブ, its word for a browser
  tab, for the Tab key; write Tab.
- **Plural forms:** `other` only, for every number. Each counted message has one form, named
  `_other`, and no `_one`.

| English | Term | Source |
| --- | --- | --- |
| snippet, snippets | スニペット | DevTools: スニペット |
| snippet panel; the panel | スニペット パネル; パネル | DevTools: パネル |
| snippet manager | スニペット マネージャ | |
| abbreviation | 略語 | |
| placeholder (`{date}`) | プレースホルダ | |
| fill-in form; a field in it | 入力フォーム; 入力欄 | |
| text field; text box | テキスト ボックス; テキスト ボックス | |
| rich-text editor | リッチテキスト エディタ | |
| folder | フォルダ | Chrome: 新しいフォルダ |
| formatted text; formatting | 書式付きテキスト; 書式 | |
| code; code block | コード; コード ブロック | |
| Format JSON | JSON を整形 | |
| plain text | 書式なしテキスト | Chrome: 書式なしテキスト |
| list | リスト | |
| link; address | リンク; アドレス | |
| trigger key | トリガー キー | |
| double tap; tap twice | 2 回押し; 2 回押す | |
| keyboard shortcut | キーボード ショートカット | DevTools: キーボード ショートカット |
| right-click menu | 右クリック メニュー | |
| site; turn off, turn on | サイト; オフにする, オンにする | Chrome: オフにする |
| Off (menu entry) | オフ | |
| tab (in the browser) | タブ | Chrome: 新しいタブ |
| Recently deleted | 最近削除した項目 | |
| Undo | 元に戻す | Chrome: 元に戻す |
| insert | 挿入 | |
| inserted as written | そのまま挿入されます | |
| include; Includes | 含める; 含まれるスニペット | |
| save | 保存 | Chrome: 保存 |
| delete; Delete forever | 削除; 完全に削除 | Chrome: 削除 |
| restore | 復元 | Chrome: 復元 |
| remove (a folder, a link) | 削除 | Chrome: 削除 |
| move | 移動 | |
| duplicate; Copy of | 複製; のコピー ("$TITLE$ のコピー") | |
| edit | 編集 | Chrome: 編集 |
| create; New snippet | 作成; 新しいスニペット | DevTools: 新しいスニペット |
| name | 名前 | Chrome: 名前 |
| optional | 省略可 | Chrome: 省略可 |
| character, characters | 文字 | |
| selected text | 選択したテキスト | |
| caret (text cursor) | カーソル | |
| Settings; Settings and backup | 設定; 設定とバックアップ | Chrome: 設定 |
| backup file; export; import | バックアップ ファイル; エクスポート; インポート | |
| Failed to; Could not | できませんでした ("保存できませんでした。") | |
| JSON terms: string; value; property name | 文字列; 値; プロパティ名 | |

As Chrome does, put a half-width space between Japanese and a Latin word ("Esc キー") and between
the parts of a long katakana compound ("キーボード ショートカット"), and leave off the final long
vowel mark in words such as フォルダ, マネージャ, and エディタ. "2 回" is the Japanese way to write
twice, so it keeps its digit.

### ko: Korean

- **languageName:** 한국어
- **Address:** polite, with -세요 and -습니다, as Chrome writes "이 디스플레이가 터치 스크린이 아닌 경우
  Esc 키를 누르세요."
- **Keys:** Ctrl, Shift, Alt, Enter, Esc, Tab, Space, Cmd
- **Plural forms:** `other` only, for every number. Each counted message has one form, named
  `_other`, and no `_one`.

| English | Term | Source |
| --- | --- | --- |
| snippet, snippets | 스니펫 | DevTools: 스니펫 |
| snippet panel; the panel | 스니펫 패널; 패널 | DevTools: 패널 |
| snippet manager | 스니펫 관리자 | |
| abbreviation | 약어 | |
| placeholder (`{date}`) | 자리 표시자 | |
| fill-in form; a field in it | 입력 양식; 입력란 | |
| text field; text box | 텍스트 필드; 텍스트 상자 | |
| rich-text editor | 서식 있는 텍스트 편집기 | |
| folder | 폴더 | Chrome: 새 폴더 |
| formatted text; formatting | 서식 있는 텍스트; 서식 | |
| code; code block | 코드; 코드 블록 | |
| Format JSON | JSON 서식 지정 | |
| plain text | 일반 텍스트 | Chrome: 일반 텍스트 |
| list | 목록 | |
| link; address | 링크; 주소 | |
| trigger key | 트리거 키 | |
| double tap; tap twice | 두 번 누르기; 두 번 누르다 | |
| keyboard shortcut | 키보드 단축키 | DevTools: 키보드 단축키 |
| right-click menu | 마우스 오른쪽 버튼 메뉴 | |
| site; turn off, turn on | 사이트; 사용 중지, 사용 설정 | Chrome: 사용 중지, 사용 설정 |
| Off (menu entry) | 사용 안함 | |
| tab (in the browser) | 탭 | Chrome: 새 탭 |
| Recently deleted | 최근 삭제된 항목 | |
| Undo | 실행취소 | Chrome: 실행취소 |
| insert | 삽입 | |
| inserted as written | 입력한 그대로 삽입됩니다 | |
| include; Includes | 포함; 포함된 스니펫 | |
| save | 저장 | Chrome: 저장 |
| delete; Delete forever | 삭제; 영구 삭제 | Chrome: 삭제 |
| restore | 복구 | Chrome: 복구 |
| remove (a folder, a link) | 삭제 | Chrome: 삭제 |
| move | 이동 | |
| duplicate; Copy of | 복제; 사본 ("$TITLE$ 사본") | |
| edit | 수정 | Chrome: 수정 |
| create; New snippet | 만들기; 새 스니펫 | |
| name | 이름 | Chrome: 이름 |
| optional | 선택사항 | Chrome: 선택사항 |
| character, characters | 자 | |
| selected text | 선택한 텍스트 | |
| caret (text cursor) | 커서 | |
| Settings; Settings and backup | 설정; 설정 및 백업 | Chrome: 설정 |
| backup file; export; import | 백업 파일; 내보내기; 가져오기 | |
| Failed to; Could not | 하지 못했습니다 ("저장하지 못했습니다.") | |
| JSON terms: string; value; property name | 문자열; 값; 속성 이름 | |

### ar: Arabic

- **languageName:** العربية
- **Address:** second person masculine singular, with impersonal يُرجى for requests, as Chrome
  writes "هل تريد الاتصال بهذا الرقم من هاتفك؟" and "يُرجى إعادة المحاولة لاحقًا."
- **Keys:** Ctrl, Shift, Alt, Enter, Esc, مفتاح Tab, مسافة, Cmd
- **Plural forms:** `zero` for 0, `one` for 1, and `two` for 2. Each covers a single number, so it
  may leave the number out ("مقتطف واحد", "مقتطفان"). `few` is for 3 to 10 and for numbers whose last
  2 digits are 03 to 10 (103, 205, ...). `many` is for 11 to 99 and for numbers whose last 2 digits
  are 11 to 99. `other` is for 100, 101, 102, 200, and the like.

| English | Term | Source |
| --- | --- | --- |
| snippet, snippets | مقتطف, مقتطفات | DevTools: مقتطفات |
| snippet panel; the panel | لوحة المقتطفات; اللوحة | DevTools: لوحة |
| snippet manager | مدير المقتطفات | |
| abbreviation | اختصار نصي | |
| placeholder (`{date}`) | عنصر نائب | |
| fill-in form; a field in it | نموذج التعبئة; حقل | |
| text field; text box | حقل نص; مربع نص | |
| rich-text editor | محرر النص المنسق | |
| folder | مجلد | Chrome: مجلد جديد |
| formatted text; formatting | نص منسق; تنسيق | |
| code; code block | رمز برمجي; كتلة رمز برمجي | |
| Format JSON | تنسيق JSON | DevTools: تنسيق |
| plain text | نص عادي | Chrome: نص عادي |
| list | قائمة | |
| link; address | رابط; عنوان | |
| trigger key | مفتاح التشغيل | |
| double tap; tap twice | الضغط مرتين; اضغط مرتين | |
| keyboard shortcut | اختصار لوحة المفاتيح | DevTools: اختصارات لوحة المفاتيح |
| right-click menu | قائمة النقر بزر الماوس الأيمن | |
| site; turn off, turn on | موقع; إيقاف, تفعيل | Chrome: إيقاف, تفعيل |
| Off (menu entry) | إيقاف | Chrome: إيقاف |
| tab (in the browser) | علامة تبويب | Chrome: علامة تبويب جديدة |
| Recently deleted | المحذوفة مؤخرًا | |
| Undo | تراجع | Chrome: تراجع |
| insert | إدراج | |
| inserted as written | يُدرج كما هو مكتوب | |
| include; Includes | تضمين; يتضمن | |
| save | حفظ | Chrome: حفظ |
| delete; Delete forever | حذف; حذف نهائيًا | Chrome: حذف |
| restore | استعادة | Chrome: استعادة |
| remove (a folder, a link) | إزالة | Chrome: إزالة |
| move | نقل | |
| duplicate; Copy of | تكرار; نسخة من | |
| edit | تعديل | Chrome: تعديل |
| create; New snippet | إنشاء; مقتطف جديد | DevTools: مقتطف جديد |
| name | الاسم | Chrome: الاسم |
| optional | اختياري | Chrome: اختياري |
| character, characters | حرف, أحرف | |
| selected text | النص المحدد | |
| caret (text cursor) | مؤشر الكتابة | |
| Settings; Settings and backup | الإعدادات; الإعدادات والنسخ الاحتياطي | Chrome: الإعدادات |
| backup file; export; import | ملف النسخة الاحتياطية; تصدير; استيراد | |
| Failed to; Could not | تعذّر | |
| JSON terms: string; value; property name | سلسلة; قيمة; اسم الخاصية | |

Chrome's word for a keyboard shortcut, اختصار, is also the word for an abbreviation, so an
abbreviation is always اختصار نصي and a keyboard shortcut always اختصار لوحة المفاتيح.

### fa: Persian

- **languageName:** فارسی
- **Address:** شما, with plural verbs, as Chrome writes "مشکلی پیش آمد. بعداً دوباره امتحان کنید."
- **Keys:** Ctrl, تبدیل, Alt, ورود, Esc, Tab, Space, Cmd
- **Plural forms:** `one` for 0 and 1; `other` for every other number. A Persian noun after a number
  stays singular, so the 2 forms usually have the same text.

| English | Term | Source |
| --- | --- | --- |
| snippet, snippets | متن آماده, متن‌های آماده | |
| snippet panel; the panel | پانل متن‌های آماده; پانل | DevTools: پانل |
| snippet manager | مدیر متن‌های آماده | |
| abbreviation | اختصار | |
| placeholder (`{date}`) | جای‌نگهدار | |
| fill-in form; a field in it | فرم تکمیل; فیلد | |
| text field; text box | فیلد متنی; کادر متن | |
| rich-text editor | ویرایشگر متن قالب‌دار | |
| folder | پوشه | Chrome: انتخاب پوشه |
| formatted text; formatting | متن قالب‌بندی‌شده; قالب‌بندی | |
| code; code block | کد; بلوک کد | |
| Format JSON | قالب‌بندی JSON | |
| plain text | متن ساده | Chrome: متن ساده |
| list | فهرست | |
| link; address | پیوند; نشانی | |
| trigger key | کلید فعال‌سازی | |
| double tap; tap twice | دوبار فشردن; دو بار فشار دادن | |
| keyboard shortcut | میان‌بر صفحه‌کلید | DevTools: میان‌برهای صفحه‌کلید |
| right-click menu | منوی کلیک راست | |
| site; turn off, turn on | سایت; خاموش کردن, روشن کردن | Chrome: خاموش کردن, روشن کردن |
| Off (menu entry) | خاموش | |
| tab (in the browser) | زبانه | Chrome: زبانه جدید |
| Recently deleted | حذف‌شده‌های اخیر | |
| Undo | واگرد | Chrome: واگرد |
| insert | درج | |
| inserted as written | همان‌طور که نوشته شده درج می‌شود | |
| include; Includes | گنجاندن; شامل | |
| save | ذخیره | Chrome: ذخیره |
| delete; Delete forever | حذف; حذف دائمی | Chrome: حذف |
| restore | بازگرداندن | Chrome: بازگرداندن |
| remove (a folder, a link) | برداشتن | Chrome: برداشتن |
| move | انتقال | |
| duplicate; Copy of | تکثیر; رونوشت | |
| edit | ویرایش | Chrome: ویرایش |
| create; New snippet | ایجاد; متن آماده جدید | |
| name | نام | Chrome: نام |
| optional | اختیاری | Chrome: اختیاری |
| character, characters | نویسه | |
| selected text | متن انتخاب‌شده | |
| caret (text cursor) | مکان‌نما | |
| Settings; Settings and backup | تنظیمات; تنظیمات و پشتیبان‌گیری | Chrome: تنظیمات |
| backup file; export; import | فایل پشتیبان; صادر کردن; وارد کردن | |
| Failed to; Could not | ... نشد ("ذخیره نشد.") | |
| JSON terms: string; value; property name | رشته; مقدار; نام ویژگی | |

DevTools writes کدهای آماده and پاره‌کد, ready-made code; a snippet here is text, so this file uses
متن آماده, ready-made text.

### am: Amharic

- **languageName:** አማርኛ
- **Address:** polite, as Chrome writes "የሆነ ችግር ተፈጥሯል። ቆይተው እንደገና ይሞክሩ።" Buttons and menu
  items use the short imperative, as Chrome writes ሰርዝ and ዝጋ.
- **Keys:** Ctrl, Shift, Alt, Enter, Esc, Tab, ክፍተት, Cmd. Chrome writes ትር, its word for a browser
  tab, for the Tab key, and አስገባ, also the word for insert, for Enter; write Tab and Enter.
- **Plural forms:** `one` for 0 and 1; `other` for every other number.

| English | Term | Source |
| --- | --- | --- |
| snippet, snippets | ቅንጣቢ, ቅንጣቢዎች | DevTools: ቅንጣቢዎች |
| snippet panel; the panel | የቅንጣቢዎች ፓነል; ፓነል | DevTools: ፓነል |
| snippet manager | የቅንጣቢዎች አቀናባሪ | |
| abbreviation | አህጽሮተ ቃል | |
| placeholder (`{date}`) | ቦታ ያዥ | |
| fill-in form; a field in it | የሚሞላ ቅጽ; መስክ | |
| text field; text box | የጽሑፍ መስክ; የጽሑፍ ሳጥን | |
| rich-text editor | የበለጸገ ጽሑፍ አርታዒ | |
| folder | አቃፊ | Chrome: አቃፊ ምረጥ |
| formatted text; formatting | ቅርጸት ያለው ጽሑፍ; ቅርጸት | |
| code; code block | ኮድ; የኮድ ብሎክ | |
| Format JSON | JSON ቅረጽ | |
| plain text | ቅርፀት አልባ ጽሑፍ | Chrome: ቅርፀት አልባ ጽሑፍ |
| list | ዝርዝር | |
| link; address | አገናኝ; አድራሻ | |
| trigger key | ቀስቃሽ ቁልፍ | |
| double tap; tap twice | ሁለቴ መጫን; ሁለቴ ይጫኑ | |
| keyboard shortcut | የቁልፍ ሰሌዳ አቋራጭ | DevTools: የቁልፍ ሰሌዳ አቋራጮች |
| right-click menu | የቀኝ ጠቅታ ምናሌ | |
| site; turn off, turn on | ጣቢያ; አጥፋ, አብራ | Chrome: አጥፋ, አብራ |
| Off (menu entry) | ጠፍቷል | |
| tab (in the browser) | ትር | Chrome: አዲስ ትር |
| Recently deleted | በቅርቡ የተሰረዙ | |
| Undo | ቀልብስ | Chrome: ቀልብስ |
| insert | አስገባ | |
| inserted as written | እንደተጻፈ ይገባል | |
| include; Includes | አካትት; ያካትታል | |
| save | አስቀምጥ | Chrome: አስቀምጥ |
| delete; Delete forever | ሰርዝ; እስከመጨረሻው ሰርዝ | Chrome: ሰርዝ |
| restore | እነበረበት መልስ | Chrome: እነበረበት መልስ |
| remove (a folder, a link) | አስወግድ | Chrome: አስወግድ |
| move | አንቀሳቅስ | |
| duplicate; Copy of | አባዛ; ቅጂ | |
| edit | አርትዕ | Chrome: አርትዕ |
| create; New snippet | ፍጠር; አዲስ ቅንጣቢ | DevTools: አዲስ ቅንጣቢ |
| name | ስም | Chrome: ስም |
| optional | አስገዳጅ ያልሆነ | Chrome: አስገዳጅ ያልሆነ |
| character, characters | ቁምፊ | |
| selected text | የተመረጠ ጽሑፍ | |
| caret (text cursor) | ጠቋሚ | |
| Settings; Settings and backup | ቅንብሮች; ቅንብሮች እና ምትኬ | Chrome: ቅንብሮች |
| backup file; export; import | የምትኬ ፋይል; ወደ ውጭ ላክ; አስመጣ | |
| Failed to; Could not | ... አልተቻለም | |
| JSON terms: string; value; property name | ሕብረቁምፊ; እሴት; የንብረት ስም | |

### hi: Hindi

- **languageName:** हिन्दी
- **Address:** आप, as Chrome writes "कोई गड़बड़ी हुई. बाद में कोशिश करें." End a sentence with a
  period, not the danda, as Chrome does.
- **Keys:** Ctrl, Shift, Alt, Enter, Esc, Tab, Space, Cmd. Chrome writes टैब, its word for a browser
  tab, for the Tab key; write Tab.
- **Plural forms:** `one` for 0 and 1; `other` for every other number.

| English | Term | Source |
| --- | --- | --- |
| snippet, snippets | स्निपेट | DevTools: स्निपेट |
| snippet panel; the panel | स्निपेट पैनल; पैनल | DevTools: पैनल |
| snippet manager | स्निपेट मैनेजर | |
| abbreviation | संक्षिप्त रूप | |
| placeholder (`{date}`) | प्लेसहोल्डर | |
| fill-in form; a field in it | भरने वाला फ़ॉर्म; फ़ील्ड | |
| text field; text box | टेक्स्ट फ़ील्ड; टेक्स्ट बॉक्स | |
| rich-text editor | रिच टेक्स्ट एडिटर | |
| folder | फ़ोल्डर | Chrome: नया फ़ोल्डर |
| formatted text; formatting | फ़ॉर्मैट किया गया टेक्स्ट; फ़ॉर्मैटिंग | |
| code; code block | कोड; कोड ब्लॉक | |
| Format JSON | JSON फ़ॉर्मैट करें | DevTools: फ़ॉर्मैट |
| plain text | सादा टेक्स्ट | Chrome: सादा टेक्स्ट |
| list | सूची | |
| link; address | लिंक; पता | |
| trigger key | ट्रिगर कुंजी | |
| double tap; tap twice | दो बार दबाना; दो बार दबाएं | |
| keyboard shortcut | कीबोर्ड शॉर्टकट | DevTools: कीबोर्ड शॉर्टकट |
| right-click menu | राइट-क्लिक मेन्यू | |
| site; turn off, turn on | साइट; बंद करें, चालू करें | Chrome: बंद करें, चालू करें |
| Off (menu entry) | बंद | |
| tab (in the browser) | टैब | Chrome: नया टैब |
| Recently deleted | हाल ही में मिटाए गए | |
| Undo | पूर्ववत करें | |
| insert | डालें | |
| inserted as written | जैसा लिखा है वैसा ही डाला जाता है | |
| include; Includes | शामिल करना; इसमें शामिल | |
| save | सेव करें | Chrome: सेव करें |
| delete; Delete forever | मिटाएं; हमेशा के लिए मिटाएं | Chrome: मिटाएं |
| restore | वापस लाएं | Chrome: वापस लाएं |
| remove (a folder, a link) | हटाएं | Chrome: हटाएं |
| move | ले जाएं | |
| duplicate; Copy of | डुप्लीकेट बनाएं; की कॉपी ("$TITLE$ की कॉपी") | |
| edit | बदलाव करें | Chrome: बदलाव करें |
| create; New snippet | बनाएं; नया स्निपेट | DevTools: नया स्निपेट |
| name | नाम | Chrome: नाम |
| optional | वैकल्पिक | Chrome: वैकल्पिक |
| character, characters | वर्ण | |
| selected text | चुना गया टेक्स्ट | |
| caret (text cursor) | कर्सर | |
| Settings; Settings and backup | सेटिंग; सेटिंग और बैकअप | Chrome: सेटिंग |
| backup file; export; import | बैकअप फ़ाइल; एक्सपोर्ट करें; इंपोर्ट करें | |
| Failed to; Could not | ... नहीं किया जा सका | |
| JSON terms: string; value; property name | स्ट्रिंग; वैल्यू; प्रॉपर्टी का नाम | |

Chrome writes Undo as पूर्ववत् करें (13 characters) and पहले जैसा करें (14); the Undo button allows
12, so this file writes पूर्ववत करें.

### bn: Bengali

- **languageName:** বাংলা
- **Address:** আপনি, as Chrome writes "কোনও সমস্যা হয়েছে। পরে আবার চেষ্টা করুন।"
- **Keys:** Ctrl, Shift, Alt, Enter, Esc, Tab, Space, Cmd. Chrome writes ট্যাব, its word for a
  browser tab, for the Tab key; write Tab.
- **Plural forms:** `one` for 0 and 1; `other` for every other number.

| English | Term | Source |
| --- | --- | --- |
| snippet, snippets | স্নিপেট | DevTools: স্নিপেট |
| snippet panel; the panel | স্নিপেট প্যানেল; প্যানেল | DevTools: প্যানেল |
| snippet manager | স্নিপেট ম্যানেজার | |
| abbreviation | সংক্ষিপ্ত রূপ | |
| placeholder (`{date}`) | প্লেসহোল্ডার | |
| fill-in form; a field in it | পূরণের ফর্ম; ফিল্ড | |
| text field; text box | টেক্সট ফিল্ড; টেক্সট বক্স | |
| rich-text editor | রিচ টেক্সট এডিটর | |
| folder | ফোল্ডার | Chrome: নতুন ফোল্ডার |
| formatted text; formatting | ফর্ম্যাট করা টেক্সট; ফর্ম্যাটিং | |
| code; code block | কোড; কোড ব্লক | |
| Format JSON | JSON ফর্ম্যাট করুন | DevTools: ফর্ম্যাট |
| plain text | প্লেন টেক্সট | Chrome: প্লেন টেক্সট |
| list | তালিকা | |
| link; address | লিঙ্ক; ঠিকানা | |
| trigger key | ট্রিগার কী | |
| double tap; tap twice | দুবার প্রেস করা; দুবার প্রেস করুন | |
| keyboard shortcut | কীবোর্ড শর্টকাট | DevTools: কীবোর্ড শর্টকাট |
| right-click menu | রাইট-ক্লিক মেনু | |
| site; turn off, turn on | সাইট; বন্ধ করুন, চালু করুন | Chrome: বন্ধ করুন, চালু করুন |
| Off (menu entry) | বন্ধ | |
| tab (in the browser) | ট্যাব | Chrome: নতুন ট্যাব |
| Recently deleted | সম্প্রতি মুছে ফেলা | |
| Undo | আনডু করুন | |
| insert | ঢোকান | |
| inserted as written | যেমন লেখা আছে তেমনই ঢোকানো হয় | |
| include; Includes | অন্তর্ভুক্ত করা; অন্তর্ভুক্ত | |
| save | সেভ করুন | Chrome: সেভ করুন |
| delete; Delete forever | মুছুন; স্থায়ীভাবে মুছুন | Chrome: মুছুন |
| restore | পুনরুদ্ধার করুন | Chrome: পুনরুদ্ধার করুন |
| remove (a folder, a link) | সরান | Chrome: সরান |
| move | নিয়ে যান | |
| duplicate; Copy of | ডুপ্লিকেট করুন; -এর কপি ("$TITLE$-এর কপি") | |
| edit | সম্পাদনা করুন | Chrome: সম্পাদনা |
| create; New snippet | তৈরি করুন; নতুন স্নিপেট | DevTools: নতুন স্নিপেট |
| name | নাম | Chrome: নাম |
| optional | ঐচ্ছিক | Chrome: ঐচ্ছিক |
| character, characters | অক্ষর | |
| selected text | বেছে নেওয়া টেক্সট | |
| caret (text cursor) | কার্সার | |
| Settings; Settings and backup | সেটিংস; সেটিংস ও ব্যাকআপ | Chrome: সেটিংস |
| backup file; export; import | ব্যাকআপ ফাইল; এক্সপোর্ট করুন; ইমপোর্ট করুন | |
| Failed to; Could not | ... করা যায়নি | |
| JSON terms: string; value; property name | স্ট্রিং; মান; প্রপার্টির নাম | |

Chrome writes Undo as পূর্বাবস্থায় ফিরুন and আগের অবস্থায় ফিরুন, both longer than the 12
characters the Undo button allows, so this file writes আনডু করুন.

### mr: Marathi

- **languageName:** मराठी
- **Address:** तुम्ही, as Chrome writes "तुमच्या फोनवरून या नंबरवर कॉल करायचा का?"
- **Keys:** Ctrl, Shift, Alt, एंटर, Esc, Tab, स्पेस, Cmd. Chrome writes टॅब, its word for a browser
  tab, for the Tab key; write Tab.
- **Plural forms:** `one` for 1; `other` for every other number, 0 included.

| English | Term | Source |
| --- | --- | --- |
| snippet, snippets | स्निपेट | DevTools: स्निपेट |
| snippet panel; the panel | स्निपेट पॅनल; पॅनल | DevTools: पॅनल |
| snippet manager | स्निपेट व्यवस्थापक | |
| abbreviation | संक्षेप | |
| placeholder (`{date}`) | प्लेसहोल्डर | |
| fill-in form; a field in it | भरायचा फॉर्म; फील्ड | |
| text field; text box | मजकूर फील्ड; मजकूर बॉक्स | |
| rich-text editor | रिच मजकूर संपादक | |
| folder | फोल्डर | Chrome: फोल्डर निवडा |
| formatted text; formatting | फॉरमॅट केलेला मजकूर; फॉरमॅटिंग | |
| code; code block | कोड; कोड ब्लॉक | |
| Format JSON | JSON फॉरमॅट करा | DevTools: फॉरमॅट करा |
| plain text | साधा मजकूर | Chrome: साधा मजकूर |
| list | सूची | |
| link; address | लिंक; पत्ता | |
| trigger key | ट्रिगर की | |
| double tap; tap twice | दोनदा दाबणे; दोनदा दाबा | |
| keyboard shortcut | कीबोर्ड शॉर्टकट | DevTools: कीबोर्ड शॉर्टकट |
| right-click menu | राइट-क्लिक मेनू | |
| site; turn off, turn on | साइट; बंद करा, सुरू करा | Chrome: बंद करा, सुरू करा |
| Off (menu entry) | बंद | |
| tab (in the browser) | टॅब | Chrome: नवीन टॅब |
| Recently deleted | अलीकडे हटवलेले | |
| Undo | पूर्ववत करा | Chrome: पूर्ववत करा |
| insert | घाला | |
| inserted as written | जसे लिहिले तसे घातले जाते | |
| include; Includes | समाविष्ट करणे; समाविष्ट | |
| save | सेव्ह करा | Chrome: सेव्ह करा |
| delete; Delete forever | हटवा; कायमचे हटवा | Chrome: हटवा |
| restore | पुनर्संचयित करा | Chrome: पुनर्संचयित करा |
| remove (a folder, a link) | काढून टाका | Chrome: काढून टाका |
| move | हलवा | |
| duplicate; Copy of | डुप्लिकेट करा; ची प्रत ("$TITLE$ ची प्रत") | |
| edit | संपादित करा | |
| create; New snippet | तयार करा; नवीन स्निपेट | DevTools: नवीन स्निपेट |
| name | नाव | Chrome: नाव |
| optional | पर्यायी | Chrome: पर्यायी |
| character, characters | वर्ण | |
| selected text | निवडलेला मजकूर | |
| caret (text cursor) | कर्सर | |
| Settings; Settings and backup | सेटिंग्ज; सेटिंग्ज आणि बॅकअप | Chrome: सेटिंग्ज |
| backup file; export; import | बॅकअप फाइल; एक्सपोर्ट करा; इंपोर्ट करा | |
| Failed to; Could not | ... करता आले नाही | |
| JSON terms: string; value; property name | स्ट्रिंग; मूल्य; प्रॉपर्टीचे नाव | |

### gu: Gujarati

- **languageName:** ગુજરાતી
- **Address:** તમે, as Chrome writes "કંઈક ખોટું થયું હતું. થોડીવાર પછી ફરી પ્રયાસ કરો."
- **Keys:** Ctrl, Shift, Alt, Enter, Esc, Tab, Space, Cmd. Chrome writes ટૅબ, its word for a browser
  tab, for the Tab key; write Tab.
- **Plural forms:** `one` for 0 and 1; `other` for every other number.

| English | Term | Source |
| --- | --- | --- |
| snippet, snippets | સ્નિપેટ | DevTools: સ્નિપેટ |
| snippet panel; the panel | સ્નિપેટ પૅનલ; પૅનલ | DevTools: પૅનલ |
| snippet manager | સ્નિપેટ મેનેજર | |
| abbreviation | સંક્ષેપ | |
| placeholder (`{date}`) | પ્લેસહોલ્ડર | |
| fill-in form; a field in it | ભરવાનું ફોર્મ; ફીલ્ડ | |
| text field; text box | ટેક્સ્ટ ફીલ્ડ; ટેક્સ્ટ બૉક્સ | |
| rich-text editor | રિચ ટેક્સ્ટ એડિટર | |
| folder | ફોલ્ડર | Chrome: નવું ફોલ્ડર |
| formatted text; formatting | ફૉર્મેટ કરેલી ટેક્સ્ટ; ફૉર્મેટિંગ | |
| code; code block | કોડ; કોડ બ્લૉક | |
| Format JSON | JSON ફૉર્મેટ કરો | DevTools: ફૉર્મેટ |
| plain text | સાદી ટેક્સ્ટ | Chrome: સાદી ટેક્સ્ટ |
| list | સૂચિ | |
| link; address | લિંક; ઍડ્રેસ | |
| trigger key | ટ્રિગર કી | |
| double tap; tap twice | બે વાર દબાવવું; બે વાર દબાવો | |
| keyboard shortcut | કીબોર્ડ શૉર્ટકટ | DevTools: કીબોર્ડ શૉર્ટકટ |
| right-click menu | રાઇટ-ક્લિક મેનૂ | |
| site; turn off, turn on | સાઇટ; બંધ કરો, ચાલુ કરો | Chrome: બંધ કરો, ચાલુ કરો |
| Off (menu entry) | બંધ | |
| tab (in the browser) | ટૅબ | Chrome: નવું ટૅબ |
| Recently deleted | તાજેતરમાં ડિલીટ કરેલા | |
| Undo | પૂર્વવત્ કરો | Chrome: પૂર્વવત્ કરો |
| insert | દાખલ કરો | |
| inserted as written | જેમ લખ્યું છે તેમ દાખલ થાય છે | |
| include; Includes | સમાવવું; સમાવે છે | |
| save | સાચવો | Chrome: સાચવો |
| delete; Delete forever | ડિલીટ કરો; કાયમ માટે ડિલીટ કરો | Chrome: ડિલીટ કરો |
| restore | રિસ્ટોર કરો | Chrome: રિસ્ટોર કરો |
| remove (a folder, a link) | કાઢી નાખો | Chrome: કાઢી નાખો |
| move | ખસેડો | |
| duplicate; Copy of | ડુપ્લિકેટ બનાવો; ની કૉપિ ("$TITLE$ની કૉપિ") | |
| edit | ફેરફાર કરો | Chrome: ફેરફાર કરો |
| create; New snippet | બનાવો; નવું સ્નિપેટ | DevTools: નવું સ્નિપેટ |
| name | નામ | Chrome: નામ |
| optional | વૈકલ્પિક | Chrome: વૈકલ્પિક |
| character, characters | અક્ષર | |
| selected text | પસંદ કરેલી ટેક્સ્ટ | |
| caret (text cursor) | કર્સર | |
| Settings; Settings and backup | સેટિંગ; સેટિંગ અને બૅકઅપ | Chrome: સેટિંગ |
| backup file; export; import | બૅકઅપ ફાઇલ; એક્સપોર્ટ કરો; ઇમ્પોર્ટ કરો | |
| Failed to; Could not | ... કરી શક્યા નથી | |
| JSON terms: string; value; property name | સ્ટ્રિંગ; મૂલ્ય; પ્રોપર્ટીનું નામ | |

### ta: Tamil

- **languageName:** தமிழ்
- **Address:** நீங்கள், with polite imperatives in -வும் in sentences, as Chrome writes "ஏதோ
  தவறாகிவிட்டது. பிறகு முயலவும்." Buttons use the short imperative, as Chrome writes நீக்கு and
  சேமி.
- **Keys:** Ctrl, Shift, Alt, Enter, Esc, Tab, ஸ்பேஸ், Cmd
- **Plural forms:** `one` for 1; `other` for every other number, 0 included.

| English | Term | Source |
| --- | --- | --- |
| snippet, snippets | துணுக்கு, துணுக்குகள் | DevTools: துணுக்குகள் |
| snippet panel; the panel | துணுக்குப் பேனல்; பேனல் | DevTools: பேனல் |
| snippet manager | துணுக்கு நிர்வாகி | |
| abbreviation | சுருக்கக் குறியீடு | |
| placeholder (`{date}`) | பிளேஸ்ஹோல்டர் | |
| fill-in form; a field in it | நிரப்பும் படிவம்; புலம் | |
| text field; text box | உரைப் புலம்; உரைப் பெட்டி | |
| rich-text editor | ரிச் டெக்ஸ்ட் எடிட்டர் | |
| folder | ஃபோல்டர் | Chrome: புதிய ஃபோல்டர் |
| formatted text; formatting | வடிவமைத்த உரை; வடிவமைப்பு | |
| code; code block | குறியீடு; குறியீட்டுத் தொகுதி | |
| Format JSON | JSON வடிவமை | |
| plain text | எளிய உரை | Chrome: எளிய உரை |
| list | பட்டியல் | |
| link; address | இணைப்பு; முகவரி | |
| trigger key | இயக்கும் விசை | |
| double tap; tap twice | இருமுறை அழுத்துதல்; இருமுறை அழுத்தவும் | |
| keyboard shortcut | கீபோர்டு ஷார்ட்கட் | DevTools: கீபோர்டு ஷார்ட்கட்கள் |
| right-click menu | வலது கிளிக் மெனு | |
| site; turn off, turn on | தளம்; ஆஃப் செய், இயக்கு | Chrome: ஆஃப் செய், இயக்கு |
| Off (menu entry) | ஆஃப் | |
| tab (in the browser) | தாவல் | Chrome: புதிய தாவல் |
| Recently deleted | சமீபத்தில் நீக்கியவை | |
| Undo | செயல்தவிர் | Chrome: செயல்தவிர் |
| insert | செருகு | |
| inserted as written | எழுதியபடியே செருகப்படும் | |
| include; Includes | சேர்; உள்ளடக்கியவை | |
| save | சேமி | Chrome: சேமி |
| delete; Delete forever | நீக்கு; நிரந்தரமாக நீக்கு | Chrome: நீக்கு |
| restore | மீட்டமை | Chrome: மீட்டமை |
| remove (a folder, a link) | அகற்று | Chrome: அகற்று |
| move | நகர்த்து | |
| duplicate; Copy of | நகல் உருவாக்கு; இன் நகல் ("$TITLE$ இன் நகல்") | |
| edit | திருத்து | Chrome: திருத்து |
| create; New snippet | உருவாக்கு; புதிய துணுக்கு | DevTools: புதிய துணுக்கு |
| name | பெயர் | Chrome: பெயர் |
| optional | விரும்பினால் | Chrome: விரும்பினால் |
| character, characters | எழுத்து | |
| selected text | தேர்ந்தெடுத்த உரை | |
| caret (text cursor) | கர்சர் | |
| Settings; Settings and backup | அமைப்புகள்; அமைப்புகளும் காப்புப்பிரதியும் | Chrome: அமைப்புகள் |
| backup file; export; import | காப்புப்பிரதிக் கோப்பு; ஏற்றுமதி செய்; இறக்குமதி செய் | |
| Failed to; Could not | ... முடியவில்லை | |
| JSON terms: string; value; property name | ஸ்ட்ரிங்; மதிப்பு; பண்பின் பெயர் | |

### te: Telugu

- **languageName:** తెలుగు
- **Address:** మీరు, as Chrome writes "ఈ డిస్‌ప్లే అనేది టచ్‌స్క్రీన్ కాకపోతే, Esc బటన్ నొక్కండి."
- **Keys:** Ctrl, Shift, Alt, Enter, Esc, Tab, స్పేస్, Cmd
- **Plural forms:** `one` for 1; `other` for every other number, 0 included.

| English | Term | Source |
| --- | --- | --- |
| snippet, snippets | స్నిప్పెట్, స్నిప్పెట్‌లు | DevTools: స్నిప్పెట్‌లు |
| snippet panel; the panel | స్నిప్పెట్ ప్యానెల్; ప్యానెల్ | DevTools: ప్యానెల్ |
| snippet manager | స్నిప్పెట్ మేనేజర్ | |
| abbreviation | సంక్షిప్త రూపం | |
| placeholder (`{date}`) | ప్లేస్‌హోల్డర్ | |
| fill-in form; a field in it | పూరించే ఫారమ్; ఫీల్డ్ | |
| text field; text box | టెక్స్ట్ ఫీల్డ్; టెక్స్ట్ బాక్స్ | |
| rich-text editor | రిచ్ టెక్స్ట్ ఎడిటర్ | |
| folder | ఫోల్డర్ | Chrome: ఫోల్డర్ |
| formatted text; formatting | ఫార్మాట్ చేసిన టెక్స్ట్; ఫార్మాటింగ్ | |
| code; code block | కోడ్; కోడ్ బ్లాక్ | |
| Format JSON | JSON ఫార్మాట్ చేయండి | DevTools: ఫార్మాట్ |
| plain text | సాదా టెక్స్ట్ | Chrome: సాదా టెక్స్ట్ |
| list | జాబితా | |
| link; address | లింక్; అడ్రస్ | |
| trigger key | ట్రిగ్గర్ కీ | |
| double tap; tap twice | రెండుసార్లు నొక్కడం; రెండుసార్లు నొక్కండి | |
| keyboard shortcut | కీబోర్డ్ షార్ట్‌కట్ | DevTools: కీబోర్డ్ షార్ట్‌కట్‌లు |
| right-click menu | రైట్-క్లిక్ మెనూ | |
| site; turn off, turn on | సైట్; ఆఫ్ చేయండి, ఆన్ చేయండి | Chrome: ఆన్ చేయండి |
| Off (menu entry) | ఆఫ్ | |
| tab (in the browser) | ట్యాబ్ | Chrome: కొత్త ట్యాబ్ |
| Recently deleted | ఇటీవల తొలగించినవి | |
| Undo | చర్య రద్దు | Chrome: చర్య రద్దు |
| insert | చొప్పించండి | |
| inserted as written | రాసినట్లే చొప్పించబడుతుంది | |
| include; Includes | చేర్చడం; చేర్చినవి | |
| save | సేవ్ చేయండి | Chrome: సేవ్ చేయండి |
| delete; Delete forever | తొలగించండి; శాశ్వతంగా తొలగించండి | Chrome: తొలగించండి |
| restore | పునరుద్ధరించండి | |
| remove (a folder, a link) | తీసివేయండి | Chrome: తీసివేయండి |
| move | తరలించండి | |
| duplicate; Copy of | డూప్లికేట్ చేయండి; కాపీ ("$TITLE$ కాపీ") | |
| edit | ఎడిట్ చేయండి | Chrome: ఎడిట్ |
| create; New snippet | క్రియేట్ చేయండి; కొత్త స్నిప్పెట్ | DevTools: కొత్త స్నిప్పెట్ |
| name | పేరు | Chrome: పేరు |
| optional | ఐచ్ఛికం | Chrome: ఐచ్ఛికం |
| character, characters | అక్షరం | |
| selected text | ఎంచుకున్న టెక్స్ట్ | |
| caret (text cursor) | కర్సర్ | |
| Settings; Settings and backup | సెట్టింగ్‌లు; సెట్టింగ్‌లు, బ్యాకప్ | Chrome: సెట్టింగ్‌లు |
| backup file; export; import | బ్యాకప్ ఫైల్; ఎగుమతి చేయండి; దిగుమతి చేయండి | |
| Failed to; Could not | ... సాధ్యపడలేదు | |
| JSON terms: string; value; property name | స్ట్రింగ్; విలువ; ప్రాపర్టీ పేరు | |

### kn: Kannada

- **languageName:** ಕನ್ನಡ
- **Address:** ನೀವು, as Chrome writes "ಏನೋ ತಪ್ಪಾಗಿದೆ. ನಂತರ ಪುನಃ ಪ್ರಯತ್ನಿಸಿ."
- **Keys:** Ctrl, Shift, Alt, Enter, Esc, Tab, ಸ್ಪೇಸ್, Cmd. Chrome writes ಟ್ಯಾಬ್, its word for a
  browser tab, for the Tab key; write Tab.
- **Plural forms:** `one` for 0 and 1; `other` for every other number.

| English | Term | Source |
| --- | --- | --- |
| snippet, snippets | ತುಣುಕು, ತುಣುಕುಗಳು | DevTools: ತುಣುಕುಗಳು |
| snippet panel; the panel | ತುಣುಕುಗಳ ಪ್ಯಾನೆಲ್; ಪ್ಯಾನೆಲ್ | DevTools: ಪ್ಯಾನೆಲ್ |
| snippet manager | ತುಣುಕುಗಳ ನಿರ್ವಾಹಕ | |
| abbreviation | ಸಂಕ್ಷಿಪ್ತ ರೂಪ | |
| placeholder (`{date}`) | ಪ್ಲೇಸ್‌ಹೋಲ್ಡರ್ | |
| fill-in form; a field in it | ಭರ್ತಿ ಮಾಡುವ ಫಾರ್ಮ್; ಫೀಲ್ಡ್ | |
| text field; text box | ಪಠ್ಯ ಫೀಲ್ಡ್; ಪಠ್ಯ ಬಾಕ್ಸ್ | |
| rich-text editor | ರಿಚ್ ಟೆಕ್ಸ್ಟ್ ಎಡಿಟರ್ | |
| folder | ಫೋಲ್ಡರ್ | Chrome: ಹೊಸ ಫೋಲ್ಡರ್ |
| formatted text; formatting | ಫಾರ್ಮ್ಯಾಟ್ ಮಾಡಿದ ಪಠ್ಯ; ಫಾರ್ಮ್ಯಾಟಿಂಗ್ | |
| code; code block | ಕೋಡ್; ಕೋಡ್ ಬ್ಲಾಕ್ | |
| Format JSON | JSON ಫಾರ್ಮ್ಯಾಟ್ ಮಾಡಿ | DevTools: ಫಾರ್ಮ್ಯಾಟ್ |
| plain text | ಸರಳ ಪಠ್ಯ | Chrome: ಸರಳ ಪಠ್ಯ |
| list | ಪಟ್ಟಿ | |
| link; address | ಲಿಂಕ್; ವಿಳಾಸ | |
| trigger key | ಟ್ರಿಗರ್ ಕೀ | |
| double tap; tap twice | ಎರಡು ಬಾರಿ ಒತ್ತುವುದು; ಎರಡು ಬಾರಿ ಒತ್ತಿರಿ | |
| keyboard shortcut | ಕೀಬೋರ್ಡ್ ಶಾರ್ಟ್‌ಕಟ್ | DevTools: ಕೀಬೋರ್ಡ್ ಶಾರ್ಟ್‌ಕಟ್‌ಗಳು |
| right-click menu | ರೈಟ್-ಕ್ಲಿಕ್ ಮೆನು | |
| site; turn off, turn on | ಸೈಟ್; ಆಫ್ ಮಾಡಿ, ಆನ್ ಮಾಡಿ | Chrome: ಆಫ್ ಮಾಡಿ, ಆನ್ ಮಾಡಿ |
| Off (menu entry) | ಆಫ್ | |
| tab (in the browser) | ಟ್ಯಾಬ್ | Chrome: ಹೊಸ ಟ್ಯಾಬ್ |
| Recently deleted | ಇತ್ತೀಚೆಗೆ ಅಳಿಸಲಾದವು | |
| Undo | ರದ್ದುಮಾಡು | Chrome: ರದ್ದುಮಾಡು |
| insert | ಸೇರಿಸಿ | |
| inserted as written | ಬರೆದಂತೆಯೇ ಸೇರಿಸಲಾಗುತ್ತದೆ | |
| include; Includes | ಒಳಗೊಳ್ಳುವುದು; ಒಳಗೊಂಡಿದೆ | |
| save | ಸೇವ್ ಮಾಡಿ | Chrome: ಸೇವ್ ಮಾಡಿ |
| delete; Delete forever | ಅಳಿಸಿ; ಶಾಶ್ವತವಾಗಿ ಅಳಿಸಿ | Chrome: ಅಳಿಸಿ |
| restore | ಮರುಸ್ಥಾಪಿಸಿ | |
| remove (a folder, a link) | ತೆಗೆದುಹಾಕಿ | |
| move | ಸರಿಸಿ | |
| duplicate; Copy of | ನಕಲು ಮಾಡಿ; ನ ನಕಲು ("$TITLE$ ನ ನಕಲು") | |
| edit | ಎಡಿಟ್ ಮಾಡಿ | Chrome: ಎಡಿಟ್ |
| create; New snippet | ರಚಿಸಿ; ಹೊಸ ತುಣುಕು | DevTools: ಹೊಸ ತುಣುಕು |
| name | ಹೆಸರು | Chrome: ಹೆಸರು |
| optional | ಐಚ್ಛಿಕ | Chrome: ಐಚ್ಛಿಕ |
| character, characters | ಅಕ್ಷರ | |
| selected text | ಆಯ್ಕೆಮಾಡಿದ ಪಠ್ಯ | |
| caret (text cursor) | ಕರ್ಸರ್ | |
| Settings; Settings and backup | ಸೆಟ್ಟಿಂಗ್‌ಗಳು; ಸೆಟ್ಟಿಂಗ್‌ಗಳು ಮತ್ತು ಬ್ಯಾಕಪ್ | Chrome: ಸೆಟ್ಟಿಂಗ್‌ಗಳು |
| backup file; export; import | ಬ್ಯಾಕಪ್ ಫೈಲ್; ರಫ್ತು ಮಾಡಿ; ಆಮದು ಮಾಡಿ | |
| Failed to; Could not | ... ಸಾಧ್ಯವಾಗಲಿಲ್ಲ | |
| JSON terms: string; value; property name | ಸ್ಟ್ರಿಂಗ್; ಮೌಲ್ಯ; ಪ್ರಾಪರ್ಟಿ ಹೆಸರು | |

Chrome writes Undo as ರದ್ದುಮಾಡು and Cancel as ರದ್ದುಮಾಡಿ; this file does the same.

### ml: Malayalam

- **languageName:** മലയാളം
- **Address:** നിങ്ങൾ, with imperatives in -ുക, as Chrome writes "എന്തോ കുഴപ്പം സംഭവിച്ചു. പിന്നീട്
  വീണ്ടും ശ്രമിക്കുക."
- **Keys:** Ctrl, Shift, Alt, Enter, Esc, Tab, സ്‌പെയ്‌സ്, Cmd. Chrome writes ടാബ്, its word for a
  browser tab, for the Tab key; write Tab.
- **Plural forms:** `one` for 1; `other` for every other number, 0 included.

| English | Term | Source |
| --- | --- | --- |
| snippet, snippets | സ്‌നിപ്പെറ്റ്, സ്‌നിപ്പെറ്റുകൾ | DevTools: സ്‌നിപ്പെറ്റുകൾ |
| snippet panel; the panel | സ്‌നിപ്പെറ്റ് പാനൽ; പാനൽ | DevTools: പാനൽ |
| snippet manager | സ്‌നിപ്പെറ്റ് മാനേജർ | |
| abbreviation | ചുരുക്കെഴുത്ത് | |
| placeholder (`{date}`) | പ്ലെയ്‌സ്‌ഹോൾഡർ | |
| fill-in form; a field in it | പൂരിപ്പിക്കൽ ഫോം; ഫീൽഡ് | |
| text field; text box | ടെക്‌സ്റ്റ് ഫീൽഡ്; ടെക്‌സ്റ്റ് ബോക്‌സ് | |
| rich-text editor | റിച്ച് ടെക്‌സ്റ്റ് എഡിറ്റർ | |
| folder | ഫോൾഡർ | |
| formatted text; formatting | ഫോർമാറ്റ് ചെയ്ത ടെക്‌സ്റ്റ്; ഫോർമാറ്റിംഗ് | |
| code; code block | കോഡ്; കോഡ് ബ്ലോക്ക് | |
| Format JSON | JSON ഫോർമാറ്റ് ചെയ്യുക | DevTools: ഫോർമാറ്റ് |
| plain text | പ്ലെയിൻ ടെക്‌സ്റ്റ് | Chrome: പ്ലെയിൻ ടെക്‌സ്റ്റ് |
| list | ലിസ്റ്റ് | |
| link; address | ലിങ്ക്; വിലാസം | |
| trigger key | ട്രിഗർ കീ | |
| double tap; tap twice | രണ്ടുതവണ അമർത്തൽ; രണ്ടുതവണ അമർത്തുക | |
| keyboard shortcut | കീബോർഡ് കുറുക്കുവഴി | DevTools: കീബോർഡ് കുറുക്കുവഴികൾ |
| right-click menu | റൈറ്റ് ക്ലിക്ക് മെനു | |
| site; turn off, turn on | സൈറ്റ്; ഓഫാക്കുക, ഓണാക്കുക | Chrome: ഓഫാക്കുക, ഓണാക്കുക |
| Off (menu entry) | ഓഫ് | |
| tab (in the browser) | ടാബ് | Chrome: പുതിയ ടാബ് |
| Recently deleted | അടുത്തിടെ ഇല്ലാതാക്കിയവ | |
| Undo | പഴയപടിയാക്കൂ | |
| insert | ചേർക്കുക | |
| inserted as written | എഴുതിയതുപോലെ ചേർക്കും | |
| include; Includes | ഉൾപ്പെടുത്തുക; ഉൾപ്പെടുന്നവ | |
| save | സംരക്ഷിക്കുക | Chrome: സംരക്ഷിക്കുക |
| delete; Delete forever | ഇല്ലാതാക്കുക; ശാശ്വതമായി ഇല്ലാതാക്കുക | Chrome: ഇല്ലാതാക്കുക |
| restore | പുനഃസ്ഥാപിക്കുക | Chrome: പുനഃസ്ഥാപിക്കുക |
| remove (a folder, a link) | നീക്കം ചെയ്യുക | |
| move | നീക്കുക | |
| duplicate; Copy of | ഡ്യൂപ്ലിക്കേറ്റ് ചെയ്യുക; എന്നതിന്റെ പകർപ്പ് ("$TITLE$ എന്നതിന്റെ പകർപ്പ്") | |
| edit | എഡിറ്റ് ചെയ്യുക | Chrome: എഡിറ്റ് ചെയ്യുക |
| create; New snippet | സൃഷ്ടിക്കുക; പുതിയ സ്‌നിപ്പെറ്റ് | |
| name | പേര് | Chrome: പേര് |
| optional | ഓപ്‌ഷണൽ | Chrome: ഓപ്‌ഷണൽ |
| character, characters | പ്രതീകം | |
| selected text | തിരഞ്ഞെടുത്ത ടെക്‌സ്റ്റ് | |
| caret (text cursor) | കഴ്‌സർ | |
| Settings; Settings and backup | ക്രമീകരണം; ക്രമീകരണവും ബാക്കപ്പും | Chrome: ക്രമീകരണം |
| backup file; export; import | ബാക്കപ്പ് ഫയൽ; എക്‌സ്‌പോർട്ട് ചെയ്യുക; ഇംപോർട്ട് ചെയ്യുക | |
| Failed to; Could not | ... കഴിഞ്ഞില്ല | |
| JSON terms: string; value; property name | സ്ട്രിംഗ്; മൂല്യം; പ്രോപ്പർട്ടിയുടെ പേര് | |

Write the chillu letters as single characters (ൾ, ർ, ൽ, ൻ), as DevTools does; Chrome's components
file still spells some words with the older sequence, as in its word for folder. Chrome writes Undo
as പഴയപടിയാക്കുക, 13 characters; the Undo button allows 12, so this file uses the shorter
imperative പഴയപടിയാക്കൂ, the form Chrome uses on buttons such as ഇല്ലാതാക്കൂ.
