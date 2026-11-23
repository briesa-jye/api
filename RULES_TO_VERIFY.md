# Rules to verify

Nothing below is guessed into a rule. Items are either marked `status: needs_review` in a pack (never applied to an outcome) or not encoded at all. Both real packs are `draft` with no reviewer: a qualified person must verify them against the legislation before they are presented as production-ready.

Primary-source note: AUSTRAC and Safe Work Australia pages were read in a browser on 2026-11-22. Legislation text itself (AML/CTF Act 2006 as amended, AML/CTF Rules 2025, model WHS Act, state and territory WHS Acts) could not be read in this session (federal register viewer did not render; NSW legislation site blocked automated access). Section numbers are those the guidance pages cite.

## real-estate-aml

### Needs-review items in the pack
- Rule `foreign-person-risk-factor`: no source read says foreign-person status changes CDD. Confirm whether and how it should matter (it would be an AUSTRAC risk factor, a FIRB matter, or neither).
- Obligation `ongoing-cdd`: not read.

### Not encoded (needs reading and rules)
- Which real estate activities are table 6 item 1 services. The pack asks the caller (`directly_advances_transaction`, `transaction_exists`). Whether appraisals, marketing, open homes, property management and rental activity are within item 1 is not decided here. Search results mention that the Rules exclude item 3 for rental income managed through an agency trust account; not read.
- Item 3 (receiving, holding, controlling or managing property such as deposits in a trust account): not assessed.
- Simplified CDD conditions and deemed compliance (Act s 31, Rules s 6-16) by customer type.
- Delayed initial CDD (when the service may start before CDD completes).
- Ongoing CDD, including trigger events and review frequency.
- PEP handling beyond foreign PEPs: when a domestic or international organisation PEP is "high risk"; PEP definitions; senior management approval requirements (if any).
- Targeted financial sanctions: what must happen on a designation (the pack only escalates).
- Transaction value: the schema accepts `transaction_value_aud` but no rule uses it. No numeric threshold has been verified for real estate. Threshold transaction reports (physical currency) not read.
- Third-party reliance, nested services relationships, agents and town agents.
- Whether customers include both buyer and seller for a given engagement (AUSTRAC says the customer is the person you directly assist or act for).
- Foreign-person (FIRB) interactions, if any.
- Commencement: rules use effective_from 2026-07-01 per AUSTRAC's page ("AML/CTF obligations apply if you provide a designated service in table 6 from 1 July 2026"). Confirm transitional provisions.

## whs-incident-notification

### Needs-review items in the pack
- None. See REVIEW.md for the items found in the 2026-11-23 desk review.

### Not encoded (needs reading and rules)
- The statutory definitions of "serious injury or illness" and "dangerous incident" (model WHS Act ss 35-37 as cited in Safe Work Australia summaries) and each jurisdiction's equivalent. The pack asks the caller whether the criteria are met and does not check them.
- Whether each of ACT, NSW, NT, QLD, SA, TAS and WA has adopted the model provisions without material variation. The pack applies model-based rules to all seven. Safe Work Australia's pages did not list adoption.
- Victoria: the pack returns `needs_information` and points to WorkSafe Victoria. Victorian requirements (and any difference in timeframes and definitions) are not encoded.
- Commonwealth (Comcare) workplaces: the platform has no Commonwealth jurisdiction code, so these are not covered.
- December 2025 model amendments (dangerous incidents involving mobile plant and falls, serious brain and crush injuries and fractures, violent incidents, suicide or attempted suicide, extended absences of 15 or more consecutive calendar days): only flagged. Track adoption by each jurisdiction and encode when in force.
- Duties of PCBUs at a shared workplace to notify each other; who counts as a "worker" for suicide and extended absence notifications.
- Regulator notification channels beyond phone numbers (online forms), and phone numbers should be re-checked before verification.
- Record-keeping and preservation duties beyond the construction records obligation listed.

## Found in the 2026-11-23 desk review (see REVIEW.md)
- WHS start dates: the `2020-01-01` placeholder is replaced with the dates Safe Work Australia gives for when each jurisdiction implemented the model laws (ACT, NSW, NT, QLD 1 January 2012; SA, TAS 1 January 2013; WA 31 March 2022). A practitioner should check: (1) that the incident notification provisions started with the Act in each jurisdiction, (2) that the wording encoded (immediate notice, site preservation, 48 hour written notice, 5 year records) matched the original 2012/2013 text, since only the December 2025 text was read, and (3) WA's "version of the model laws" for any difference.
- WHS regulator contact rules carry the start date of the law but their phone numbers are today's, so a backdated assessment shows today's numbers.
- WHS: injury and dangerous-incident categories are now encoded (`injury_categories`, `dangerous_incident_categories`, model Act ss 36-37). A practitioner should check: (1) the split between categories treated as long-standing and categories treated as added in December 2025 (the explanatory memorandum is clear for fractures, crush and brain injuries, mobile plant and serious falls; `spinal_injury` and `serious_head_injury` are treated as long-standing and should be confirmed against a pre-amendment Act); (2) each jurisdiction's in-force wording of ss 36-37 and any prescribed injuries or incidents in its regulations; (3) the objective test "would ordinarily require immediate treatment", which the API leaves to the caller's selection.
- WHS: rule `december-2025-amendments-not-yet-law` is wrong for the ACT, where key incident notification changes commenced on 19 November 2025 and sexual assault has been notifiable since 9 June 2023. Check what each jurisdiction has adopted (NSW and QLD were still considering the changes; check every jurisdiction).
- WHS: regulator phone numbers other than the ACT's still come from Safe Work Australia's directory only. Check each against the regulator's own page. Safe Work Australia's directory and WorkSafe ACT's own page disagreed for the ACT.
- WHS: the 48 hour written-notice rule and the 5 year record rule were read in the December 2025 model text. Confirm each jurisdiction's in-force Act has the same wording.
- Real estate: `ongoing-cdd` and `foreign-person-risk-factor` are still unread and not applied.
