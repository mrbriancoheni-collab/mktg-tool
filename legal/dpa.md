# Data Processing Agreement

> **Template notice:** This DPA reflects GDPR Article 28 and common US state-law service-provider terms. Have counsel review it, attach the EU Standard Contractual Clauses and UK Addendum where you transfer data internationally, and replace every [BRACKETED] placeholder.

This Data Processing Agreement ("**DPA**") forms part of the Terms of Service between [COMPANY LEGAL NAME] ("**Processor**") and the Customer ("**Controller**").

## 1. Definitions
"**Personal Data**", "**Processing**", "**Data Subject**", "**Personal Data Breach**" and "**Supervisory Authority**" have the meanings given in the GDPR. "**Data Protection Laws**" means the GDPR, the UK GDPR, the Swiss FADP, the CCPA/CPRA and other applicable privacy laws.

## 2. Details of processing (Annex I)
| | |
|---|---|
| **Subject matter** | Provision of the AdCanvas service |
| **Duration** | The term of the Terms, plus the deletion period in Section 10 |
| **Nature and purpose** | Hosting, storage, analysis, AI generation, syncing with integrations, and reporting, as instructed by Controller |
| **Data subjects** | Controller's users; Controller's prospects and customers, to the extent their data appears in imported or synced data |
| **Categories of data** | Names, business contact details, user identifiers, advertising and campaign identifiers, aggregated performance metrics, and any personal data Controller includes in boards, comments or uploads |
| **Special categories** | None. Controller agrees not to submit them. |

## 3. Processor obligations
Processor will:
1. Process Personal Data only on Controller's documented instructions (these Terms and Controller's use of the Service), unless the law requires otherwise, in which case Processor will inform Controller where legally permitted.
2. Make sure that personnel authorized to process Personal Data are bound by confidentiality.
3. Implement the technical and organizational measures in **Annex II**.
4. Assist Controller with data subject requests, security, breach notifications, data protection impact assessments and prior consultations, taking into account the nature of the processing.
5. Notify Controller **without undue delay, and in any event within [48] hours**, after becoming aware of a Personal Data Breach affecting Controller's data, with the information reasonably needed to meet Controller's obligations.
6. Make available the information necessary to demonstrate compliance, and allow audits. Audits will be satisfied first by Processor's then-current third-party certifications or reports, and otherwise will take place no more than once a year on [30] days' notice, at Controller's cost.

## 4. Subprocessors
Controller gives general authorization for the subprocessors listed at [/legal/subprocessors](/legal/subprocessors). Processor will give at least [30] days' notice of new subprocessors, and Controller may object on reasonable data protection grounds. Processor imposes data protection terms on each subprocessor that are no less protective than this DPA, and remains responsible for their performance.

**Integrations that Controller enables** (for example Slack, ad platforms or CRMs) are Controller-directed recipients, not Processor's subprocessors.

## 5. International transfers
Where Personal Data is transferred from the EEA, the UK or Switzerland to a country without an adequacy decision, the parties incorporate the **EU Standard Contractual Clauses (Module 2, and Module 3 where applicable)**, the **UK International Data Transfer Addendum**, and any Swiss amendments, as further described in [ANNEX III].

## 6. CCPA/CPRA service-provider terms
Processor will not sell or share Personal Data. It will not retain, use or disclose Personal Data outside the direct business relationship or for any purpose other than performing the Service, and will not combine it with other data except as the CCPA permits. Processor will comply with the CCPA and notify Controller if it can no longer meet its obligations.

## 7. Deletion and return
When the Service ends, and at Controller's choice, Processor will return or delete Personal Data within [30] days. Backups will be deleted within [35] days, unless the law requires storage. In-app export and deletion tools are available at any time.

## Annex II — Technical and organizational measures
- Encryption in transit (TLS 1.2+) and at rest. Integration credentials are encrypted at the application level.
- Role-based access control, least privilege, multi-factor authentication for administrative access, and access logging.
- Logical separation of customer workspaces.
- Unguessable share-link tokens that the owner can revoke.
- Vulnerability management, dependency patching, and [annual] penetration testing.
- Backups with tested restore, and a documented incident response plan.
- Vendor due diligence for subprocessors.
- Employee confidentiality agreements and security training.

[Signature blocks, if executed separately]
