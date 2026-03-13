# Legal Notice — ZLAR-CC

**Effective Date:** March 2026
**Entity:** ZLAR Inc., a corporation incorporated under the Canada Business Corporations Act (CBCA)

---

## 1. Regulatory Classification

ZLAR-CC is a deterministic, rule-based policy enforcement tool. It does not use machine learning, does not make inferences from inputs, and does not generate predictions, recommendations, or decisions. It classifies actions via string matching against human-authored rules and halts actions pending human approval.

Under the definitions established by the EU AI Act (Regulation 2024/1689, Article 3(1)), the OECD AI framework, the Colorado AI Act (SB 24-205), and other enacted AI legislation, **ZLAR-CC does not meet the definition of an "AI system."** Recital 12 of the EU AI Act explicitly excludes "systems that are based on the rules defined solely by natural persons to automatically execute operations."

ZLAR-CC is a governance tool that helps operators of AI systems manage risk. It is not itself an AI system. This distinction is legally significant: AI-specific regulatory obligations (risk tiers, transparency requirements, conformity assessments) do not apply to ZLAR-CC.

ZLAR-CC may assist AI system providers and deployers in satisfying obligations under Articles 9 (risk management), 14 (human oversight), and 15 (cybersecurity) of the EU AI Act. However, ZLAR Inc. makes no representation that use of ZLAR-CC satisfies any specific regulatory requirement. See Section 7.

---

## 2. Software Provided "As Is"

ZLAR-CC is provided "AS IS" and "AS AVAILABLE" without warranty of any kind, express or implied, including but not limited to the implied warranties of merchantability, fitness for a particular purpose, non-infringement, and any warranties arising out of course of dealing or usage of trade.

ZLAR Inc., its founders, officers, directors, employees, contributors, and agents (collectively, "ZLAR Parties") make no representations or warranties regarding:

- The completeness, accuracy, reliability, or suitability of ZLAR-CC for any purpose
- The ability of ZLAR-CC to prevent, detect, contain, or mitigate any specific threat, vulnerability, or harmful action
- The continuous, uninterrupted, error-free, or secure operation of ZLAR-CC
- The compatibility of ZLAR-CC with any specific platform, tool, model, or runtime environment, including but not limited to Anthropic's Claude Code

---

## 3. No Guarantee of Containment or Governance

**ZLAR-CC is a governance tool, not a guarantee.**

ZLAR-CC provides policy enforcement mechanisms for AI agent tool calls. It is designed to classify risk, match against human-authored policy rules, and halt actions pending human approval. However:

- **No governance system can guarantee containment.** AI agents may behave in ways that are novel, unexpected, or outside the design parameters of any enforcement mechanism.
- **ZLAR-CC does not control the AI model.** It operates at the tool-call layer. The model's reasoning, intent, and outputs are outside ZLAR-CC's enforcement surface.
- **ZLAR-CC does not replace human judgment.** It provides a structured mechanism for human review. The quality of governance depends on the policy rules you write, the approval decisions you make, and the diligence of your oversight.
- **Agentic AI is an emerging technology.** The behavior of autonomous AI systems is not fully understood by any entity — including model providers, researchers, and governance tool developers. Users acknowledge this inherent uncertainty.

### Known Limitations

ZLAR Inc. discloses the following limitations in the interest of transparency:

- ZLAR-CC governs only the tool-call layer (PreToolUse hooks). Actions taken by Claude Code outside the hooks protocol are not intercepted.
- The risk classifier uses pattern matching against known command signatures. Novel commands, obfuscated inputs, or encoding variations may not be classified correctly.
- ZLAR-CC is one layer of defense in a defense-in-depth strategy. It is not a complete security solution and should not be relied upon as the sole mechanism for AI agent governance.
- The approval channel (Telegram) depends on a third-party service. Availability, latency, and security of the approval channel are outside ZLAR Inc.'s control.
- ZLAR-CC has not undergone independent third-party security audit as of the effective date of this notice.

This disclosure is provided to ensure that users can make informed decisions. It is not an exhaustive list of all possible limitations.

---

## 4. Assumption of Risk

By downloading, installing, configuring, or using ZLAR-CC, you expressly acknowledge and agree that:

a) You understand that agentic AI systems can take actions that are unexpected, harmful, or irreversible.

b) You understand that ZLAR-CC is a risk-reduction tool, not a risk-elimination tool.

c) You assume full responsibility for all actions taken by any AI agent operating on your systems, whether or not ZLAR-CC is installed and functioning.

