# Rules to verify

Nothing below is guessed into a rule. Items are either marked `status: needs_review` in a pack (never applied to an outcome) or not encoded at all. Both real packs are `draft` with no reviewer: a qualified person must verify them against the legislation before they are presented as production-ready.

Primary-source note: AUSTRAC and Safe Work Australia pages were read in a browser on 2026-11-22. Legislation text itself (AML/CTF Act 2006 as amended, AML/CTF Rules 2025, model WHS Act, state and territory WHS Acts) could not be read in this session (federal register viewer did not render; NSW legislation site blocked automated access). Section numbers are those the guidance pages cite.

## real-estate-aml

### Needs-review items in the pack
- Rule `foreign-person-risk-factor`: no source read says foreign-person status changes CDD. Confirm whether and how it should matter (it would be an AUSTRAC risk factor, a FIRB matter, or neither).
- Obligation `enrol-with-austrac`: the 29 July 2026 enrolment deadline appeared only in a search-result summary. Confirm on the AUSTRAC page.
- Obligation `aml-ctf-program-and-compliance-officer`: reported as required from 1 July 2026. Confirm from the Act, and what the program must contain.
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
- Rule `written-notice-followup`: written notice after immediate notification. Timeframe not read.

### Not encoded (needs reading and rules)
- The statutory definitions of "serious injury or illness" and "dangerous incident" (model WHS Act ss 35-37 as cited in Safe Work Australia summaries) and each jurisdiction's equivalent. The pack asks the caller whether the criteria are met and does not check them.
- Whether each of ACT, NSW, NT, QLD, SA, TAS and WA has adopted the model provisions without material variation. The pack applies model-based rules to all seven. Safe Work Australia's pages did not list adoption.
- Victoria: the pack returns `needs_information` and points to WorkSafe Victoria. Victorian requirements (and any difference in timeframes and definitions) are not encoded.
- Commonwealth (Comcare) workplaces: the platform has no Commonwealth jurisdiction code, so these are not covered.
- December 2025 model amendments (dangerous incidents involving mobile plant and falls, serious brain and crush injuries and fractures, violent incidents, suicide or attempted suicide, extended absences of 15 or more consecutive calendar days): only flagged. Track adoption by each jurisdiction and encode when in force.
- Duties of PCBUs at a shared workplace to notify each other; who counts as a "worker" for suicide and extended absence notifications.
- Regulator notification channels beyond phone numbers (online forms), and phone numbers should be re-checked before verification.
- Record-keeping and preservation duties beyond the construction records obligation listed.
