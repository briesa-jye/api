# Pack review, 2026-11-23

**Reviewer:** Claude (an AI model), desk review against primary sources.
**This is not professional sign-off.** Both packs stay `draft` with `reviewer: null`. A qualified practitioner must still verify them before they are marked `beta` or `verified`. This review is meant to shorten that person's work: check the findings below instead of starting from nothing.

Sources that could not be read: AustLII and legislation.gov.au block automated access (not worked around). The model WHS Act was read from Safe Work Australia's published PDF (December 2025 version). Jurisdictions' own in-force Acts were not read.

## whs-incident-notification (0.1.0 to 0.2.0)

Verified against sources and kept:
- Notify immediately by the fastest means, by telephone or in writing (model Act s 38).
- Preserve the site, with the carve-outs for helping an injured person, removing a deceased person, making the site safe, and police investigations (s 39).
- Regulator names for NSW, QLD, SA, WA, TAS and NT match Safe Work Australia's directory (not yet checked against each regulator's own page).

Corrected:
- **ACT phone number.** The pack used Safe Work Australia's directory number (02 6207 1923). WorkSafe ACT's own page says 13 22 81 (business hours), 0419 120 028 (after hours), or the online form. The pack now uses the regulator's page.
- **`written-notice-followup`** was marked unverified. Model Act s 38(4)(b) and the WorkSafe ACT page confirm written notice within 48 hours of the regulator requiring it. Now active and sourced.
- **Missing duty:** keep a record of each notifiable incident for at least 5 years from the notice date (s 38(7)). Added as obligation `keep-incident-record`.
- **Site preservation** was described as the notifier's duty. It falls on the person with management or control of the workplace, who may differ from the notifier. Wording corrected.
- **Notifiable incident** applies to the death or injury of any person (customers and the public included), arising out of the conduct of the business. Wording corrected.
- **ACT sexual assault** has been notifiable since 9 June 2023. Added rule `act-sexual-assault-notifiable`.

Not fixed, needs a decision or a human (also in RULES_TO_VERIFY.md):
1. `effective_from: 2020-01-01` is a placeholder on every rule.
2. (Done in 0.3.0, below.) The caller decided whether serious-injury and dangerous-incident criteria were met.
3. Rule `december-2025-amendments-not-yet-law` is wrong for the ACT. Other jurisdictions' adoption is unconfirmed (search results suggest NSW was still considering them and QLD had a violent-incidents bill before Parliament; unverified).
4. Other regulators' phone numbers are unchecked against their own pages.
5. Victoria and Commonwealth are still not encoded.

## real-estate-aml (0.1.0 to 0.2.0)

Verified against AUSTRAC pages and kept:
- SMR deadlines: 24 hours for terrorism financing, 3 business days otherwise (Act s 41(2)).
- Initial CDD records kept 7 years after the relationship ends or the last occasional transaction.
- Beneficial owner: owns 25% or more, or otherwise controls the customer.
- Foreign PEP: enhanced CDD, and source of funds and wealth established in initial CDD.
- Obligations apply from 1 July 2026.

Promoted from needs-review (now active, sourced):
- **Enrolment**: newly regulated businesses had to enrol by 29 July 2026 (that date has passed).
- **AML/CTF program and compliance officer** required from 1 July 2026. What the program must contain is not encoded.

Still needs review: `ongoing-cdd`, and the `foreign-person-risk-factor` rule (no source says foreign-person status changes CDD).

Not covered: the AML/CTF Act and Rules text itself (only AUSTRAC's guidance was read), table 6 item 3, simplified CDD, delayed CDD, threshold transaction reports, third-party reliance.

## whs-incident-notification 0.3.0: statutory categories encoded

- New optional inputs `injury_categories` (model Act s 36) and `dangerous_incident_categories` (s 37). The API now checks the caller's selection against the statutory lists instead of trusting a yes/no. The old `serious_injury_criteria_met` still works when the new field is absent.
- Categories added in December 2025 (pelvis, skull and facial fractures, other serious fractures, serious crush injuries, serious brain injuries from blows, mobile plant incidents, serious falls) are **notifiable in the ACT** (in force 19 November 2025) and return **needs_information** elsewhere, so the API never reports "not notifiable" for them where adoption is unconfirmed.
- `none_of_these` returns not_notifiable only on the caller's say-so, and the reason tells them to check for injuries or incidents prescribed by their jurisdiction's regulations.
- **Bug found and fixed:** an injury with no criteria supplied, or a dangerous incident with no `serious_risk_exposed`, silently defaulted to **not_notifiable**. Both now return needs_information.
- The website playground now renders multi-select fields (it only supported single values).
- 10 new scenarios (22 in total).
- **Found while testing the dashboard's date comparison:** an ACT fracture assessed for a date before 19 November 2025 fell through to "not notifiable" and also told the user to notify WorkSafe ACT. Fixed: before that date it returns needs_information ("check older categories, for example in-patient treatment"), and the regulator rule for the new categories has its own effective date. 11 new scenarios in total (23).