d) You assume full responsibility for the configuration, deployment, and maintenance of ZLAR-CC, including the authoring of policy rules, the management of cryptographic keys, and the review of approval requests.

e) You understand that ZLAR-CC has not been independently certified, audited, or validated by any regulatory body, standards organization, or third-party security firm as a sufficient governance mechanism for any particular use case, jurisdiction, or compliance requirement.

f) You are solely responsible for determining whether ZLAR-CC is appropriate for your use case, your regulatory environment, and your risk tolerance.

---

## 5. Limitation of Liability

TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL ANY ZLAR PARTY BE LIABLE FOR ANY:

- Direct, indirect, incidental, special, consequential, exemplary, or punitive damages
- Loss of profits, revenue, data, goodwill, or business opportunity
- Cost of procurement of substitute goods or services
- Damages arising from unauthorized access to or alteration of your data, systems, or transmissions
- Damages arising from the actions or failures of any AI agent, model, or system, whether or not governed by ZLAR-CC
- Damages arising from the failure of ZLAR-CC to prevent, detect, or contain any specific action, threat, or vulnerability

This limitation applies regardless of the legal theory (contract, tort, negligence, strict liability, or otherwise) and regardless of whether any ZLAR Party has been advised of the possibility of such damages.

**In jurisdictions that do not permit the exclusion or limitation of certain damages:** the aggregate liability of all ZLAR Parties for all claims arising from or related to ZLAR-CC shall not exceed the amount you paid to ZLAR Inc. for ZLAR-CC in the twelve (12) months preceding the claim, or CAD $100, whichever is greater.

---

## 6. Third-Party Dependencies

ZLAR-CC interacts with and depends upon third-party software and services, including but not limited to:

- **Anthropic's Claude Code** — the AI coding agent. ZLAR Inc. is not affiliated with, endorsed by, or responsible for Anthropic or its products.
- **Telegram** — used for approval notifications. ZLAR Inc. is not affiliated with or responsible for Telegram's service, availability, or security.
- **Node.js, npm, and open source dependencies** — ZLAR-CC uses open source libraries. ZLAR Inc. does not guarantee the security, correctness, or availability of any dependency.

ZLAR Inc. has no control over and assumes no responsibility for the behavior, availability, security, or compliance of any third-party software, service, or platform. Changes to third-party software (including breaking changes to Claude Code's hooks protocol) may affect ZLAR-CC's operation without notice.

---

## 7. No Professional Advice or Regulatory Certification

Nothing in ZLAR-CC's documentation, source code, examples, or communications constitutes:

- Legal advice
- Security consulting, assurance, or certification
- Compliance guidance for any regulatory framework, including but not limited to:
  - **Canada:** PIPEDA, OSFI guidelines, provincial privacy legislation (note: Canada's proposed AIDA was never enacted and is not currently in force)
  - **European Union:** EU AI Act, GDPR, NIS2 Directive, EU Cyber Resilience Act, EU Product Liability Directive
  - **United States:** CCPA/CPRA, Colorado AI Act, Texas TRAIGA, state AI laws, NIST AI Risk Management Framework, sector-specific regulations (HIPAA, SOX, GLBA)
  - **Asia-Pacific:** APPI (Japan), PDPA (Singapore), PIPL (China), IT Act (India)
  - **International:** ISO/IEC 42001 (AI Management Systems), ISO 27001
- A certification or representation that your AI deployment meets any standard of safety, security, or governance

**Note on NIST AI RMF:** ZLAR-CC's governance functions align with the NIST AI Risk Management Framework's "Govern" function. Compliance with NIST AI RMF provides statutory affirmative defenses in certain US jurisdictions (including Colorado and Texas). However, ZLAR Inc. does not certify that use of ZLAR-CC constitutes compliance with NIST AI RMF or any other framework.

If you require assurance that your AI governance meets regulatory requirements in your jurisdiction, consult qualified legal and security professionals.

---

## 8. Indemnification

You agree to indemnify, defend, and hold harmless all ZLAR Parties from and against any and all claims, damages, losses, liabilities, costs, and expenses (including reasonable legal fees) arising from or related to:

a) Your use of ZLAR-CC

b) Your violation of these terms or any applicable law

c) Any actions taken by AI agents operating on your systems, whether or not governed by ZLAR-CC

d) Any claim by a third party arising from your deployment of ZLAR-CC or any AI agent

