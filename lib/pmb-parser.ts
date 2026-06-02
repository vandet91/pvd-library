/**
 * PMB (PhpMyBibli) SQL dump parser.
 *
 * Reads a MySQL dump exported from PMB and extracts the tables needed
 * to migrate books, authors, publishers and categories into PVD.
 */

export interface PmbNotice {
  notice_id:     number;
  titre:         string;
  soustitre:     string;
  isbn:          string;
  annee:         string;
  npages:        string;
  langue:        string;
  index_l:       string; // Dewey/call number — NOT a language field
  thumbnail_url: string;
  notice_type:   string;
  ed_note:       string;
  n_contenu:     string;
  ed_editeur:    number; // direct FK → publishers.publisher_id
  public_cible:  string; // audience field (e.g. "1", "adulte", "jeune", "enfant")
}

export interface PmbAuthor {
  author_id:        number;
  author_name:      string;   // last name
  author_firstname: string;   // first name (author_firstname or author_rejete)
}

export interface PmbAuthorNotice {
  notice_id:            number;
  author_id:            number;
  fonction:             string;  // 0 or AUT = primary; others = co-author
  author_display_order: number;
}

export interface PmbPublisher {
  publisher_id:   number; // ed_id in this PMB version
  publisher_name: string; // ed_name in this PMB version
}

export interface PmbPublisherNotice {
  notice_id:    number;
  publisher_id: number;
}

export interface PmbCategory {
  num_noeud:         string | number; // PK in this PMB version
  libelle_categorie: string;          // category name
  father:            string;
}

export interface PmbCategoryNotice {
  notice_id: number;
  num_noeud: string | number;         // FK → categories.num_noeud
}

export interface PmbExemplaire {
  exemplaire_id:   number;
  notice_id:       number;  // expl_notice FK
  cb:              string;  // expl_cb barcode
  expl_cote:       string;  // call number / location label (resolved)
  expl_condition:  string;  // condition/status
  expl_prix:       number;  // price
  expl_owner:      string;  // lender ID (branch)
  expl_location:   string;  // docs_location ID (raw)
  expl_section:    string;  // docs_section ID (raw)
}

export interface PmbEmpr {
  empr_id:                       number;
  empr_nom:                      string;   // last name
  empr_prenom:                   string;   // first name
  empr_cb:                       string;   // card barcode / member ID
  empr_mail:                     string;   // email
  empr_tel:                      string;   // phone
  empr_adr1:                     string;   // address line 1
  empr_adr2:                     string;   // address line 2
  empr_cp:                       string;   // postal code
  empr_ville:                    string;   // city
  empr_categ:                    string;   // resolved category label (e.g. "Étudiant")
  empr_categ_raw:                string;   // raw numeric ID from the dump
  empr_sexe:                     number;   // 0=unspecified, 1=male, 2=female
  date_expiration_abonnement:    string;   // membership expiry (YYYY-MM-DD)
  empr_date_adhesion:            string;   // join date (YYYY-MM-DD)
  // Resolved from empr_custom_values
  school:                        string | null;
  className:                     string | null;
}

export interface PmbPret {
  pret_id:                   number;
  expl_id:                   number;  // FK → exemplaires.exemplaire_id
  notice_id:                 number;  // FK → notices.notice_id (direct on pret_archive)
  empr_id:                   number;  // FK → empr.empr_id
  pret_date:                 string;  // loan date  YYYY-MM-DD
  pret_retour:               string;  // due date   YYYY-MM-DD
  pret_retour_reel:          string;  // actual return date — empty if still out
  location_origine:          string;  // '0' = not yet returned (pret_archive)
}

