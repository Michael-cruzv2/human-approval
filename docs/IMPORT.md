# IMPORT.md: optional Excel upload

Purpose: add leads that did not come from LeadSearch, or re-add rows from a LeadSearch run workbook. Any authenticated, active user may upload. Not authenticated means no upload (R15).

## Limits and validation
- `.xlsx` only (check extension, MIME and file signature `PK`). Reject `.xlsm`, `.xls`, `.csv`, macros, encrypted files.
- Max file size 5 MB, max 2,000 data rows, max 1 sheet read (the sheet named `Leads`, else the first sheet).
- Parse server-side with `exceljs` (read current docs). Never execute or evaluate formulas: treat a formula string as plain text and sanitise it; do not use its cached result.
- Import uses a preview/commit flow. Preview parses and validates the workbook without storing it. Commit requires the same file again, verifies a proof bound to the current session, compares its SHA-256 with the preview, then re-parses and validates it before writing.
- Header row required. Header names are matched case-insensitively after trimming. Unknown columns are ignored. Missing required columns reject the whole file.
- Required columns: `domain`, `website_url`. Everything else optional.
- Trim all strings, cap each cell at 2,000 characters, strip control characters.
- Domain: lowercase, remove scheme/path/`www.`; must look like a registered domain; reject IPs, `localhost`, `myshopify.com` domains.
- Email: basic RFC-style check, lowercase. Phone: free text up to 40 chars.
- `phones_json` is an array of phone strings, in workbook order; `phone` is the first value.
- Email is the only contact value shown in review lists and details. A row without an email may still be imported, but it has no contact email and is excluded from the mailer's ready-to-queue view.
- Country must be ISO alpha-2 if present, else set `NULL`.
- `screening_status` (or `antispam_tag`) must be one of `OPT_OUT_REGIME`, `CONDITIONAL`, `CONSENT_REQUIRED`, `VARIES_REVIEW`, `UNKNOWN_REVIEW`; anything else becomes `UNKNOWN_REVIEW`.

## Column mapping (file column to `leads` column)
| File column | `leads` column | Note |
|---|---|---|
| `domain` | `domain` | required, normalised |
| `website_url` | `site_url` | required |
| `company_name` | `company_name` | |
| `emails` | `email` + `emails_json` | semicolon-separated; first valid = `email`; all valid stored in `emails_json` |
| `email_types` | `email_type` + `emails_json` | semicolon-separated, same order as `emails` |
| `phones` | `phone` + `phones_json` | semicolon-separated; first = `phone` |
| `address`, `country`, `country_confidence`, `language`, `currency` | same names | |
| `contact_page_url` | `contact_page_url` | |
| `socials` | `socials` | stored as `{"raw": "<text>"}` |
| `shopify_evidence`, `no_app_evidence` | **ignored** | R10 prohibits Review App writes to evidence columns |
| `anti_spam_regime` | `anti_spam_regime` | |
| `screening_status` | `antispam_tag` | validated as above |
| `screening_notes` | `antispam_note` | |
| `source_query`, `found_on` | same names | |
| `review_reasons` | **ignored** | R10 prohibits Review App writes to `agent_reason` |
| `status`, `human_check`, `run_id`, `created_at`, `lead_id`, `exported_at` | **ignored** | never trusted |

Fixed values on every imported row: `agent_approval = 'NEEDS_REVIEW'`, `human_approval = 'PENDING'`, `human_approved_by/at = NULL`, `source_run_id = NULL`, `archived = false`, `contacted = false`.

## Insert behaviour
- One transaction per file. `INSERT ... ON CONFLICT (domain) DO NOTHING`. Never update existing leads from a file (R20).
- Count inserted, skipped (already exists) and invalid rows. Invalid rows are reported by row number and reason (`MISSING_DOMAIN`, `BAD_DOMAIN`, `BAD_EMAIL`, ...). Do not echo contact data back; show the domain only.
- If more than 50% of rows are invalid, roll back the whole file and show the reason.
- Write one `audit_log` row (`entity = 'import'`, `action = 'IMPORT'`) with the user, row counts, and a SHA-256 of the file. Do not store the file.
- Rate limit: max 10 committed imports per user per hour. Preview requests do not create rows or consume the commit quota.

## Template
Provide a "Download template" that returns a generated `.xlsx` with the headers above and one example row marked as an example. Sanitise per R21.

## Not allowed
- Importing approvals, statuses or sending state.
- Importing drafts (the Drafter owns drafts).
- Storing the uploaded file anywhere.