e) Your failure to maintain adequate security, oversight, or configuration of ZLAR-CC or any associated system

---

## 9. Vulnerability Disclosure and Security Maintenance

ZLAR Inc. is committed to responsible vulnerability disclosure and timely patching of known security issues in ZLAR-CC. Security vulnerabilities should be reported via [GitHub's private vulnerability reporting](https://github.com/ZLAR-AI/ZLAR-CC/security/advisories). See [SECURITY.md](SECURITY.md) for our full disclosure policy.

This commitment does not create an obligation to provide ongoing maintenance, support, or updates to any version of ZLAR-CC. ZLAR-CC is open source software provided without a service level agreement. Users are responsible for monitoring for updates and applying patches to their own deployments.

---

## 10. Open Source Distribution and EU Compliance

ZLAR-CC is distributed as free, open source software under the Apache License 2.0 outside the course of a commercial activity.

Under the EU Cyber Resilience Act (entered into force December 10, 2024), non-commercial open source software is exempt from the CRA's product cybersecurity requirements. Under the revised EU Product Liability Directive (Directive 2024/2853, transposition deadline December 2026), free open source software developed or supplied outside the course of a commercial activity is excluded from strict product liability.

**ZLAR Inc. relies on these exemptions.** If ZLAR Inc. offers commercial services (paid support, enterprise features, SaaS), those commercial offerings may be subject to different legal obligations and will be governed by separate terms. The open source core distribution remains free and non-commercial.

---

## 11. Intellectual Property

ZLAR-CC is licensed under the Apache License 2.0. The license grants you specific rights to use, modify, and distribute the software, subject to its terms. The Apache 2.0 license includes its own warranty disclaimer and liability limitations, which apply in addition to those stated here.

"ZLAR," "ZLAR-CC," "ZLAR-OC," and the ZLAR name and associated marks are trademarks of ZLAR Inc. Use of these marks is subject to ZLAR Inc.'s trademark policies.

---

## 12. Data and Privacy

ZLAR-CC processes data locally on your machine. It does not transmit data to ZLAR Inc. or any ZLAR-controlled server. However:

- ZLAR-CC generates audit logs and records of agent actions on your local filesystem.
- ZLAR-CC sends approval requests to your Telegram account, which involves transmission of action descriptions over Telegram's network.
- You are solely responsible for the handling, storage, and protection of any data processed or logged by ZLAR-CC, including any personal data, credentials, or sensitive information that may appear in audit logs or approval requests.

ZLAR Inc. does not collect, store, or process your data through ZLAR-CC.

---

## 13. Export Compliance

ZLAR-CC includes cryptographic functionality (Ed25519 signing and verification). You are responsible for compliance with all applicable export control laws and regulations in your jurisdiction, including but not limited to Canadian export controls, U.S. Export Administration Regulations (EAR), and EU dual-use regulations.

---

## 14. Governing Law and Jurisdiction

These terms shall be governed by and construed in accordance with the laws of the Province of Ontario and the federal laws of Canada applicable therein, without regard to conflict of law principles.

Any dispute arising from or relating to ZLAR-CC or these terms shall be subject to the exclusive jurisdiction of the courts of the Province of Ontario, Canada.

Before initiating any legal proceeding, the parties agree to attempt good-faith resolution through written communication for a period of not less than thirty (30) days.

---

## 15. Severability

If any provision of this notice is held to be unenforceable or invalid, that provision shall be modified to the minimum extent necessary to make it enforceable, or if modification is not possible, severed. The remaining provisions shall continue in full force and effect.

---

## 16. Entire Agreement

This legal notice, together with the Apache License 2.0, constitutes the entire agreement between you and ZLAR Inc. regarding ZLAR-CC. It supersedes all prior or contemporaneous communications, representations, or agreements, whether oral or written.

---

## 17. Changes to This Notice

ZLAR Inc. reserves the right to modify this legal notice at any time. Changes will be reflected in the repository and on [zlar.ai](https://zlar.ai). Continued use of ZLAR-CC after changes constitutes acceptance.

---

## 18. Contact

**ZLAR Inc.**
Email: [hello@zlar.ai](mailto:hello@zlar.ai)
Web: [zlar.ai](https://zlar.ai)

---

*This legal notice supplements the Apache License 2.0 under which ZLAR-CC is distributed. In the event of any conflict between this notice and the Apache License 2.0, the terms that provide greater protection to ZLAR Inc. and the ZLAR Parties shall apply to the maximum extent permitted by law.*