export interface PmbDump {
  notices:            PmbNotice[];
  authors:            PmbAuthor[];
  authors_notices:    PmbAuthorNotice[];
  publishers:         PmbPublisher[];
  publishers_notices: PmbPublisherNotice[];
  categories:         PmbCategory[];
  notices_categories: PmbCategoryNotice[];
  exemplaires:        PmbExemplaire[];
  empr:               PmbEmpr[];
  pret:               PmbPret[];
  lenders:            { id: string; name: string }[];
  locations:          { id: string; name: string }[];  // docs_location
  sections:           { id: string; name: string }[];  // docs_section
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Backtick char without embedding it in source (avoids template-literal parser bug). */
const BT = String.fromCharCode(96);

/**
 * Find all complete INSERT statements for a given table,
 * scanning char-by-char to respect quoted strings
 * (so semicolons inside string values don't end the statement early).
 */
function findInsertStatements(sql: string, table: string): string[] {
  const results: string[] = [];
  // Match both `table` and table (with/without backticks)
  const needleBt  = ("insert into " + BT + table + BT).toLowerCase();
  const needleRaw = ("insert into " + table + " ").toLowerCase();
  const sqlLow    = sql.toLowerCase();

  let pos = 0;
  while (pos < sql.length) {
    const startBt  = sqlLow.indexOf(needleBt,  pos);
    const startRaw = sqlLow.indexOf(needleRaw, pos);
    // Pick whichever match comes first
    const start = startBt === -1 ? startRaw
                : startRaw === -1 ? startBt
                : Math.min(startBt, startRaw);
    if (start === -1) break;

    // Scan forward to find the statement-ending semicolon,
    // skipping over quoted string contents.
    let i       = start;
    let inStr   = false;
    let strChar = "";

    while (i < sql.length) {
      const ch = sql[i];

      if (!inStr && (ch === "'" || ch === '"')) {
        inStr = true; strChar = ch; i++; continue;
      }
      if (inStr) {
        if (ch === "\\") { i += 2; continue; }   // skip escaped char
        if (ch === strChar) { inStr = false; }
        i++; continue;
      }
      if (ch === ";") {
        results.push(sql.slice(start, i + 1));
        pos = i + 1;
        break;
      }
      i++;
    }

    // If we reached end-of-file without a semicolon, capture remainder
    if (i >= sql.length) {
      results.push(sql.slice(start));
      break;
    }
  }

  return results;
}

/**
 * Given one complete INSERT statement string, return a list of column→value maps.
 * Handles both:
 *   INSERT INTO `tbl` (`col1`,`col2`) VALUES (...),(...)
 *   INSERT INTO `tbl` VALUES (...),(...)
 */
function parseStatement(stmt: string, fallbackCols: Map<string, number>): Map<string, string>[] {
  const rows: Map<string, string>[] = [];

  // Find column list (if present) between the table name and VALUES
  const valuesIdx = stmt.toUpperCase().indexOf("VALUES");
  if (valuesIdx === -1) return rows;

  const header = stmt.slice(0, valuesIdx);
  const body   = stmt.slice(valuesIdx + 6); // after "VALUES"

  // Try to extract column names from `(col1, col2, ...)` in header
  let colMap: Map<string, number>;
  const colListMatch = /\(([^)]+)\)\s*$/.exec(header);
  if (colListMatch) {
    colMap = new Map();
    colListMatch[1]
      .split(",")
      .map((c) => c.trim().replace(/`/g, ""))
      .forEach((name, i) => colMap.set(name, i));
  } else {
    colMap = fallbackCols;
  }

  // Extract each (...) value group from body, respecting quoted strings
  let i = 0;
  while (i < body.length) {
    // Skip to next '('
    while (i < body.length && body[i] !== "(") i++;
    if (i >= body.length) break;
    i++; // skip '('

    // Collect chars until matching ')'
    const cells: string[] = [];
    let cur    = "";
    let inStr  = false;
    let strCh  = "";
    let depth  = 1;

    while (i < body.length && depth > 0) {
      const ch = body[i];

      if (!inStr && (ch === "'" || ch === '"')) {
        inStr = true; strCh = ch; i++; continue;
      }
      if (inStr) {
        if (ch === "\\") { i += 2; continue; }
        if (ch === strCh) { inStr = false; i++; continue; }
        cur += ch; i++; continue;
      }
      if (ch === "(") { depth++; cur += ch; i++; continue; }
      if (ch === ")") {
        depth--;
        if (depth === 0) { cells.push(cur.trim()); break; }
        cur += ch; i++; continue;
      }
      if (ch === "," && depth === 1) {
        cells.push(cur.trim());
        cur = "";
        i++;
        continue;
      }
      // Strip NULL keyword
      if (!inStr && body.slice(i, i + 4).toUpperCase() === "NULL") {
        cells.push("");
        i += 4;
        cur = "";
        continue;
      }
      cur += ch; i++;
    }
    i++; // skip closing ')'

    if (cells.length > 0) {
      const row = new Map<string, string>();
      colMap.forEach((idx, name) => row.set(name, cells[idx] ?? ""));
      rows.push(row);
    }
  }

  return rows;
}

/** Build a column-name → index map from a CREATE TABLE statement. */
function parseCreateTable(sql: string, table: string): Map<string, number> {
  const map = new Map<string, number>();
  // Try: with backticks, with IF NOT EXISTS, without backticks — all combinations
  const tPat = `(?:${BT}${table}${BT}|${table})`;
  const pat  = `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${tPat}[^(]*\\(([\\s\\S]*?)\\)\\s*(?:ENGINE|DEFAULT|;)`;
  const re   = new RegExp(pat, "i");
  const m    = re.exec(sql);
  if (!m) return map;

  let idx = 0;
  for (const line of m[1].split("\n")) {
    const t = line.trim().toUpperCase();
    if (t.startsWith("KEY") || t.startsWith("PRIMARY") ||
        t.startsWith("UNIQUE") || t.startsWith("INDEX")) continue;
    const col = /^\s*`?(\w+)`?/.exec(line.trim());
    if (col && col[1].toUpperCase() !== "CONSTRAINT") map.set(col[1], idx++);
  }
  return map;
}

/** Parse all INSERT rows for a given table. */
function parseInserts(sql: string, table: string, fallbackCols: Map<string, number>): Map<string, string>[] {
  const stmts = findInsertStatements(sql, table);
  const all: Map<string, string>[] = [];
  for (const stmt of stmts) {
    all.push(...parseStatement(stmt, fallbackCols));
  }
  return all;
}

function str(row: Map<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row.get(k);
    if (v != null && v !== "") return v.trim();
  }
  return "";
}

function num(row: Map<string, string>, ...keys: string[]): number {
  return parseInt(str(row, ...keys), 10) || 0;
}

// ── Main parser ────────────────────────────────────────────────────────────

export function parsePmbDump(sql: string): PmbDump {
  const noticesCols      = parseCreateTable(sql, "notices");
  const authorsCols      = parseCreateTable(sql, "authors");
  const authNoticesCols  = parseCreateTable(sql, "authors_notices");
  const responsibCols    = parseCreateTable(sql, "responsability");
  const pubCols          = parseCreateTable(sql, "publishers");
  const pubNoticesCols   = parseCreateTable(sql, "publishers_notices");
  const catCols          = parseCreateTable(sql, "categories");
  const catNoticesCols   = parseCreateTable(sql, "notices_categories");
  const exemplCols          = parseCreateTable(sql, "exemplaires");
  const pretCols            = parseCreateTable(sql, "pret");
  const pretArchiveCols     = parseCreateTable(sql, "pret_archive");
  const emprCols            = parseCreateTable(sql, "empr");
  const emprCategCols       = parseCreateTable(sql, "empr_categ");
  const emprCustomCols      = parseCreateTable(sql, "empr_custom");
  const emprCustomValsCols  = parseCreateTable(sql, "empr_custom_values");
  const docsTypeCols        = parseCreateTable(sql, "docs_type");
  const docsLocCols      = parseCreateTable(sql, "docs_location");
  const docsSecCols      = parseCreateTable(sql, "docs_section");
  const lendersCols      = parseCreateTable(sql, "lenders");
  const noticesLangCols  = parseCreateTable(sql, "notices_langues");

  // id → label: docs_type  (idtyp_doc → tdoc_libelle)
  const docsTypeMap = new Map<string, string>();
  for (const r of parseInserts(sql, "docs_type", docsTypeCols)) {
    const id    = str(r, "idtyp_doc");
    const label = str(r, "tdoc_libelle", "libelle");
    if (id && label) docsTypeMap.set(id, label);
  }

  // id → label: docs_location  (idlocation → location_libelle)
  const docsLocMap = new Map<string, string>();
  for (const r of parseInserts(sql, "docs_location", docsLocCols)) {
    const id    = str(r, "idlocation");
    const label = str(r, "location_libelle", "libelle");
    if (id && label) docsLocMap.set(id, label);
  }

  // id → label: docs_section  (idsection → section_libelle)
  const docsSecMap = new Map<string, string>();
  for (const r of parseInserts(sql, "docs_section", docsSecCols)) {
    const id    = str(r, "idsection");
    const label = str(r, "section_libelle", "libelle");
    if (id && label) docsSecMap.set(id, label);
  }

  // id → label: lenders  (idlender → lender_libelle = branch name)
  const lendersMap = new Map<string, string>();
  for (const r of parseInserts(sql, "lenders", lendersCols)) {
    const id    = str(r, "idlender");
    const label = str(r, "lender_libelle", "libelle");
    if (id && label) lendersMap.set(id, label);
  }

  // notice_id → language code from notices_langues table
  // type_langue = 0 means publication language (as shown in the PMB query)
  const noticeLangMap = new Map<number, string>();
  for (const r of parseInserts(sql, "notices_langues", noticesLangCols)) {
    const noticeId   = num(r, "num_notice", "notice_id");
    const codeLangue = str(r, "code_langue", "langue");
    const typeLangue = str(r, "type_langue");
    // type_langue = 0 = publication language; only take first match per notice
    if (noticeId > 0 && codeLangue && (typeLangue === "0" || typeLangue === "") && !noticeLangMap.has(noticeId)) {
      noticeLangMap.set(noticeId, codeLangue);
    }
  }

  const notices: PmbNotice[] = parseInserts(sql, "notices", noticesCols).map((r) => ({
    notice_id:     num(r, "notice_id"),
    // PMB uses tit1/tit2/tit3 in some versions, titre/soustitre in others
    titre:         str(r, "tit1", "titre"),
    soustitre:     str(r, "tit2", "tit3", "soustitre"),
    // code = ISBN/barcode field; some versions also have a separate isbn column
    isbn:          str(r, "code", "isbn"),
    annee:         str(r, "year", "annee"),
    npages:        str(r, "npages", "pages"),
    // notices_langues table is the primary source; fall back to inline columns
    langue:        noticeLangMap.get(num(r, "notice_id")) || str(r, "langue") || "en",
    index_l:       str(r, "index_l") || "",
    thumbnail_url: str(r, "thumbnail_url", "vign_url"),
    // typdoc is a numeric ID referencing docs_type; resolve to label if available
    notice_type:   docsTypeMap.get(str(r, "typdoc", "notice_type")) || str(r, "typdoc", "notice_type"),
    ed_note:       str(r, "ed_note", "mention_edition"),
    n_contenu:     str(r, "n_contenu", "resume", "abstract"),
    // Publisher FK stored directly in notices row as ed1_id
    ed_editeur:    num(r, "ed1_id", "ed_editeur", "publisher_id"),
    public_cible:  str(r, "public_cible", "audience"),
  })).filter((n) => n.notice_id > 0 && n.titre);

  const authors: PmbAuthor[] = parseInserts(sql, "authors", authorsCols).map((r) => ({
    author_id:        num(r, "author_id"),
    author_name:      str(r, "author_name", "author_nom", "last_name"),
    // author_rejete is used as the given/first name in many PMB installs
    author_firstname: str(r, "author_firstname", "author_prenom", "author_rejete", "first_name"),
  })).filter((a) => a.author_id > 0);

  // Prefer responsability table (this PMB version); fall back to authors_notices
  const responsabilityRows = parseInserts(sql, "responsability", responsibCols);
  const authors_notices: PmbAuthorNotice[] = (
    responsabilityRows.length > 0
      ? responsabilityRows.map((r) => ({
          notice_id:            num(r, "responsability_notice", "notice_id"),
          author_id:            num(r, "responsability_author", "author_id"),
          // type 0 = main author (AUT), others = co-author
          fonction:             str(r, "responsability_type") === "0" ? "AUT" : str(r, "responsability_type") || "AUT",
          author_display_order: num(r, "responsability_ordre", "author_display_order", "display_order"),
        }))
      : parseInserts(sql, "authors_notices", authNoticesCols).map((r) => ({
          notice_id:            num(r, "notice_id"),
          author_id:            num(r, "author_id"),
          fonction:             str(r, "fonction") || "AUT",
          author_display_order: num(r, "author_display_order", "display_order"),
        }))
  ).filter((a) => a.notice_id > 0 && a.author_id > 0);

  const publishers: PmbPublisher[] = parseInserts(sql, "publishers", pubCols).map((r) => ({
    // This PMB version uses ed_id as PK and ed_name as the publisher name
    publisher_id:   num(r, "ed_id", "publisher_id"),
    publisher_name: str(r, "ed_name", "publisher_name", "name"),
  })).filter((p) => p.publisher_id > 0);

  // publishers_notices link table (fallback for older PMB versions)
  const publishers_notices: PmbPublisherNotice[] = parseInserts(sql, "publishers_notices", pubNoticesCols).map((r) => ({
    notice_id:    num(r, "notice_id", "num_notice"),
    publisher_id: num(r, "publisher_id", "num_publisher"),
  })).filter((p) => p.notice_id > 0 && p.publisher_id > 0);

  const categories: PmbCategory[] = parseInserts(sql, "categories", catCols).map((r) => ({
    // This PMB version uses num_noeud as PK and libelle_categorie as label
    num_noeud:         str(r, "num_noeud", "categorycode", "id_categ"),
    libelle_categorie: str(r, "libelle_categorie", "libelle"),
    father:            str(r, "num_pere", "father", "parent"),
  })).filter((c) => c.libelle_categorie);

  // notices_categories: notcateg_notice → notice_id, num_noeud → category PK
  const notices_categories: PmbCategoryNotice[] = parseInserts(sql, "notices_categories", catNoticesCols).map((r) => ({
    notice_id: num(r, "notcateg_notice", "notice_id"),
    num_noeud: str(r, "num_noeud", "notcateg_categ", "categorycode"),
  })).filter((c) => c.notice_id > 0);

  const exemplaires: PmbExemplaire[] = parseInserts(sql, "exemplaires", exemplCols).map((r) => ({
    exemplaire_id:  num(r, "exemplaire_id"),
    notice_id:      num(r, "expl_notice", "notice_id"),
    cb:             str(r, "expl_cb", "cb"),
    // Build location from section + location labels
    expl_cote:      [
      docsSecMap.get(str(r, "expl_section")),
      docsLocMap.get(str(r, "expl_location")),
      str(r, "expl_cote", "cote"),
    ].filter(Boolean).join(" — ") || "",
    // Use docs_type label for condition/material-type
    expl_condition: docsTypeMap.get(str(r, "expl_typdoc")) || str(r, "expl_etat", "expl_statut") || "GOOD",
    expl_prix:      parseFloat(str(r, "expl_prix", "prix") || "0") || 0,
    expl_owner:     str(r, "expl_owner", "owner"),
    expl_location:  str(r, "expl_location"),
    expl_section:   str(r, "expl_section"),
  })).filter((e) => e.notice_id > 0);

  // ── empr_categ: borrower category table (id → label) ───────────────────
  // PMB stores empr.empr_categ as a numeric FK to empr_categ.id_categ_empr.
  // We resolve it to the human label so mapMemberType can text-match correctly.
  const emprCategMap = new Map<string, string>(); // id → libelle
  for (const r of parseInserts(sql, "empr_categ", emprCategCols)) {
    const id      = str(r, "id_categ_empr");
    const libelle = str(r, "libelle");
    if (id && libelle) emprCategMap.set(id, libelle);
  }

  // ── empr_custom: field registry (idchamp → field name) ─────────────────
  const customFieldMap = new Map<number, string>(); // idchamp → field name
  for (const r of parseInserts(sql, "empr_custom", emprCustomCols)) {
    const id   = num(r, "idchamp");
    const name = str(r, "name");
    if (id && name) customFieldMap.set(id, name.toLowerCase());
  }

  // ── empr_custom_values: actual values per borrower ──────────────────────
  // Key: `${id_empr}:${idchamp}` → empr_custom_small_text
  const customValMap = new Map<string, string>();
  for (const r of parseInserts(sql, "empr_custom_values", emprCustomValsCols)) {
    const origin = num(r, "empr_custom_origine");
    const champ  = num(r, "empr_custom_champ");
    const text   = str(r, "empr_custom_small_text");
    if (origin && champ && text) customValMap.set(`${origin}:${champ}`, text);
  }

  // Build reverse lookup: field name → champ id
  function champId(fieldName: string): number | undefined {
    for (const [id, name] of customFieldMap) {
      if (name === fieldName.toLowerCase()) return id;
    }
    return undefined;
  }

  const classChamp  = champId("empr_class")  ?? champId("class")  ?? champId("classe");
  const schoolChamp = champId("empr_school") ?? champId("school") ?? champId("ecole") ?? champId("établissement");

  const empr: PmbEmpr[] = parseInserts(sql, "empr", emprCols).map((r) => {
    // id_empr is the PMB internal PK — used as the key for custom value lookups
    const idEmpr   = num(r, "id_empr", "empr_id");
    const categRaw = str(r, "empr_categ", "categ", "categorie");
    return {
      empr_id:                    idEmpr,
      empr_nom:                   str(r, "empr_nom", "nom"),
      empr_prenom:                str(r, "empr_prenom", "prenom"),
      empr_cb:                    str(r, "empr_cb", "cb"),   // physical card barcode = student ID
      empr_mail:                  str(r, "empr_mail", "mail", "email"),
      empr_tel:                   str(r, "empr_tel", "tel", "empr_tel1", "telephone"),
      empr_adr1:                  str(r, "empr_adr1", "adresse1", "adr1"),
      empr_adr2:                  str(r, "empr_adr2", "adresse2", "adr2"),
      empr_cp:                    str(r, "empr_cp", "cp", "code_postal"),
      empr_ville:                 str(r, "empr_ville", "ville"),
      empr_categ_raw:             categRaw,
      // Resolve numeric FK → human label for mapMemberType text-matching
      empr_categ:                 emprCategMap.get(categRaw) ?? categRaw,
      empr_sexe:                  num(r, "empr_sexe", "sexe"),
      date_expiration_abonnement: str(r, "date_expiration_abonnement", "date_expiration", "expiration"),
      empr_date_adhesion:         str(r, "empr_date_adhesion", "date_adhesion", "date_inscription"),
      // Custom fields — key is id_empr (PMB internal PK) : idchamp
      school:    schoolChamp ? (customValMap.get(`${idEmpr}:${schoolChamp}`) ?? null) : null,
      className: classChamp  ? (customValMap.get(`${idEmpr}:${classChamp}`)  ?? null) : null,
    };
  }).filter((e) => e.empr_id > 0);

  // Parse pret table — active loans only (no pret_id primary key, composite key)
  let pret_counter = 0;
  const pretRows: PmbPret[] = parseInserts(sql, "pret", pretCols).map((r) => ({
    pret_id:          ++pret_counter,                          // synthetic — pret has no PK
    expl_id:          num(r, "pret_explnum", "expl_id", "exemplaire_id"),
    notice_id:        0,                                       // not stored directly; resolved via exemplaires
    empr_id:          num(r, "pret_idempr",  "empr_id", "id_empr"),
    pret_date:        str(r, "pret_date",    "date_pret",  "loan_date"),
    pret_retour:      str(r, "pret_retour",  "date_retour", "due_date"),
    pret_retour_reel: "",                                      // pret only has active loans — nothing returned
    location_origine: "0",
  })).filter((p) => p.expl_id > 0 && p.empr_id > 0);         // no pret_id filter

  // Parse pret_archive — historical loans (returned books)
  // NOT used for active loan migration, kept for future history import
  const pretArchiveRows: PmbPret[] = parseInserts(sql, "pret_archive", pretArchiveCols).map((r) => ({
    pret_id:          num(r, "arc_id", "id", "pret_id"),
    expl_id:          num(r, "arc_expl_id",    "expl_id"),
    notice_id:        num(r, "arc_expl_notice", "notice_id"),
    empr_id:          num(r, "arc_id_empr",     "empr_id"),
    pret_date:        str(r, "arc_debut",  "pret_date",  "date_pret"),
    pret_retour:      str(r, "arc_fin",    "pret_retour","date_retour"),
    pret_retour_reel: str(r, "arc_retour_reel", "retour_reel") || "",
    location_origine: str(r, "arc_expl_location_origine", "location_origine") || "1",
  })).filter((p) => p.expl_id > 0 && p.empr_id > 0);

  // Active loans = pret_archive WHERE arc_expl_location_origine = '0'
  // (confirmed by the admin query: unreturned books live in pret_archive with location_origine='0')
  // Fall back to pret table if pret_archive has no unreturned records
  const activeFromArchive = pretArchiveRows.filter((p) => String(p.location_origine).trim() === "0");
  const pret: PmbPret[] = activeFromArchive.length > 0 ? activeFromArchive : pretRows;

  const lenders   = [...lendersMap.entries()].map(([id, name]) => ({ id, name }));
  const locations = [...docsLocMap.entries()].map(([id, name]) => ({ id, name }));
  const sections  = [...docsSecMap.entries()].map(([id, name]) => ({ id, name }));

  return {
    notices, authors, authors_notices,
    publishers, publishers_notices,
    categories, notices_categories,
    exemplaires, empr, pret,
    lenders, locations, sections,
  };
}

/** Map PMB notice_type / typdoc to PVD MaterialType */
export function mapMaterialType(t: string): string {
  const s = (t ?? "").toUpperCase();
  if (["DVD","VIDEO","VHS","CD-ROM"].some((x) => s.includes(x)))      return "DVD";
  if (["AUDIO","MUSIC","CD"].some((x) => s.includes(x)))              return "AUDIO_CD";
  if (["JOURNAL","PERIODIQUE","REVUE"].some((x) => s.includes(x)))    return "JOURNAL";
  if (["MAGAZINE","MAGAZ"].some((x) => s.includes(x)))                return "MAGAZINE";
  if (["NEWS","GAZETTE"].some((x) => s.includes(x)))                  return "NEWSPAPER";
  if (["THESE","THESIS","MEMO","RAPPORT"].some((x) => s.includes(x))) return "THESIS";
  if (["MAP","CARTE","ATLAS"].some((x) => s.includes(x)))             return "MAP";
  return "BOOK";
}

/**
 * Map PMB empr_categ (borrower category code) to PVD MemberType.
 * PMB stores category codes as numbers referencing the empr_categ table.
 * Common conventions: 1=student, 2=teacher/staff, 3=public.
 * Also handles text labels in case the dump includes them.
 */
export function mapMemberType(categ: string): string {
  const s = (categ ?? "").toLowerCase().trim();
  if (["etudiant","student","eleve","sinh vien","sisanak"].some((x) => s.includes(x))) return "STUDENT";
  if (["enseignant","teacher","prof","lecturer","kru"].some((x) => s.includes(x)))     return "TEACHER";
  if (["staff","personnel","employe","neak vinh"].some((x) => s.includes(x)))          return "STAFF";
  // Numeric fallback — most PMB installs use: 1=student, 2=teacher, 3=staff, 4=public
  if (s === "1") return "STUDENT";
  if (s === "2") return "TEACHER";
  if (s === "3") return "STAFF";
  return "PUBLIC";
}

/** Map PMB language code to a standard 2-letter code */
export function mapLanguage(lang: string): string {
  const map: Record<string, string> = {
    fre: "fr", fra: "fr", french: "fr",
    eng: "en", english: "en",
    khm: "km", khmer: "km", kh: "km",
    tha: "th", thai: "th",
    vie: "vi", vietnamese: "vi",
    chi: "zh", zho: "zh", chinese: "zh",
    jpn: "ja", japanese: "ja",
    spa: "es", spanish: "es",
    ger: "de", deu: "de", german: "de",
  };
  return map[(lang ?? "").toLowerCase()] ?? (lang ?? "en").toLowerCase();
}
